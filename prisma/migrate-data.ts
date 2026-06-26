import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import * as XLSX from 'xlsx'
import path from 'path'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ============================================================
// Country mapping
// ============================================================
const COUNTRY_MAP: Record<string, 'SG' | 'MY'> = {
  'Singapore': 'SG',
  'Malaysia': 'MY',
}

// ============================================================
// Leave type name mapping (OmniHR → InsideHR)
// ============================================================
const LEAVE_TYPE_MAP: Record<string, string> = {
  'Annual Leave': 'Annual Leave',
  'Sick Leave': 'Sick Leave',
  'Hospitalisation Leave': 'Hospitalisation Leave',
  'Compassionate Leave': 'Compassionate Leave',
  'Maternity': 'Maternity Leave',
  'Paternity': 'Paternity Leave',
  'Childcare Leave': 'Childcare Leave',
  'Military Leave': 'Military Leave (NS)',
}

// ============================================================
// Parse date — handles both DD/MM/YYYY strings and Excel serial numbers
// ============================================================
function parseDate(value: string | number | undefined | null): Date | null {
  if (value === undefined || value === null || value === '') return null
  // Excel serial number
  if (typeof value === 'number') {
    // Excel epoch is 1900-01-01 with the 1900 leap year bug (+1 day offset)
    const excelEpoch = new Date(1899, 11, 30)
    return new Date(excelEpoch.getTime() + value * 86400000)
  }
  const str = String(value).trim()
  if (!str) return null
  const parts = str.split('/')
  if (parts.length !== 3) return null
  const [day, month, year] = parts.map(Number)
  return new Date(year, month - 1, day)
}

// ============================================================
// Determine role based on position and management status
// ============================================================
function determineRole(
  position: string,
  department: string,
  hasDirectReports: boolean,
  systemId: number
): 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CONTRACTOR' {
  // System ID 1 is Omni Support — skip
  if (systemId === 1) return 'EMPLOYEE'

  // C-suite → ADMIN
  const posLower = (position || '').toLowerCase()
  if (posLower.includes('chief') || posLower.includes('ceo') || posLower.includes('coo') || posLower.includes('cto')) {
    return 'ADMIN'
  }

  // Country managers → ADMIN
  if (posLower.includes('country manager')) return 'ADMIN'

  // Managers / leads / heads with direct reports → MANAGER
  if (hasDirectReports || posLower.includes('manager') || posLower.includes('lead') || posLower.includes('head of')) {
    return 'MANAGER'
  }

  return 'EMPLOYEE'
}

// ============================================================
// Determine employment type
// ============================================================
function determineEmploymentType(empType: string): 'EMPLOYEE' | 'CONTRACTOR' {
  const t = (empType || '').toLowerCase()
  if (t.includes('contract') || t.includes('intern')) return 'CONTRACTOR'
  return 'EMPLOYEE'
}

