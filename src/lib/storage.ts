import 'server-only'

import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'

/**
 * File storage.
 *
 * Files used to live in Google Drive. They now live in Postgres, in the
 * `FileBlob` table. Nothing in the application talks to the database about file
 * bytes directly — it all goes through the `StorageDriver` interface below, so
 * moving to S3, R2 or anything else later is a new driver rather than a sweep
 * through every upload and download site.
 *
 * Two properties worth understanding before using it:
 *
 * **Content addressing.** `put()` hashes the bytes and reuses an existing row
 * when the hash matches, so uploading the same PDF twice stores it once. This
 * is what makes the mass-push document flow safe: previously N employees shared
 * a single physical Drive file, and one of them deleting "their" copy could bin
 * the original out from under everyone else.
 *
 * **Reference counting.** `put()` hands you one reference. Every additional
 * record that points at the same blob must `addRef()`, and every record that
 * stops pointing at it must `release()`. Bytes are deleted only when the last
 * reference goes. Get this wrong in the safe direction — a leaked reference
 * wastes space; a missing one deletes someone's payslip.
 */

export type StoredFile = {
  blobId: string
  sha256: string
  fileSize: number
  mimeType: string
  /** True when the bytes already existed and this is a second reference to them. */
  deduped: boolean
}

export type FetchedFile = {
  data: Buffer
  mimeType: string
  fileSize: number
  sha256: string
}

export interface StorageDriver {
  /** Store bytes and take one reference. Reuses an existing blob on hash match. */
  put(data: Buffer, mimeType: string): Promise<StoredFile>
  /** Fetch bytes. Null when the blob is gone. */
  get(blobId: string): Promise<FetchedFile | null>
  /** Take an additional reference (a second record pointing at the same blob). */
  addRef(blobId: string): Promise<void>
  /** Give up a reference. Deletes the bytes when none remain. */
  release(blobId: string): Promise<void>
}

function sha256Of(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

// ============================================================
// Postgres driver
// ============================================================

const postgresDriver: StorageDriver = {
  async put(data, mimeType) {
    const sha256 = sha256Of(data)

    // Content-addressed upsert. On a hash collision with identical content
    // (which is what a SHA-256 match means in practice) we take a reference to
    // the existing row instead of storing the bytes again.
    const existing = await db.fileBlob.findUnique({
      where: { sha256 },
      select: { id: true, fileSize: true, mimeType: true },
    })

    if (existing) {
      await db.fileBlob.update({
        where: { id: existing.id },
        data: { refCount: { increment: 1 } },
      })
      return {
        blobId: existing.id,
        sha256,
        fileSize: existing.fileSize,
        mimeType: existing.mimeType,
        deduped: true,
      }
    }

    const created = await db.fileBlob.create({
      data: {
        sha256,
        // Prisma's Bytes maps to Uint8Array; a Buffer is one, but TypeScript
        // distinguishes their backing-buffer types.
        data: new Uint8Array(data),
        mimeType,
        fileSize: data.byteLength,
        refCount: 1,
      },
      select: { id: true },
    })

    return {
      blobId: created.id,
      sha256,
      fileSize: data.byteLength,
      mimeType,
      deduped: false,
    }
  },

  async get(blobId) {
    const blob = await db.fileBlob.findUnique({
      where: { id: blobId },
      select: { data: true, mimeType: true, fileSize: true, sha256: true },
    })
    if (!blob) return null
    return {
      data: Buffer.from(blob.data),
      mimeType: blob.mimeType,
      fileSize: blob.fileSize,
      sha256: blob.sha256,
    }
  },

  async addRef(blobId) {
    await db.fileBlob.update({
      where: { id: blobId },
      data: { refCount: { increment: 1 } },
    })
  },

  async release(blobId) {
    const blob = await db.fileBlob.findUnique({
      where: { id: blobId },
      select: { id: true, refCount: true },
    })
    if (!blob) return

    if (blob.refCount <= 1) {
      // Last reference — the bytes go with it.
      await db.fileBlob.delete({ where: { id: blobId } }).catch(err => {
        // A foreign key still pointing here means our count was wrong. Prefer
        // keeping the file over losing it, and make the discrepancy visible.
        console.error(`[storage] could not delete blob ${blobId}, keeping it:`, err)
      })
      return
    }

    await db.fileBlob.update({
      where: { id: blobId },
      data: { refCount: { decrement: 1 } },
    })
  },
}

export const storage: StorageDriver = postgresDriver

// ============================================================
// Upload validation
// ============================================================

export class FileTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`File is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit`)
    this.name = 'FileTooLargeError'
  }
}

/** The configured maximum upload size in bytes (Settings → Files). */
async function maxUploadBytes(): Promise<number> {
  const mb = await getSetting('files.maxUploadMb')
  return mb * 1024 * 1024
}

/**
 * Validate then store, in one call — the shape every upload route wants.
 * Throws `FileTooLargeError` when over the configured limit.
 */
export async function putChecked(data: Buffer, mimeType: string): Promise<StoredFile> {
  const max = await maxUploadBytes()
  if (data.byteLength > max) throw new FileTooLargeError(max)
  return storage.put(data, mimeType)
}
