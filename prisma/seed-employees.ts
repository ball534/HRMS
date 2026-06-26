/**
 * One-off: seeds a small retail org for testing.
 * Run: npx tsx -r dotenv/config prisma/seed-employees.ts
 *
 * Org tree:
 *   Jin Lee (admin) — existing
 *     Sarah Tan (SG Country Manager)
 *       Aisha Rahman (Store Mgr — Orchard)
 *         Wei Ming, Priya, Lim Boon (PT), Hannah Goh (PT)
 *       James Lee (Store Mgr — Marina)
 *         Daniel Wong, Mei Lin
 *     Faizal Aziz (MY Country Manager)
 *       Nurul Hidayah (Store Mgr — KL)
 *         Siti Aminah, Aaron Tan (PT), Kavitha Rao
 *
 * All test accounts: password `password123`, mustChangePassword=false.
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

type Seed = {
  email: string
  firstName: string
  lastName: string
  position: string
  department: string
  country: 'SG' | 'MY'
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CONTRACTOR'
  employmentType: 'EMPLOYEE' | 'CONTRACTOR' | 'PART_TIME'
  hourlyRate?: number
  normalDailyHours?: number
  managerEmail?: string
  gender?: string
}

const SEEDS: Seed[] = [
  // Country managers
  { email: 'sarah.tan@iora.test', firstName: 'Sarah', lastName: 'Tan', position: 'Country Manager — SG', department: 'Retail Ops', country: 'SG', role: 'MANAGER', employmentType: 'EMPLOYEE', managerEmail: 'jin@company.com', gender: 'Female' },
  { email: 'faizal.aziz@iora.test', firstName: 'Faizal', lastName: 'Aziz', position: 'Country Manager — MY', department: 'Retail Ops', country: 'MY', role: 'MANAGER', employmentType: 'EMPLOYEE', managerEmail: 'jin@company.com', gender: 'Male' },

  // SG store managers
  { email: 'aisha.rahman@iora.test', firstName: 'Aisha', lastName: 'Rahman', position: 'Store Manager — Orchard', department: 'Stores SG', country: 'SG', role: 'MANAGER', employmentType: 'EMPLOYEE', managerEmail: 'sarah.tan@iora.test', gender: 'Female' },
  { email: 'james.lee@iora.test', firstName: 'James', lastName: 'Lee', position: 'Store Manager — Marina', department: 'Stores SG', country: 'SG', role: 'MANAGER', employmentType: 'EMPLOYEE', managerEmail: 'sarah.tan@iora.test', gender: 'Male' },

  // SG Orchard store team
  { email: 'wei.ming@iora.test', firstName: 'Wei', lastName: 'Ming', position: 'Senior Sales Associate', department: 'Stores SG', country: 'SG', role: 'EMPLOYEE', employmentType: 'EMPLOYEE', managerEmail: 'aisha.rahman@iora.test', gender: 'Male' },
  { email: 'priya.naidu@iora.test', firstName: 'Priya', lastName: 'Naidu', position: 'Sales Associate', department: 'Stores SG', country: 'SG', role: 'EMPLOYEE', employmentType: 'EMPLOYEE', managerEmail: 'aisha.rahman@iora.test', gender: 'Female' },
  { email: 'lim.boon@iora.test', firstName: 'Lim', lastName: 'Boon', position: 'Sales Associate (PT)', department: 'Stores SG', country: 'SG', role: 'EMPLOYEE', employmentType: 'PART_TIME', hourlyRate: 14, normalDailyHours: 5, managerEmail: 'aisha.rahman@iora.test', gender: 'Male' },
  { email: 'hannah.goh@iora.test', firstName: 'Hannah', lastName: 'Goh', position: 'Sales Associate (PT)', department: 'Stores SG', country: 'SG', role: 'EMPLOYEE', employmentType: 'PART_TIME', hourlyRate: 14, normalDailyHours: 5, managerEmail: 'aisha.rahman@iora.test', gender: 'Female' },

  // SG Marina store team
  { email: 'daniel.wong@iora.test', firstName: 'Daniel', lastName: 'Wong', position: 'Senior Sales Associate', department: 'Stores SG', country: 'SG', role: 'EMPLOYEE', employmentType: 'EMPLOYEE', managerEmail: 'james.lee@iora.test', gender: 'Male' },
  { email: 'mei.lin@iora.test', firstName: 'Mei', lastName: 'Lin', position: 'Sales Associate', department: 'Stores SG', country: 'SG', role: 'EMPLOYEE', employmentType: 'EMPLOYEE', managerEmail: 'james.lee@iora.test', gender: 'Female' },

  // MY KL store team
  { email: 'nurul.hidayah@iora.test', firstName: 'Nurul', lastName: 'Hidayah', position: 'Store Manager — KL', department: 'Stores MY', country: 'MY', role: 'MANAGER', employmentType: 'EMPLOYEE', managerEmail: 'faizal.aziz@iora.test', gender: 'Female' },
  { email: 'siti.aminah@iora.test', firstName: 'Siti', lastName: 'Aminah', position: 'Sales Associate', department: 'Stores MY', country: 'MY', role: 'EMPLOYEE', employmentType: 'EMPLOYEE', managerEmail: 'nurul.hidayah@iora.test', gender: 'Female' },
  { email: 'aaron.tan@iora.test', firstName: 'Aaron', lastName: 'Tan', position: 'Sales Associate (PT)', department: 'Stores MY', country: 'MY', role: 'EMPLOYEE', employmentType: 'PART_TIME', hourlyRate: 12, normalDailyHours: 6, managerEmail: 'nurul.hidayah@iora.test', gender: 'Male' },
  { email: 'kavitha.rao@iora.test', firstName: 'Kavitha', lastName: 'Rao', position: 'Sales Associate', department: 'Stores MY', country: 'MY', role: 'EMPLOYEE', employmentType: 'EMPLOYEE', managerEmail: 'nurul.hidayah@iora.test', gender: 'Female' },
]

async function main() {
  const passwordHash = await bcrypt.hash('password123', 12)
  const emailToId = new Map<string, string>()

  // Bootstrap admin id (already exists)
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'jin@company.com' } })
  emailToId.set('jin@company.com', admin.id)

  // Pass 1: create all users without manager links
  for (const s of SEEDS) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: {
        firstName: s.firstName,
        lastName: s.lastName,
        position: s.position,
        department: s.department,
        country: s.country,
        role: s.role,
        employmentType: s.employmentType,
        gender: s.gender ?? null,
        hourlyRate: s.hourlyRate ?? null,
        normalDailyHours: s.normalDailyHours ?? null,
        mustChangePassword: false,
      },
      create: {
        email: s.email,
        passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        position: s.position,
        department: s.department,
        country: s.country,
        role: s.role,
        employmentType: s.employmentType,
        gender: s.gender ?? null,
        hourlyRate: s.hourlyRate ?? null,
        normalDailyHours: s.normalDailyHours ?? null,
        status: 'ACTIVE',
        mustChangePassword: false,
      },
    })
    emailToId.set(s.email, u.id)
  }

  // Pass 2: wire up reportingManagerId
  for (const s of SEEDS) {
    if (!s.managerEmail) continue
    const managerId = emailToId.get(s.managerEmail)
    if (!managerId) {
      console.warn(`Manager not found for ${s.email}: ${s.managerEmail}`)
      continue
    }
    await prisma.user.update({
      where: { email: s.email },
      data: { reportingManagerId: managerId },
    })
  }

  console.log(`✓ Seeded ${SEEDS.length} employees with manager hierarchy.`)
  console.log('  Login with any *.iora.test email + password: password123')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