// ============================================================
// Main migration
// ============================================================
async function main() {
  console.log('🚀 Starting data migration from OmniHR exports...\n')

  const passwordHash = await bcrypt.hash('changeme123', 12)

  // ---- Read Master Report ----
  const masterPath = path.join(__dirname, '..', 'migration files', 'Master Report from Tagteam Technologies.xlsx')
  const masterWb = XLSX.readFile(masterPath)
  const masterSheet = masterWb.Sheets[masterWb.SheetNames[0]]
  const masterRows: string[][] = XLSX.utils.sheet_to_json(masterSheet, { header: 1, defval: '', raw: true })

  // Find header row (row with "System ID")
  let headerIdx = -1
  for (let i = 0; i < masterRows.length; i++) {
    if (masterRows[i][0] === 'System ID') { headerIdx = i; break }
  }
  if (headerIdx === -1) throw new Error('Could not find header row in Master Report')

  const dataRows = masterRows.slice(headerIdx + 1).filter(r => r[0] && r[0] !== '')

  // ---- Read Time Off Balance Report ----
  const balancePath = path.join(__dirname, '..', 'migration files', 'Time Off Balance Report from Tagteam.xlsx')
  const balanceWb = XLSX.readFile(balancePath)
  const balanceSheet = balanceWb.Sheets[balanceWb.SheetNames[0]]
  const balanceRows: string[][] = XLSX.utils.sheet_to_json(balanceSheet, { header: 1, defval: '' })

  let balanceHeaderIdx = -1
  for (let i = 0; i < balanceRows.length; i++) {
    if (balanceRows[i][0] === 'System ID') { balanceHeaderIdx = i; break }
  }
  if (balanceHeaderIdx === -1) throw new Error('Could not find header row in Balance Report')

  const balanceDataRows = balanceRows.slice(balanceHeaderIdx + 1).filter(r => r[0] && r[0] !== '')

  // ---- Build manager system ID set (who has direct reports) ----
  const managerSystemIds = new Set<number>()
  for (const row of dataRows) {
    const mgrId = parseInt(String(row[59]), 10) // Manager System ID column
    if (!isNaN(mgrId) && mgrId > 0) managerSystemIds.add(mgrId)
  }

  // ---- Phase 1: Create all users (without manager links) ----
  console.log('📋 Phase 1: Creating users...')

  // Map systemId → created userId
  const systemIdToUserId = new Map<number, string>()
  // Map systemId → manager system ID (for Phase 2)
  const systemIdToManagerId = new Map<number, number>()

  let created = 0, skipped = 0, updated = 0

  for (const row of dataRows) {
    const systemId = parseInt(String(row[0]), 10)
    if (isNaN(systemId)) continue

    // Skip Omni Support (system ID 1)
    if (systemId === 1) { skipped++; continue }

    const firstName = String(row[1] || '').trim()
    const middleName = String(row[2] || '').trim()
    const lastName = String(row[3] || '').trim()
    const fullLegalName = String(row[5] || '').trim()
    const dobStr = String(row[6] || '').trim()
    const gender = String(row[7] || '').trim()
    const nationality = String(row[9] || '').trim()
    const workEmail = String(row[11] || '').trim()
    const phone = String(row[14] || '').trim()
    const empStatus = String(row[37] || '').trim()
    const startDateStr = row[38]
    const lastDayStr = row[39]
    const company = String(row[52] || '').trim()
    const department = String(row[53] || '').trim()
    const team = String(row[54] || '').trim()
    const position = String(row[55] || '').trim()
    const location = String(row[56] || '').trim()
    const empType = String(row[57] || '').trim()
    const mgrSystemId = parseInt(String(row[59] || ''), 10)

    if (!workEmail) { skipped++; continue }

    // Map country from location
    const country = COUNTRY_MAP[location] || COUNTRY_MAP[company] || 'SG'

    // Status
    const status = empStatus === 'Terminated' ? 'TERMINATED' as const : 'ACTIVE' as const

    // Role
    const hasDirectReports = managerSystemIds.has(systemId)
    const role = determineRole(position, department, hasDirectReports, systemId)

    // Employment type
    const employmentType = determineEmploymentType(empType)

    // Parse dates
    const dateOfBirth = parseDate(row[6])
    const startDate = parseDate(startDateStr as any)

    // Store manager link for Phase 2
    if (!isNaN(mgrSystemId) && mgrSystemId > 0 && mgrSystemId !== systemId) {
      systemIdToManagerId.set(systemId, mgrSystemId)
    }

    // Build display name parts
    const displayFirst = firstName || (fullLegalName ? fullLegalName.split(' ')[0] : 'Unknown')
    const displayLast = lastName || (middleName ? middleName : '')

    try {
      const user = await prisma.user.upsert({
        where: { email: workEmail },
        update: {
          firstName: displayFirst,
          lastName: displayLast,
          phone: phone || null,
          gender: gender === 'Male' ? 'Male' : gender === 'Female' ? 'Female' : null,
          dateOfBirth,
          nationality: nationality || null,
          position: position || null,
          department: department || team || null,
          employmentType,
          country,
          startDate,
          role,
          status,
          mustChangePassword: true,
        },
        create: {
          email: workEmail,
          passwordHash,
          firstName: displayFirst,
          lastName: displayLast,
          phone: phone || null,
          gender: gender === 'Male' ? 'Male' : gender === 'Female' ? 'Female' : null,
          dateOfBirth,
          nationality: nationality || null,
          position: position || null,
          department: department || team || null,
          employmentType,
          country,
          startDate,
          role,
          status,
          mustChangePassword: true,
        },
      })

      systemIdToUserId.set(systemId, user.id)
      created++

      // Log role assignments for visibility
      if (role === 'ADMIN') {
        console.log(`  ✓ [ADMIN]    ${displayFirst} ${displayLast} (${workEmail})`)
      } else if (role === 'MANAGER') {
        console.log(`  ✓ [MANAGER]  ${displayFirst} ${displayLast} (${workEmail})`)
      }
    } catch (err: any) {
      console.error(`  ✗ Failed: ${workEmail} — ${err.message}`)
      skipped++
    }
  }

  console.log(`\n  Users: ${created} created/updated, ${skipped} skipped\n`)

  // ---- Phase 2: Wire up reporting manager relationships ----
  console.log('🔗 Phase 2: Setting up reporting relationships...')
  let linked = 0

  for (const [sysId, mgrSysId] of systemIdToManagerId) {
    const userId = systemIdToUserId.get(sysId)
    const managerId = systemIdToUserId.get(mgrSysId)

    if (userId && managerId) {
      await prisma.user.update({
        where: { id: userId },
        data: { reportingManagerId: managerId },
      })
      linked++
    }
  }

  console.log(`  Linked ${linked} reporting relationships\n`)

  // ---- Phase 3: Import leave balances ----
  console.log('📊 Phase 3: Importing leave balances...')

  // Get all leave types from DB
  const leaveTypes = await prisma.leaveType.findMany()
  const leaveTypeByName = new Map(leaveTypes.map(lt => [lt.name, lt]))

  // Get all users by email for lookup
  const allUsers = await prisma.user.findMany({ select: { id: true, email: true } })
  const userByEmail = new Map(allUsers.map(u => [u.email, u.id]))

  // Build systemId → email map from master data
  const systemIdToEmail = new Map<number, string>()
  for (const row of dataRows) {
    const sysId = parseInt(String(row[0]), 10)
    const email = String(row[11] || '').trim()
    if (!isNaN(sysId) && email) systemIdToEmail.set(sysId, email)
  }

  const currentYear = 2026
  let balancesCreated = 0
  let balancesSkipped = 0

  for (const row of balanceDataRows) {
    const systemId = parseInt(String(row[0]), 10)
    if (isNaN(systemId) || systemId === 1) continue

    const empStatus = String(row[4] || '').trim()
    const leaveTypeName = String(row[11] || '').trim()
    const carryOver = parseFloat(String(row[12] || '0')) || 0
    const entitlementEarned = parseFloat(String(row[14] || '0')) || 0
    const adjustment = parseFloat(String(row[16] || '0')) || 0
    const taken = parseFloat(String(row[18] || '0')) || 0
    const planned = parseFloat(String(row[19] || '0')) || 0

    // Skip terminated employees with zero balances
    if (empStatus === 'Terminated' && entitlementEarned === 0 && carryOver === 0) {
      balancesSkipped++
      continue
    }

    // Map leave type name
    const mappedName = LEAVE_TYPE_MAP[leaveTypeName]
    if (!mappedName) {
      balancesSkipped++
      continue
    }

    const leaveType = leaveTypeByName.get(mappedName)
    if (!leaveType) {
      console.log(`  ⚠ Leave type not found: ${mappedName}`)
      balancesSkipped++
      continue
    }

    // Find user
    const email = systemIdToEmail.get(systemId)
    if (!email) { balancesSkipped++; continue }
    const userId = userByEmail.get(email)
    if (!userId) { balancesSkipped++; continue }

    // "taken" is negative in the CSV (e.g., -3.50)
    const used = Math.abs(taken)
    const pendingDays = Math.abs(planned)

    try {
      await prisma.leaveBalance.upsert({
        where: {
          userId_leaveTypeId_year: {
            userId,
            leaveTypeId: leaveType.id,
            year: currentYear,
          },
        },
        update: {
          entitlement: entitlementEarned,
          carryForward: carryOver,
          adjustment,
          used,
          pending: pendingDays,
        },
        create: {
          userId,
          leaveTypeId: leaveType.id,
          year: currentYear,
          entitlement: entitlementEarned,
          carryForward: carryOver,
          adjustment,
          used,
          pending: pendingDays,
        },
      })
      balancesCreated++
    } catch (err: any) {
      console.error(`  ✗ Balance failed for ${email} / ${mappedName}: ${err.message}`)
      balancesSkipped++
    }
  }

  console.log(`  Balances: ${balancesCreated} imported, ${balancesSkipped} skipped\n`)

  // ---- Phase 4: Fix maternity/paternity by gender + country ----
  console.log('🔧 Phase 4: Fixing maternity/paternity entitlements by gender & country...')

  const maternityType = leaveTypeByName.get('Maternity Leave')
  const paternityType = leaveTypeByName.get('Paternity Leave')

  const maternityByCountry: Record<string, number> = {
    SG: 112,
    MY: 98,
  }
  const paternityByCountry: Record<string, number> = {
    SG: 14,
    MY: 7,
  }

  if (maternityType) {
    // Remove maternity balances from male employees
    const maleUsers = await prisma.user.findMany({ where: { gender: 'Male' }, select: { id: true } })
    const delMaternity = await prisma.leaveBalance.deleteMany({
      where: { leaveTypeId: maternityType.id, userId: { in: maleUsers.map(u => u.id) } }
    })
    console.log(`  Removed ${delMaternity.count} maternity balances from male employees`)

    // Update maternity entitlements by country for remaining
    const femaleWithMaternity = await prisma.leaveBalance.findMany({
      where: { leaveTypeId: maternityType.id },
      include: { user: { select: { country: true } } },
    })
    for (const bal of femaleWithMaternity) {
      const correctEntitlement = maternityByCountry[bal.user.country] ?? 90
      if (bal.entitlement !== correctEntitlement) {
        await prisma.leaveBalance.update({
          where: { id: bal.id },
          data: { entitlement: correctEntitlement },
        })
      }
    }
    console.log(`  Updated ${femaleWithMaternity.length} maternity entitlements by country`)
  }

  if (paternityType) {
    // Remove paternity balances from female employees
    const femaleUsers = await prisma.user.findMany({ where: { gender: 'Female' }, select: { id: true } })
    const delPaternity = await prisma.leaveBalance.deleteMany({
      where: { leaveTypeId: paternityType.id, userId: { in: femaleUsers.map(u => u.id) } }
    })
    console.log(`  Removed ${delPaternity.count} paternity balances from female employees`)

    // Update paternity entitlements by country for remaining
    const maleWithPaternity = await prisma.leaveBalance.findMany({
      where: { leaveTypeId: paternityType.id },
      include: { user: { select: { country: true } } },
    })
    for (const bal of maleWithPaternity) {
      const correctEntitlement = paternityByCountry[bal.user.country] ?? 0
      if (bal.entitlement !== correctEntitlement) {
        await prisma.leaveBalance.update({
          where: { id: bal.id },
          data: { entitlement: correctEntitlement },
        })
      }
    }
    console.log(`  Updated ${maleWithPaternity.length} paternity entitlements by country`)
  }

  console.log('')

  // ---- Summary ----
  const totalUsers = await prisma.user.count()
  const activeUsers = await prisma.user.count({ where: { status: 'ACTIVE' } })
  const maleCount = await prisma.user.count({ where: { gender: 'Male' } })
  const femaleCount = await prisma.user.count({ where: { gender: 'Female' } })
  const totalBalances = await prisma.leaveBalance.count()

  console.log('✅ Migration complete!')
  console.log(`   Total users: ${totalUsers} (${activeUsers} active)`)
  console.log(`   Gender: ${maleCount} male, ${femaleCount} female, ${totalUsers - maleCount - femaleCount} unknown`)
  console.log(`   Leave balances: ${totalBalances}`)
  console.log(`\n   All users have password: changeme123`)
  console.log(`   All users must change password on first login`)
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
