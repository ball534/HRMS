import { google } from 'googleapis'
import { Readable } from 'stream'

const SCOPES = ['https://www.googleapis.com/auth/drive']

function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
    clientOptions: {
      subject: process.env.GOOGLE_IMPERSONATE_EMAIL || 'jin@tictag.io',
    },
  })
  return auth
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() })
}

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!

// Cache folder IDs to avoid repeated lookups
const folderCache = new Map<string, string>()

/**
 * Find or create a folder by name inside a parent folder.
 */
async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)!

  const drive = getDrive()

  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (res.data.files && res.data.files.length > 0) {
    const id = res.data.files[0].id!
    folderCache.set(cacheKey, id)
    return id
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })

  const id = folder.data.id!
  folderCache.set(cacheKey, id)
  return id
}

/**
 * Ensure a nested folder path exists and return the leaf folder ID.
 * e.g. ensureFolderPath(['Expenses', 'Pending Approval'])
 */
async function ensureFolderPath(path: string[]): Promise<string> {
  let parentId = ROOT_FOLDER_ID
  for (const segment of path) {
    parentId = await findOrCreateFolder(segment, parentId)
  }
  return parentId
}

/**
 * Upload a file to Google Drive.
 * Returns the file ID.
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderPath: string[],
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDrive()
  const folderId = await ensureFolderPath(folderPath)

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  })

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink ?? '',
  }
}

/**
 * Generate a download/view URL for a file.
 * Returns a proxy URL that streams the file through our API
 * (avoids needing to make files public on Google Drive).
 */
export async function getDownloadUrl(fileId: string): Promise<string> {
  return `/api/files/${fileId}`
}

/**
 * Move a file from one folder to another.
 * Used when expense status changes (Pending → Approved → Reimbursed).
 */
export async function moveFile(
  fileId: string,
  newFolderPath: string[],
): Promise<void> {
  const drive = getDrive()
  const newFolderId = await ensureFolderPath(newFolderPath)

  // Get current parents
  const file = await drive.files.get({
    fileId,
    fields: 'parents',
  })

  const previousParents = (file.data.parents ?? []).join(',')

  await drive.files.update({
    fileId,
    addParents: newFolderId,
    removeParents: previousParents,
    fields: 'id, parents',
  })
}

/**
 * Delete a file from Google Drive.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDrive()
  await drive.files.delete({ fileId })
}

/**
 * Get the folder path for an expense based on its status.
 */
export function getExpenseFolderPath(
  status: 'PENDING' | 'APPROVED' | 'REIMBURSED',
  date?: Date,
): string[] {
  if (status === 'PENDING') {
    return ['Expenses', 'Pending Approval']
  }

  const d = date ?? new Date()
  const monthFolder = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  if (status === 'APPROVED') {
    return ['Expenses', 'Approved', monthFolder]
  }

  return ['Expenses', 'Reimbursed', monthFolder]
}

const CATEGORY_FOLDER: Record<string, string> = {
  CONTRACTS: 'Contracts',
  PAYSLIPS: 'Payslips',
  MEDICAL: 'Medical',
  CERTIFICATIONS: 'Certifications',
  PERSONAL_DOCS: 'Personal Docs',
  OTHER: 'Other',
}

/**
 * Folder path for a single-destination upload (one employee, or company-wide).
 */
export function getDocumentFolderPath(
  scope: 'COMPANY' | 'EMPLOYEE',
  employeeName?: string,
  category: string = 'OTHER',
): string[] {
  const categoryFolder = CATEGORY_FOLDER[category] ?? 'Other'
  if (scope === 'COMPANY') {
    return ['Documents', 'Company', categoryFolder]
  }
  return ['Documents', employeeName ?? 'Unknown', categoryFolder]
}

/**
 * Folder path for a mass-push upload (1 file → many employees).
 * Stored once under Shared/ and referenced by N Document rows in the DB.
 */
export function getSharedDocumentFolderPath(category: string = 'OTHER'): string[] {
  const categoryFolder = CATEGORY_FOLDER[category] ?? 'Other'
  return ['Documents', 'Shared', categoryFolder]
}
