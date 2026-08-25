import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ============================================================
// Singapore — 11 public holidays
// ============================================================
const SG_HOLIDAYS_2026 = [
  { date: new Date('2026-01-01'), name: "New Year's Day", type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-01-29'), name: 'Chinese New Year Day 1', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-01-30'), name: 'Chinese New Year Day 2', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-03-21'), name: 'Hari Raya Puasa', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-04-03'), name: 'Good Friday', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-05-01'), name: 'Labour Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-05-28'), name: 'Hari Raya Haji', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-05-31'), name: 'Vesak Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-08-09'), name: 'National Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-10-20'), name: 'Deepavali', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-12-25'), name: 'Christmas Day', type: 'PUBLIC_HOLIDAY' },
]

// ============================================================
// Malaysia — federal public holidays 2026
// Sources: publicholidays.com.my, malaysiapublicholiday.com (cross-verified).
// Islamic holiday dates are tentative pending lunar confirmation by the
// Keeper of the Rulers' Seal — verify against the official Cabinet Office
// announcement before deployment.
// ============================================================
const MY_HOLIDAYS_2026 = [
  { date: new Date('2026-01-01'), name: "New Year's Day", type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-02-01'), name: 'Federal Territory Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-02-17'), name: 'Chinese New Year Day 1', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-02-18'), name: 'Chinese New Year Day 2', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-03-21'), name: 'Hari Raya Aidilfitri Day 1', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-03-22'), name: 'Hari Raya Aidilfitri Day 2', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-05-01'), name: 'Labour Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-05-27'), name: 'Hari Raya Haji', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-05-31'), name: 'Wesak Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-06-01'), name: "Yang di-Pertuan Agong's Birthday", type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-06-17'), name: 'Awal Muharram', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-08-25'), name: "Prophet Muhammad's Birthday", type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-08-31'), name: 'Merdeka Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-09-16'), name: 'Malaysia Day', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-11-08'), name: 'Deepavali', type: 'PUBLIC_HOLIDAY' },
  { date: new Date('2026-12-25'), name: 'Christmas Day', type: 'PUBLIC_HOLIDAY' },
]

async function seedHolidays(
  country: 'SG' | 'MY',
  holidays: { date: Date; name: string; type: string }[]
) {
  let count = 0
  for (const holiday of holidays) {
    await prisma.publicHoliday.upsert({
      where: { country_date: { country, date: holiday.date } },
      update: { name: holiday.name, type: holiday.type },
      create: {
        country,
        date: holiday.date,
        name: holiday.name,
        year: 2026,
        isObserved: true,
        type: holiday.type,
      },
    })
    count++
  }
  return count
}

async function main() {
  console.log('Seeding database...')

  // Seed default admin user
  const passwordHash = await bcrypt.hash('test123', 12)
  await prisma.user.upsert({
    where: { email: 'jin@company.com' },
    update: {},
    create: {
      email: 'jin@company.com',
      passwordHash,
      firstName: 'Jin',
      lastName: 'Lee',
      role: 'HR',
      country: 'SG',
      mustChangePassword: true,
      status: 'ACTIVE',
      employmentType: 'EMPLOYEE',
    },
  })
  console.log('Created default HR user: jin@company.com (password: test123)')

  // Seed holidays
  const sgCount = await seedHolidays('SG', SG_HOLIDAYS_2026)
  console.log(`Seeded SG: ${sgCount} holidays`)

  const myCount = await seedHolidays('MY', MY_HOLIDAYS_2026)
  console.log(`Seeded MY: ${myCount} holidays`)

  const total = sgCount + myCount
  console.log(`\nTotal holidays seeded: ${total}`)

  // Seed leave types
  const leaveTypes = [
    { name: 'Annual Leave', defaultEntitlement: 18, requiresAttachment: false, allowsHalfDay: true, applicableToAll: true },
    { name: 'Sick Leave', defaultEntitlement: 14, requiresAttachment: true, allowsHalfDay: true, applicableToAll: true },
    { name: 'Hospitalisation Leave', defaultEntitlement: 60, requiresAttachment: true, allowsHalfDay: false, applicableToAll: true },
    { name: 'Childcare Leave', defaultEntitlement: 6, requiresAttachment: false, allowsHalfDay: true, applicableToAll: false },
    { name: 'Maternity Leave', defaultEntitlement: 0, requiresAttachment: false, allowsHalfDay: false, applicableToAll: false },
    { name: 'Paternity Leave', defaultEntitlement: 0, requiresAttachment: false, allowsHalfDay: false, applicableToAll: false },
    { name: 'Compassionate Leave', defaultEntitlement: 3, requiresAttachment: true, allowsHalfDay: false, applicableToAll: true },
    { name: 'Military Leave (NS)', defaultEntitlement: 25, requiresAttachment: false, allowsHalfDay: false, applicableToAll: false },
    { name: 'Unpaid Leave', defaultEntitlement: 0, requiresAttachment: false, allowsHalfDay: true, applicableToAll: true },
  ]

  let ltCount = 0
  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { name: lt.name },
      update: {},
      create: lt,
    })
    ltCount++
  }
  console.log(`Seeded ${ltCount} leave types`)

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
