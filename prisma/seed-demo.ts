/**
 * Demo seed — wipes the database and builds a presentation-ready fake company
 * that exercises every system in the HRMS.
 *
 *   npm run db:seed-demo
 *
 * This is a **destructive full reset**: every table is truncated before
 * anything is written, so it does not need the base seed to have been run and
 * it never leaves stale rows behind. Re-running it is always safe and always
 * produces the same company.
 *
 * All dates are relative to "today", so the demo stays current — probation
 * reminders are always about to fire, a work pass is always inside its renewal
 * window, and last month always has payroll in it.
 *
 * Every login is `test123`, with no forced password change.
 *
 * What each part of the roster is *for* is noted inline: the point of this data
 * is that every screen has something interesting on it and every guard has
 * something to catch.
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  confirmationSections,
  defaultSectionsFor,
  mergeText,
  type LetterKindName,
  type LetterSection,
} from '../src/lib/letterSections'
import {
  addDays,
  addMonths,
  startOfMonth,
  subDays,
  subMonths,
  subYears,
} from 'date-fns'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const now = new Date()
const thisYear = now.getFullYear()
const PASSWORD = 'test123'

/** Every table, for the truncate. Prisma maps model names 1:1 to table names. */
const ALL_TABLES = [
  'Goal',
  'RewardAllocation',
  'RewardCycle',
  'PerformanceReview',
  'ReviewCycle',
  'TimeEntry',
  'LeaveRequest',
  'LeaveBalance',
  'LeaveType',
  'Document',
  'EmploymentLetter',
  'WorkPassDocument',
  'Candidate',
  'OnboardingSubmission',
  'WorkPass',
  'LearningLessonProgress',
  'LearningTestProgress',
  'LearningSurvey',
  'LearningMaterial',
  'LearningModuleLesson',
  'Notification',
  'CareerEvent',
  'AuditLog',
  'PasswordResetToken',
  'BlackoutWindow',
  'PublicHoliday',
  'OrgSetting',
  'StatutoryRuleSet',
  'FileBlob',
  'User',
]

// ============================================================
// Small helpers
// ============================================================

/** A tiny but valid PDF, so seeded documents are really openable. */
async function makePdf(title: string, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  page.drawText(title, { x: 72, y: 760, size: 16, font: bold, color: rgb(0.1, 0.1, 0.12) })
  page.drawText('Demo document — not a real record', {
    x: 72,
    y: 740,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.5),
  })

  let y = 700
  for (const line of lines) {
    page.drawText(line, { x: 72, y, size: 11, font, color: rgb(0.15, 0.15, 0.18) })
    y -= 20
  }

  return Buffer.from(await pdf.save())
}

/** Store bytes as a FileBlob, taking `refs` references. Dedups by hash. */
async function storeBlob(data: Buffer, mimeType = 'application/pdf', refs = 1): Promise<string> {
  const sha256 = createHash('sha256').update(data).digest('hex')
  const existing = await prisma.fileBlob.findUnique({ where: { sha256 }, select: { id: true } })
  if (existing) {
    await prisma.fileBlob.update({
      where: { id: existing.id },
      data: { refCount: { increment: refs } },
    })
    return existing.id
  }
  const created = await prisma.fileBlob.create({
    data: {
      sha256,
      data: new Uint8Array(data),
      mimeType,
      fileSize: data.byteLength,
      refCount: refs,
    },
    select: { id: true },
  })
  return created.id
}

// ============================================================
// Reference data
// ============================================================

const SG_HOLIDAYS = [
  ['01-01', "New Year's Day"],
  ['01-29', 'Chinese New Year Day 1'],
  ['01-30', 'Chinese New Year Day 2'],
  ['03-21', 'Hari Raya Puasa'],
  ['04-03', 'Good Friday'],
  ['05-01', 'Labour Day'],
  ['05-28', 'Hari Raya Haji'],
  ['05-31', 'Vesak Day'],
  ['08-09', 'National Day'],
  ['11-08', 'Deepavali'],
  ['12-25', 'Christmas Day'],
] as const

const MY_HOLIDAYS = [
  ['01-01', "New Year's Day"],
  ['01-29', 'Chinese New Year Day 1'],
  ['01-30', 'Chinese New Year Day 2'],
  ['02-01', 'Federal Territory Day'],
  ['03-21', 'Hari Raya Aidilfitri Day 1'],
  ['03-22', 'Hari Raya Aidilfitri Day 2'],
  ['05-01', 'Labour Day'],
  ['05-12', 'Wesak Day'],
  ['05-28', 'Hari Raya Haji'],
  ['06-02', "Agong's Birthday"],
  ['08-31', 'Merdeka Day'],
  ['09-16', 'Malaysia Day'],
  ['11-08', 'Deepavali'],
  ['12-25', 'Christmas Day'],
] as const

const LEAVE_TYPES = [
  { name: 'Annual Leave', defaultEntitlement: 18, requiresAttachment: false, allowsHalfDay: true, applicableToAll: true },
  { name: 'Sick Leave', defaultEntitlement: 14, requiresAttachment: true, allowsHalfDay: false, applicableToAll: true },
  { name: 'Hospitalisation Leave', defaultEntitlement: 60, requiresAttachment: true, allowsHalfDay: false, applicableToAll: true },
  { name: 'Compassionate Leave', defaultEntitlement: 3, requiresAttachment: false, allowsHalfDay: false, applicableToAll: true },
  { name: 'Unpaid Leave', defaultEntitlement: 0, requiresAttachment: false, allowsHalfDay: true, applicableToAll: true },
  // applicableToAll: false — these are the statutory types the request form
  // deliberately does not offer to everyone (see oversight.md §3).
  { name: 'Maternity Leave', defaultEntitlement: 112, requiresAttachment: true, allowsHalfDay: false, applicableToAll: false },
  { name: 'Paternity Leave', defaultEntitlement: 14, requiresAttachment: true, allowsHalfDay: false, applicableToAll: false },
  { name: 'Childcare Leave', defaultEntitlement: 6, requiresAttachment: false, allowsHalfDay: true, applicableToAll: false },
  { name: 'NS Leave', defaultEntitlement: 0, requiresAttachment: true, allowsHalfDay: false, applicableToAll: false },
]

/** Carried over from src/lib/statutory.ts — unverified, by design. */
const BASELINE_RULES = {
  annualLeave: {
    base: { EMPLOYEE: 18, CONTRACTOR: 14, PART_TIME: 8 },
    daysPerYearOfService: 1,
    maxDays: 30,
  },
  sickLeave: { outpatientDays: 14, hospitalisationDays: 60, tenureBands: [] },
  overtime: {
    weeklyRegularCap: 45,
    overtimeMultiplier: 1.5,
    publicHolidayMultiplier: 2,
    publicHolidayOvertimeMultiplier: 3,
  },
}

// ============================================================
async function main() {
  console.log('\n=== Resetting database ===')
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${ALL_TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
  console.log(`Truncated ${ALL_TABLES.length} tables.`)

  const passwordHash = await bcrypt.hash(PASSWORD, 12)

  // ==========================================================
  console.log('\n=== Reference data ===')
  // ==========================================================

  for (const year of [thisYear, thisYear + 1]) {
    await prisma.publicHoliday.createMany({
      data: [
        ...SG_HOLIDAYS.map(([md, name]) => ({
          country: 'SG' as const,
          date: new Date(`${year}-${md}T00:00:00Z`),
          name,
          year,
        })),
        ...MY_HOLIDAYS.map(([md, name]) => ({
          country: 'MY' as const,
          date: new Date(`${year}-${md}T00:00:00Z`),
          name,
          year,
        })),
      ],
      skipDuplicates: true,
    })
  }
  console.log(`Public holidays: ${SG_HOLIDAYS.length} SG + ${MY_HOLIDAYS.length} MY × 2 years`)

  const leaveTypes: Record<string, { id: string; defaultEntitlement: number }> = {}
  for (const lt of LEAVE_TYPES) {
    const created = await prisma.leaveType.create({ data: lt })
    leaveTypes[lt.name] = { id: created.id, defaultEntitlement: created.defaultEntitlement }
  }
  console.log(`Leave types: ${LEAVE_TYPES.length}`)

  // Statutory rulebook — both countries, deliberately left unverified so the
  // "not confirmed by an adviser" banner is visible in the demo.
  for (const country of ['SG', 'MY'] as const) {
    await prisma.statutoryRuleSet.create({
      data: {
        country,
        effectiveFrom: new Date(Date.UTC(2000, 0, 1)),
        rules: BASELINE_RULES,
        note:
          country === 'SG'
            ? 'PLACEHOLDER — these are the Malaysian figures the app previously applied to Singapore employees. Must be replaced with confirmed Singapore Employment Act values.'
            : 'Baseline carried over from the previous single-rulebook implementation. Unverified.',
      },
    })
  }
  console.log('Statutory rule sets: SG + MY (both unverified)')

  // Blackout windows — one hard block, one warning-only.
  await prisma.blackoutWindow.createMany({
    data: [
      {
        name: 'Chinese New Year peak',
        reason: 'Highest-traffic retail fortnight of the year — all stores fully staffed.',
        country: null,
        startDate: new Date(`${thisYear + 1}-01-20T00:00:00Z`),
        endDate: new Date(`${thisYear + 1}-02-05T00:00:00Z`),
        hardBlock: true,
      },
      {
        name: 'Year-end sale',
        reason: 'Discouraged but not blocked — talk to your manager.',
        country: 'SG',
        startDate: new Date(`${thisYear}-12-15T00:00:00Z`),
        endDate: new Date(`${thisYear}-12-31T00:00:00Z`),
        hardBlock: false,
      },
      {
        name: 'Hari Raya peak (MY)',
        reason: 'Peak trading period for Malaysian stores.',
        country: 'MY',
        startDate: new Date(`${thisYear + 1}-03-10T00:00:00Z`),
        endDate: new Date(`${thisYear + 1}-03-25T00:00:00Z`),
        hardBlock: true,
      },
    ],
  })
  console.log('Blackout windows: 3 (2 hard, 1 warning-only)')


  // ==========================================================
  console.log('\n=== People ===')
  // ==========================================================

  type NewUser = Parameters<typeof prisma.user.create>[0]['data']
  async function person(
    data: Partial<NewUser> & { email: string; firstName: string; lastName: string },
  ) {
    return prisma.user.create({
      data: {
        passwordHash,
        mustChangePassword: false,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        employmentType: 'EMPLOYEE',
        citizenship: 'SG_CITIZEN',
        country: 'SG',
        company: 'iORA Fashion Pte Ltd',
        probationMonths: 3,
        ...data,
      } as NewUser,
    })
  }

  // --- Admins. Two of them, so the "last admin" guard and the rule that you
  //     cannot approve your own cycle both have somebody else to fall back on.
  const jin = await person({
    email: 'jin@company.com',
    firstName: 'Jin',
    lastName: 'Lee',
    role: 'HR',
    position: 'Group IT Director',
    department: 'HQ',
    employeeNumber: 'IORA-0001',
    nric: 'S8012345A',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9100 0001',
    startDate: subYears(now, 6),
    confirmationDate: subYears(now, 6),
  })

  const audrey = await person({
    email: 'audrey@iora.demo',
    firstName: 'Audrey',
    lastName: 'Wong',
    role: 'HR',
    position: 'Group Finance Director',
    department: 'Finance',
    employeeNumber: 'IORA-0002',
    nric: 'S8123456B',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9100 0002',
    startDate: subYears(now, 5),
    confirmationDate: subYears(now, 5),
  })

  // --- Leadership
  const sara = await person({
    email: 'sara@iora.demo',
    firstName: 'Sara',
    lastName: 'Tan',
    role: 'MANAGER',
    position: 'Managing Director',
    department: 'HQ',
    employeeNumber: 'IORA-0003',
    nric: 'S7712345C',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9111 0001',
    startDate: subYears(now, 9),
    confirmationDate: subYears(now, 9),
  })

  // --- HR, one per market, to show HR parity in both countries.
  const grace = await person({
    email: 'grace@iora.demo',
    firstName: 'Grace',
    lastName: 'Chua',
    role: 'HR',
    position: 'HR Manager',
    department: 'HR',
    employeeNumber: 'IORA-0004',
    nric: 'S8534567D',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9111 0002',
    startDate: subYears(now, 4),
    confirmationDate: subYears(now, 4),
    reportingManagerId: sara.id,
  })

  const hafiz = await person({
    email: 'hafiz@iora.demo',
    firstName: 'Hafiz',
    lastName: 'Rahman',
    role: 'HR',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    position: 'HR Executive (MY)',
    department: 'HR',
    employeeNumber: 'IORA-0005',
    gender: 'Male',
    nationality: 'Malaysian',
    phone: '+60 12 300 0001',
    startDate: subYears(now, 3),
    confirmationDate: subYears(now, 3),
    reportingManagerId: grace.id,
  })

  // --- Managers with real teams under them.
  const marcus = await person({
    email: 'marcus@iora.demo',
    firstName: 'Marcus',
    lastName: 'Lee',
    role: 'MANAGER',
    position: 'Retail Operations Manager',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0006',
    nric: 'S8645678E',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9111 0003',
    startDate: subYears(now, 5),
    confirmationDate: subYears(now, 5),
    reportingManagerId: sara.id,
  })

  const siti = await person({
    email: 'siti@iora.demo',
    firstName: 'Siti',
    lastName: 'Nurhaliza',
    role: 'MANAGER',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    position: 'Retail Operations Manager (MY)',
    department: 'Retail',
    employeeNumber: 'IORA-0007',
    gender: 'Female',
    nationality: 'Malaysian',
    phone: '+60 12 300 0002',
    startDate: subYears(now, 4),
    confirmationDate: subYears(now, 4),
    reportingManagerId: sara.id,
  })

  // --- Confirmed employee with a full history: the "rich profile" demo.
  const weiling = await person({
    email: 'weiling@iora.demo',
    firstName: 'Wei Ling',
    lastName: 'Tan',
    position: 'Senior Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0101',
    nric: 'S9312345F',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9222 0001',
    dateOfBirth: new Date('1993-04-18T00:00:00Z'),
    startDate: subYears(now, 3),
    confirmationDate: subMonths(subYears(now, 3), -3),
    reportingManagerId: marcus.id,
  })

  // --- On probation, ending in ~2 weeks: fires the probation reminder.
  const priya = await person({
    email: 'priya@iora.demo',
    firstName: 'Priya',
    lastName: 'Sharma',
    position: 'Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0102',
    nric: 'S0112345G',
    gender: 'Female',
    nationality: 'Singaporean',
    citizenship: 'SG_PR',
    phone: '+65 9222 0002',
    startDate: subMonths(addDays(now, 14), 3),
    probationEndDate: addDays(now, 14),
    reportingManagerId: marcus.id,
  })

  // --- No reporting manager at all. Before the §1 work this person could not
  //     submit leave or a timesheet; now both route to the fallback approver.
  const daniel = await person({
    email: 'daniel@iora.demo',
    firstName: 'Daniel',
    lastName: 'Ong',
    position: 'Visual Merchandiser',
    department: 'Marketing',
    employeeNumber: 'IORA-0103',
    nric: 'S9012345H',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9222 0003',
    startDate: subYears(now, 2),
    confirmationDate: subMonths(subYears(now, 2), -3),
    reportingManagerId: null,
  })

  const aisyah = await person({
    email: 'aisyah@iora.demo',
    firstName: 'Aisyah',
    lastName: 'Binti Yusof',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    position: 'Store Supervisor',
    department: 'Retail',
    employeeNumber: 'IORA-0104',
    gender: 'Female',
    nationality: 'Malaysian',
    phone: '+60 12 400 0001',
    startDate: subYears(now, 2),
    confirmationDate: subMonths(subYears(now, 2), -3),
    reportingManagerId: siti.id,
  })

  const lokman = await person({
    email: 'lokman@iora.demo',
    firstName: 'Lokman',
    lastName: 'Hakim',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    position: 'Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0105',
    gender: 'Male',
    nationality: 'Malaysian',
    phone: '+60 12 400 0002',
    startDate: subMonths(now, 8),
    confirmationDate: subMonths(now, 5),
    reportingManagerId: siti.id,
  })

  // --- Part-timers: the payroll engine's only input.
  //     Kumar (SG) and Chen Xiu (MY) prove per-country overtime rules;
  //     Tommy has NO hourly rate, which the payroll screen now warns about.
  const kumar = await person({
    email: 'kumar@iora.demo',
    firstName: 'Kumar',
    lastName: 'Raj',
    role: 'PARTTIME',
    employmentType: 'PART_TIME',
    position: 'Part-time Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0201',
    nric: 'S9512345J',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9333 0001',
    hourlyRate: '14.5000',
    hourlyRateWeekday: '14.5000',
    hourlyRateWeekend: '17.5000',
    normalDailyHours: '8.00',
    startDate: subYears(now, 1),
    confirmationDate: subMonths(subYears(now, 1), -3),
    reportingManagerId: marcus.id,
  })

  const chenxiu = await person({
    email: 'chenxiu@iora.demo',
    firstName: 'Chen',
    lastName: 'Xiu',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    role: 'PARTTIME',
    employmentType: 'PART_TIME',
    position: 'Part-time Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0202',
    gender: 'Female',
    nationality: 'Malaysian',
    phone: '+60 12 500 0001',
    hourlyRate: '12.0000',
    hourlyRateWeekday: '12.0000',
    hourlyRateWeekend: '14.4000',
    normalDailyHours: '8.00',
    startDate: subMonths(now, 14),
    confirmationDate: subMonths(now, 11),
    reportingManagerId: siti.id,
  })

  const tommy = await person({
    email: 'tommy@iora.demo',
    firstName: 'Tommy',
    lastName: 'Goh',
    role: 'PARTTIME',
    employmentType: 'PART_TIME',
    position: 'Part-time Stock Assistant',
    department: 'Logistics',
    employeeNumber: 'IORA-0203',
    nric: 'S9812345K',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9333 0002',
    // Deliberately no hourlyRate and no normalDailyHours.
    startDate: subMonths(now, 4),
    reportingManagerId: marcus.id,
  })

  // --- Foreign workers, one per work-pass reminder bucket.
  const nguyen = await person({
    email: 'nguyen@iora.demo',
    firstName: 'Nguyen',
    lastName: 'Van An',
    employmentType: 'CONTRACTOR',
    position: 'Warehouse Assistant',
    department: 'Logistics',
    employeeNumber: 'IORA-0301',
    passportNumber: 'C1234567',
    passportExpiry: addMonths(now, 30),
    gender: 'Male',
    nationality: 'Vietnamese',
    citizenship: 'FOREIGNER',
    phone: '+65 9444 0001',
    startDate: subYears(now, 2),
    confirmationDate: subMonths(subYears(now, 2), -3),
    reportingManagerId: marcus.id,
  })

  const rajesh = await person({
    email: 'rajesh@iora.demo',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    position: 'Assistant Store Manager',
    department: 'Retail',
    employeeNumber: 'IORA-0302',
    passportNumber: 'M7654321',
    passportExpiry: addMonths(now, 18),
    gender: 'Male',
    nationality: 'Indian',
    citizenship: 'FOREIGNER',
    phone: '+65 9444 0002',
    startDate: subYears(now, 3),
    confirmationDate: subMonths(subYears(now, 3), -3),
    reportingManagerId: marcus.id,
  })

  const fatimah = await person({
    email: 'fatimah@iora.demo',
    firstName: 'Fatimah',
    lastName: 'Zahra',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    position: 'Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0303',
    passportNumber: 'A9988776',
    passportExpiry: addMonths(now, 12),
    gender: 'Female',
    nationality: 'Indonesian',
    citizenship: 'FOREIGNER',
    phone: '+60 12 600 0001',
    startDate: subYears(now, 2),
    confirmationDate: subMonths(subYears(now, 2), -3),
    reportingManagerId: siti.id,
  })

  // --- Locked out of a learning test: the reset button needs a subject.
  const olivia = await person({
    email: 'olivia@iora.demo',
    firstName: 'Olivia',
    lastName: 'Tan',
    position: 'Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0106',
    nric: 'S0212345L',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9222 0004',
    startDate: subMonths(now, 2),
    probationEndDate: addMonths(now, 1),
    reportingManagerId: marcus.id,
  })

  // --- A leaver, so retained-records behaviour is visible.
  const ben = await person({
    email: 'ben@iora.demo',
    firstName: 'Ben',
    lastName: 'Chua',
    status: 'TERMINATED',
    position: 'Sales Associate',
    department: 'Retail',
    employeeNumber: 'IORA-0107',
    nric: 'S9412345M',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9222 0005',
    startDate: subYears(now, 2),
    confirmationDate: subMonths(subYears(now, 2), -3),
    terminatedAt: subDays(now, 21),
    reportingManagerId: marcus.id,
  })

  const everyone = [
    jin, audrey, sara, grace, hafiz, marcus, siti, weiling, priya, daniel,
    aisyah, lokman, kumar, chenxiu, tommy, nguyen, rajesh, fatimah, olivia, ben,
  ]
  const active = everyone.filter(u => u.status === 'ACTIVE')
  console.log(`People: ${everyone.length} (${active.length} active, 1 terminated)`)

  // Fallback approver — this is what makes Daniel (no manager) able to submit.
  await prisma.orgSetting.createMany({
    data: [
      { key: 'leave.fallbackApproverId', value: grace.id },
      { key: 'notify.emailEnabled', value: false }, // demo: don't email real people
      // Who signs an employment letter, by department. Pre-selected when a
      // letter is drafted; HR can override on any individual letter.
      {
        key: 'letters.departmentSignatories',
        value: {
          Retail: sara.id,
          'Retail Operations': sara.id,
          Logistics: marcus.id,
          HQ: sara.id,
          HR: grace.id,
          Finance: audrey.id,
          Marketing: sara.id,
          Design: sara.id,
          Merchandising: sara.id,
        },
      },
    ],
  })
  console.log('Org settings: fallback approver = Grace, email OFF, signatories mapped')

  // ==========================================================
  console.log('\n=== Leave ===')
  // ==========================================================

  // Balances for every active employee, with some already partly used.
  const annual = leaveTypes['Annual Leave']
  const sick = leaveTypes['Sick Leave']

  for (const u of active) {
    const tenureYears = u.startDate
      ? Math.max(0, Math.floor((now.getTime() - u.startDate.getTime()) / (365 * 864e5)))
      : 0
    const base = u.employmentType === 'PART_TIME' ? 8 : u.employmentType === 'CONTRACTOR' ? 14 : 18
    const entitlement = Math.min(base + tenureYears, 30)

    await prisma.leaveBalance.create({
      data: {
        userId: u.id,
        leaveTypeId: annual.id,
        year: thisYear,
        entitlement,
        used: u.id === weiling.id ? 7 : u.id === marcus.id ? 4 : 2,
        pending: 0,
        carryForward: u.id === weiling.id ? 5 : 0,
        carryForwardExpiresAt: u.id === weiling.id ? new Date(thisYear, 2, 31, 23, 59, 59) : null,
      },
    })
    await prisma.leaveBalance.create({
      data: {
        userId: u.id,
        leaveTypeId: sick.id,
        year: thisYear,
        entitlement: 14,
        used: u.id === priya.id ? 3 : 0,
      },
    })
  }
  console.log(`Leave balances: ${active.length * 2} (annual + sick)`)

  // An MC attachment, so the attachment path and its access rule are testable.
  const mcBlobId = await storeBlob(
    await makePdf('Medical Certificate', [
      'Patient: Priya Sharma',
      'Diagnosis: Acute upper respiratory infection',
      'Recommended rest: 2 days',
    ]),
  )

  const leaveRequests = [
    // PENDING → sits in Marcus's approval queue
    {
      userId: weiling.id,
      leaveTypeId: annual.id,
      startDate: addDays(now, 21),
      endDate: addDays(now, 25),
      daysCount: 5,
      status: 'PENDING' as const,
      approverId: marcus.id,
      reason: 'Family holiday to Penang',
    },
    // PENDING from the employee with no manager → routed to the HR fallback
    {
      userId: daniel.id,
      leaveTypeId: annual.id,
      startDate: addDays(now, 30),
      endDate: addDays(now, 31),
      daysCount: 2,
      status: 'PENDING' as const,
      approverId: grace.id,
      reason: 'Long weekend',
    },
    // PENDING sick leave with an attachment
    {
      userId: priya.id,
      leaveTypeId: sick.id,
      startDate: subDays(now, 2),
      endDate: subDays(now, 1),
      daysCount: 2,
      status: 'PENDING' as const,
      approverId: marcus.id,
      reason: 'Unwell — MC attached',
      attachmentBlobId: mcBlobId,
      attachmentName: 'medical-certificate.pdf',
    },
    // APPROVED
    {
      userId: aisyah.id,
      leaveTypeId: annual.id,
      startDate: subDays(now, 20),
      endDate: subDays(now, 18),
      daysCount: 3,
      status: 'APPROVED' as const,
      approverId: siti.id,
      approvedAt: subDays(now, 25),
      reason: 'Hari Raya visiting',
    },
    // REJECTED — reversible via reverseState
    {
      userId: lokman.id,
      leaveTypeId: annual.id,
      startDate: addDays(now, 40),
      endDate: addDays(now, 44),
      daysCount: 5,
      status: 'REJECTED' as const,
      approverId: siti.id,
      rejectionReason: 'Store is short-staffed that week — please pick another.',
    },
    // CANCELLED — also reversible
    {
      userId: kumar.id,
      leaveTypeId: annual.id,
      startDate: addDays(now, 10),
      endDate: addDays(now, 10),
      daysCount: 1,
      status: 'CANCELLED' as const,
      approverId: marcus.id,
      cancelledAt: subDays(now, 1),
      reason: 'Cancelled — plans changed',
    },
    // Approved future leave for the team calendar
    {
      userId: rajesh.id,
      leaveTypeId: annual.id,
      startDate: addDays(now, 7),
      endDate: addDays(now, 9),
      daysCount: 3,
      status: 'APPROVED' as const,
      approverId: marcus.id,
      approvedAt: subDays(now, 5),
    },
  ]

  for (const r of leaveRequests) {
    await prisma.leaveRequest.create({ data: r })
    if (r.status === 'PENDING') {
      await prisma.leaveBalance.updateMany({
        where: { userId: r.userId, leaveTypeId: r.leaveTypeId, year: thisYear },
        data: { pending: { increment: r.daysCount } },
      })
    }
  }
  console.log(`Leave requests: ${leaveRequests.length} (3 pending, 2 approved, 1 rejected, 1 cancelled)`)

  // ==========================================================
  console.log('\n=== Time & attendance ===')
  // ==========================================================

  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const partTimers = [kumar, chenxiu, tommy]
  let timeEntryCount = 0

  for (const pt of partTimers) {
    // Last month, APPROVED — this is what payroll reads.
    for (let d = 0; d < 18; d++) {
      const workDate = addDays(lastMonthStart, d)
      if (workDate.getUTCDay() === 0) continue // one rest day a week
      // Every 6th day is a long day, so overtime actually appears.
      const hours = d % 6 === 5 ? 10.5 : 8
      await prisma.timeEntry.create({
        data: {
          userId: pt.id,
          workDate,
          hoursWorked: String(hours),
          breakMinutes: 45,
          status: 'APPROVED',
          approverId: pt.id === chenxiu.id ? siti.id : marcus.id,
          submittedAt: subDays(now, 32),
          approvedAt: subDays(now, 30),
          // One public-holiday shift each, to exercise the PH multipliers.
          isPublicHoliday: d === 8,
        },
      })
      timeEntryCount++
    }

    // This week: a SUBMITTED day (approval queue) and a DRAFT day.
    await prisma.timeEntry.create({
      data: {
        userId: pt.id,
        workDate: subDays(now, 2),
        startTime: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 9, 0)),
        endTime: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, 18, 0)),
        hoursWorked: '8.00',
        breakMinutes: 60,
        status: 'SUBMITTED',
        approverId: pt.id === chenxiu.id ? siti.id : marcus.id,
        submittedAt: subDays(now, 1),
      },
    })
    await prisma.timeEntry.create({
      data: {
        userId: pt.id,
        workDate: subDays(now, 1),
        hoursWorked: '7.50',
        breakMinutes: 30,
        status: 'DRAFT',
      },
    })
    timeEntryCount += 2
  }

  // A REJECTED day — reversible, and the employee was notified.
  await prisma.timeEntry.create({
    data: {
      userId: kumar.id,
      workDate: subDays(now, 4),
      hoursWorked: '12.00',
      breakMinutes: 0,
      status: 'REJECTED',
      approverId: marcus.id,
      submittedAt: subDays(now, 3),
      rejectionReason: '12 hours with no break recorded — please correct and resubmit.',
    },
  })
  timeEntryCount++
  console.log(`Time entries: ${timeEntryCount} across 3 part-timers (approved / submitted / draft / rejected)`)

  // ==========================================================
  console.log('\n=== Performance ===')
  // ==========================================================

  const closedCycle = await prisma.reviewCycle.create({
    data: {
      name: `FY${thisYear - 1} Annual Review`,
      templateType: 'FULL',
      status: 'CLOSED',
      startDate: new Date(thisYear - 1, 0, 1),
      endDate: new Date(thisYear - 1, 11, 31),
      goalSettingDeadline: new Date(thisYear - 1, 1, 15),
      evaluationOpensAt: new Date(thisYear - 1, 10, 1),
      evaluationDeadline: new Date(thisYear - 1, 11, 15),
      createdById: grace.id,
    },
  })

  const evaluationCycle = await prisma.reviewCycle.create({
    data: {
      name: `FY${thisYear} Annual Review`,
      templateType: 'FULL',
      status: 'EVALUATION',
      startDate: new Date(thisYear, 0, 1),
      endDate: new Date(thisYear, 11, 31),
      goalSettingDeadline: new Date(thisYear, 1, 15),
      evaluationOpensAt: subDays(now, 14),
      evaluationDeadline: addDays(now, 21),
      includeSalesTarget: true,
      targetCurrency: 'SGD',
      includeAttendanceMetric: true,
      createdById: grace.id,
    },
  })

  const activeCycle = await prisma.reviewCycle.create({
    data: {
      name: `H2 ${thisYear} Check-in`,
      templateType: 'LITE',
      status: 'ACTIVE',
      startDate: startOfMonth(now),
      endDate: addMonths(now, 6),
      goalSettingDeadline: addDays(now, 14),
      createdById: grace.id,
    },
  })

  await prisma.reviewCycle.create({
    data: {
      name: 'Probation Reviews (rolling)',
      templateType: 'PROBATION',
      status: 'DRAFT',
      startDate: startOfMonth(now),
      endDate: addMonths(now, 12),
      minGoals: 0,
      createdById: grace.id,
    },
  })

  // Reviews across every status inside the EVALUATION cycle.
  const reviewSpecs = [
    { employee: weiling, manager: marcus, status: 'PENDING_ACKNOWLEDGEMENT' as const, rating: 4 },
    { employee: rajesh, manager: marcus, status: 'ACKNOWLEDGED' as const, rating: 5 },
    { employee: aisyah, manager: siti, status: 'IN_EVALUATION' as const, rating: null },
    { employee: lokman, manager: siti, status: 'GOALS_SET' as const, rating: null },
    { employee: kumar, manager: marcus, status: 'NOT_STARTED' as const, rating: null },
    // Daniel has no manager — the fallback resolved Grace as his reviewer
    // rather than making him review himself.
    { employee: daniel, manager: grace, status: 'GOALS_SET' as const, rating: null },
  ]

  for (const spec of reviewSpecs) {
    const review = await prisma.performanceReview.create({
      data: {
        cycleId: evaluationCycle.id,
        employeeId: spec.employee.id,
        managerId: spec.manager.id,
        status: spec.status,
        overallRating: spec.rating,
        managerNarrative: spec.rating
          ? 'Consistently strong on the floor; good rapport with regulars and reliable on stock discipline.'
          : null,
        salesTargetAmount: '250000.0000',
        salesActualAmount: spec.rating ? '268400.0000' : null,
        attendanceDaysWorked: spec.rating ? 243 : null,
        attendanceDaysScheduled: spec.rating ? 250 : null,
        promotionReady: spec.rating === 5 ? true : spec.rating ? false : null,
        submittedForEvaluationAt: spec.rating ? subDays(now, 6) : null,
        acknowledgedAt: spec.status === 'ACKNOWLEDGED' ? subDays(now, 2) : null,
        employeeAcknowledgement:
          spec.status === 'ACKNOWLEDGED' ? 'Thanks — happy with the feedback and the development plan.' : null,
      },
    })

    if (spec.status !== 'NOT_STARTED') {
      await prisma.goal.createMany({
        data: [
          {
            reviewId: review.id,
            title: 'Hit personal sales target',
            description: 'Quarterly sales target for own counter.',
            goalType: 'QUANTITATIVE',
            targetValue: '62500.0000',
            actualValue: spec.rating ? '67100.0000' : null,
            unit: 'SGD',
            weight: 50,
            outcome: spec.rating ? 'EXCEEDED' : 'NOT_EVALUATED',
            managerComment: spec.rating ? 'Beat target in three of four quarters.' : null,
          },
          {
            reviewId: review.id,
            title: 'Complete onboarding curriculum',
            description: 'All three Learning Hub modules plus the assessment.',
            goalType: 'QUALITATIVE',
            weight: 25,
            outcome: spec.rating ? 'MET' : 'NOT_EVALUATED',
          },
          {
            reviewId: review.id,
            title: 'Reduce stock discrepancy',
            description: 'Cycle-count variance under 1.5%.',
            goalType: 'QUANTITATIVE',
            targetValue: '1.5000',
            actualValue: spec.rating ? '1.1000' : null,
            unit: '%',
            weight: 25,
            outcome: spec.rating ? 'MET' : 'NOT_EVALUATED',
          },
        ],
      })
    }
  }

  // One completed review in the closed cycle, so history isn't empty.
  const closedReview = await prisma.performanceReview.create({
    data: {
      cycleId: closedCycle.id,
      employeeId: weiling.id,
      managerId: marcus.id,
      status: 'ACKNOWLEDGED',
      overallRating: 4,
      managerNarrative: 'Strong year. Ready for more responsibility on visual merchandising.',
      submittedForEvaluationAt: new Date(thisYear - 1, 11, 10),
      acknowledgedAt: new Date(thisYear - 1, 11, 14),
    },
  })
  console.log(`Performance: 4 cycles (draft/active/evaluation/closed), ${reviewSpecs.length + 1} reviews`)

  // ==========================================================
  console.log('\n=== Rewards ===')
  // ==========================================================

  const draftRewardCycle = await prisma.rewardCycle.create({
    data: {
      name: `FY${thisYear} Performance Bonus`,
      description: 'Annual performance bonus, pending finance sign-off.',
      status: 'DRAFT',
      reviewCycleId: evaluationCycle.id,
      totalPoolAmount: '120000.0000',
      currency: 'SGD',
      payoutDate: addMonths(now, 2),
      createdById: audrey.id,
    },
  })

  const paidRewardCycle = await prisma.rewardCycle.create({
    data: {
      name: `FY${thisYear - 1} Performance Bonus`,
      description: 'Paid out last cycle.',
      status: 'PAID',
      reviewCycleId: closedCycle.id,
      totalPoolAmount: '95000.0000',
      currency: 'SGD',
      payoutDate: subMonths(now, 6),
      createdById: audrey.id,
    },
  })

  await prisma.rewardAllocation.createMany({
    data: [
      // DRAFT cycle — proposed by Audrey, not yet approved.
      {
        cycleId: draftRewardCycle.id,
        employeeId: weiling.id,
        bonusType: 'PERFORMANCE',
        amount: '6200.0000',
        currency: 'SGD',
        rationale: 'Exceeded sales target; strong mentoring of new starters.',
        status: 'DRAFT',
        proposedById: audrey.id,
      },
      {
        cycleId: draftRewardCycle.id,
        employeeId: rajesh.id,
        bonusType: 'PERFORMANCE',
        amount: '7400.0000',
        currency: 'SGD',
        rationale: 'Outstanding rating; covered two stores through the transition.',
        status: 'DRAFT',
        proposedById: audrey.id,
      },
      {
        cycleId: draftRewardCycle.id,
        employeeId: marcus.id,
        bonusType: 'PERFORMANCE',
        amount: '9100.0000',
        currency: 'SGD',
        rationale: 'Regional targets met across all six stores.',
        status: 'DRAFT',
        proposedById: audrey.id,
      },
      // PAID cycle — history, linked to a real review.
      {
        cycleId: paidRewardCycle.id,
        employeeId: weiling.id,
        linkedReviewId: closedReview.id,
        bonusType: 'PERFORMANCE',
        amount: '5400.0000',
        currency: 'SGD',
        rationale: 'FY performance bonus.',
        status: 'PAID',
        proposedById: audrey.id,
        approverId: jin.id,
        approvedAt: subMonths(now, 7),
        paidAt: subMonths(now, 6),
      },
      {
        cycleId: paidRewardCycle.id,
        employeeId: aisyah.id,
        bonusType: 'CONTRACTUAL_13TH',
        amount: '3200.0000',
        currency: 'SGD',
        rationale: '13th month, contractual.',
        status: 'PAID',
        proposedById: audrey.id,
        approverId: jin.id,
        approvedAt: subMonths(now, 7),
        paidAt: subMonths(now, 6),
      },
    ],
  })
  console.log('Rewards: 2 cycles (1 draft with 3 allocations, 1 paid with 2)')

  // ==========================================================
  console.log('\n=== Learning ===')
  // ==========================================================

  const LESSONS = ['lesson1', 'lesson2', 'lesson3']
  const TESTS = ['test1', 'test2', 'test3']

  // Fully certified.
  for (const lessonId of LESSONS) {
    await prisma.learningLessonProgress.create({
      data: { userId: weiling.id, lessonId, slidesDone: true, pdfDone: true, videoDone: true, completedAt: subMonths(now, 2) },
    })
  }
  for (const testId of TESTS) {
    await prisma.learningTestProgress.create({
      data: { userId: weiling.id, testId, attempts: 1, passed: true, bestScore: 0.92, completedAt: subMonths(now, 2) },
    })
  }
  await prisma.learningSurvey.create({
    data: { userId: weiling.id, clarity: 5, pace: 4, usefulness: 5, comment: 'The cash-handling module was the most useful part.' },
  })

  // Part way through.
  await prisma.learningLessonProgress.create({
    data: { userId: priya.id, lessonId: 'lesson1', slidesDone: true, pdfDone: true, videoDone: true, completedAt: subDays(now, 20) },
  })
  await prisma.learningLessonProgress.create({
    data: { userId: priya.id, lessonId: 'lesson2', slidesDone: true, pdfDone: false, videoDone: false },
  })
  await prisma.learningTestProgress.create({
    data: { userId: priya.id, testId: 'test1', attempts: 2, passed: true, bestScore: 0.78, completedAt: subDays(now, 18) },
  })

  // LOCKED OUT after three failed attempts — the subject for the reset button.
  await prisma.learningLessonProgress.create({
    data: { userId: olivia.id, lessonId: 'lesson1', slidesDone: true, pdfDone: true, videoDone: true, completedAt: subDays(now, 10) },
  })
  await prisma.learningTestProgress.create({
    data: { userId: olivia.id, testId: 'test1', attempts: 3, passed: false, bestScore: 0.55, locked: true },
  })

  // Not started at all.
  await prisma.learningLessonProgress.create({
    data: { userId: tommy.id, lessonId: 'lesson1', slidesDone: true, pdfDone: false, videoDone: false },
  })
  console.log('Learning: 1 certified, 1 in progress, 1 LOCKED OUT, 1 barely started')

  // ==========================================================
  console.log('\n=== Work passes ===')
  // ==========================================================

  await prisma.workPass.createMany({
    data: [
      // Comfortably valid — outside every reminder window.
      {
        userId: nguyen.id,
        passType: 'SG_WORK_PERMIT',
        workPermitNumber: 'WP1234567',
        finNumber: 'G1234567X',
        issueDate: subYears(now, 1),
        expiryDate: addDays(now, 300),
        levy: '450.0000',
      },
      // Inside the EP window (120 days by default) — shows as "due".
      {
        userId: rajesh.id,
        passType: 'SG_EMPLOYMENT_PASS',
        passNumber: 'EP7654321',
        finNumber: 'G7654321Y',
        issueDate: subYears(now, 2),
        expiryDate: addDays(now, 95),
      },
      // EXPIRED — escalates to the whole HR group daily.
      {
        userId: fatimah.id,
        passType: 'MY_WORK_PERMIT',
        workPermitNumber: 'MYWP998877',
        issueDate: subYears(now, 2),
        expiryDate: subDays(now, 12),
        notes: 'Renewal submitted to Immigration — awaiting outcome.',
      },
      // Just inside the Work Permit window (60 days by default).
      {
        userId: lokman.id,
        passType: 'MY_EMPLOYMENT_PASS',
        passNumber: 'MYEP445566',
        issueDate: subMonths(now, 20),
        expiryDate: addDays(now, 55),
      },
      // Locals — recorded as NONE for tracking completeness.
      { userId: weiling.id, passType: 'NONE' },
      { userId: kumar.id, passType: 'NONE' },
    ],
  })
  console.log('Work passes: 1 ok, 2 due, 1 EXPIRED, 2 none')

  // ==========================================================
  console.log('\n=== Letters ===')
  // ==========================================================

  async function letterPdf(who: string, type: string) {
    return storeBlob(await makePdf(`${type} Letter`, [`Employee: ${who}`, `Issued: ${now.toDateString()}`]))
  }

  /**
   * The letter body lives on the letter as editable sections. The seed fills
   * them from the same defaults the app drafts from, so every letter in the
   * demo reads like a real one and the section editor has something to edit.
   */
  type LetterSubject = {
    firstName: string
    position: string | null
    department: string | null
    company: string | null
    country: string
  }

  function sectionsFor(kind: LetterKindName | null, who: LetterSubject): LetterSection[] {
    const values: Record<string, string> = {
      firstName: who.firstName,
      position: who.position ?? '',
      department: who.department ?? '',
      company: who.company ?? 'IORA Group',
      country: who.country === 'MY' ? 'Malaysia' : 'Singapore',
      startDate: '1 April ' + thisYear,
      probationMonths: '3',
      probationEndDate: '1 July ' + thisYear,
      confirmationDate: '1 July ' + thisYear,
      hourlyRate: '14.50',
      hourlyRateWeekday: '14.50',
      hourlyRateSaturday: '16.00',
      hourlyRateSundayPh: '18.00',
      hourlyRateWeekend: '17.50',
    }
    const base = kind ? defaultSectionsFor(kind) : confirmationSections()
    return base.map(section => ({
      id: section.id,
      title: mergeText(section.title, values),
      body: mergeText(section.body, values),
    }))
  }

  // A draft nobody has reviewed yet — the section editor's subject.
  await prisma.employmentLetter.create({
    data: {
      employeeId: olivia.id,
      type: 'EMPLOYMENT',
      kind: 'FT_RETAIL',
      status: 'PENDING_REVIEW',
      sections: sectionsFor('FT_RETAIL', olivia),
      approvingOfficerId: sara.id,
      blobId: await letterPdf('Olivia Tan', 'Employment'),
    },
  })

  // Signed by the Group and sitting with the employee: log in as Kumar to
  // countersign it, which is what opens his onboarding document request.
  await prisma.employmentLetter.create({
    data: {
      employeeId: kumar.id,
      type: 'EMPLOYMENT',
      kind: 'PT_RETAIL',
      status: 'SENT',
      sections: sectionsFor('PT_RETAIL', kumar),
      reviewedById: grace.id,
      reviewedAt: subDays(now, 5),
      approvingOfficerId: sara.id,
      signedAt: subDays(now, 3),
      sentAt: subDays(now, 3),
      blobId: await letterPdf('Kumar Raj', 'Employment'),
    },
  })

  // Countersigned, with the onboarding documents still outstanding — this is
  // what puts the banner on Priya's dashboard and a row in HR's tracker.
  await prisma.employmentLetter.create({
    data: {
      employeeId: priya.id,
      type: 'EMPLOYMENT',
      kind: 'FT_RETAIL',
      status: 'ACCEPTED',
      sections: sectionsFor('FT_RETAIL', priya),
      reviewedById: grace.id,
      reviewedAt: subMonths(now, 3),
      approvingOfficerId: sara.id,
      signedAt: subMonths(now, 3),
      sentAt: subMonths(now, 3),
      employeeAcceptedAt: subMonths(now, 3),
      blobId: await letterPdf('Priya Sharma', 'Employment'),
    },
  })

  // Waiting on a signatory, and past its due date — the cron chases this one.
  await prisma.employmentLetter.create({
    data: {
      employeeId: lokman.id,
      type: 'CONFIRMATION',
      status: 'PENDING_SIGNATURE',
      sections: sectionsFor(null, lokman),
      reviewedById: hafiz.id,
      reviewedAt: subDays(now, 12),
      approvingOfficerId: siti.id,
      dueDate: subDays(now, 3),
      overdue: true,
      blobId: await letterPdf('Lokman Hakim', 'Confirmation'),
    },
  })

  // Historical, fully complete: signed by both sides years ago.
  await prisma.employmentLetter.create({
    data: {
      employeeId: weiling.id,
      type: 'CONFIRMATION',
      status: 'ACCEPTED',
      sections: sectionsFor(null, weiling),
      reviewedById: grace.id,
      reviewedAt: subMonths(now, 33),
      approvingOfficerId: sara.id,
      signedAt: subMonths(now, 33),
      sentAt: subMonths(now, 33),
      employeeAcceptedAt: subMonths(now, 33),
      dueDate: subMonths(now, 33),
      blobId: await letterPdf('Wei Ling Tan', 'Confirmation'),
    },
  })

  // Rejected internally — re-draftable via reverseState.
  await prisma.employmentLetter.create({
    data: {
      employeeId: tommy.id,
      type: 'EMPLOYMENT',
      kind: 'PT_LOGISTICS',
      status: 'REJECTED',
      sections: sectionsFor('PT_LOGISTICS', tommy),
      rejectedById: grace.id,
      rejectedAt: subDays(now, 6),
      rejectionReason: 'Job title is wrong — should read Stock Assistant, not Sales Assistant.',
      blobId: await letterPdf('Tommy Goh', 'Employment'),
    },
  })

  // Declined by the employee — the outcome HR needs to see and act on.
  await prisma.employmentLetter.create({
    data: {
      employeeId: daniel.id,
      type: 'EMPLOYMENT',
      kind: 'FT_HQ',
      status: 'DECLINED',
      sections: sectionsFor('FT_HQ', daniel),
      reviewedById: grace.id,
      reviewedAt: subDays(now, 20),
      approvingOfficerId: sara.id,
      signedAt: subDays(now, 18),
      sentAt: subDays(now, 18),
      employeeDeclinedAt: subDays(now, 15),
      employeeDeclineReason: 'Accepted another offer closer to home.',
      blobId: await letterPdf('Daniel Ong', 'Employment'),
    },
  })
  console.log('Letters: 7 (draft / with employee / accepted / overdue / historical / rejected / declined)')

  // ==========================================================
  console.log('\n=== Onboarding documents (form 2) ===')
  // ==========================================================

  /** An onboarding upload, filed as a Document against the employee. */
  async function onboardingDoc(userId: string, name: string) {
    const doc = await prisma.document.create({
      data: {
        name,
        scope: 'EMPLOYEE',
        category: 'PERSONAL_DOCS',
        employeeId: userId,
        blobId: await storeBlob(await makePdf(name, ['Demo scan — not a real document'])),
        fileName: `${name}.pdf`,
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedById: userId,
      },
      select: { id: true },
    })
    return doc.id
  }

  // Outstanding: signed the letter, hasn't sent anything in. Priya is an SG PR,
  // so her form also asks for an entry permit and a PR grant date.
  await prisma.onboardingSubmission.create({
    data: { userId: priya.id, createdAt: subMonths(now, 3) },
  })

  // Complete, so the tracker has both states on it.
  await prisma.onboardingSubmission.create({
    data: {
      userId: weiling.id,
      createdAt: subMonths(now, 33),
      submittedAt: subMonths(now, 33),
      bankName: 'DBS',
      bankAccountName: 'Tan Wei Ling',
      // Obviously fake, and never shown in full anywhere but HR's own screen.
      bankAccountNumber: '0000123456',
      nricFrontDocId: await onboardingDoc(weiling.id, 'NRIC (front)'),
      nricBackDocId: await onboardingDoc(weiling.id, 'NRIC (back)'),
      bankProofDocId: await onboardingDoc(weiling.id, 'Bank account details'),
    },
  })
  console.log('Onboarding: 1 outstanding (Priya, SG PR), 1 complete (Wei Ling)')

  // ==========================================================
  console.log('\n=== Candidates ===')
  // ==========================================================

  const cvBlobId = await storeBlob(
    await makePdf('Curriculum Vitae', ['Demo CV — not a real person', 'Retail experience: 3 years']),
  )

  await prisma.candidate.create({
    data: {
      firstName: 'Aisyah',
      lastName: 'Rahim',
      email: 'aisyah.rahim@example.com',
      phone: '+65 9800 1001',
      dateOfBirth: subYears(now, 24),
      nationality: 'Singaporean',
      citizenship: 'SG_CITIZEN',
      positionApplied: 'Sales Associate',
      department: 'Retail',
      employmentTypeWanted: 'EMPLOYEE',
      earliestStartDate: addDays(now, 21),
      resumeBlobId: cvBlobId,
      resumeFileName: 'Aisyah Rahim CV.pdf',
      createdAt: subDays(now, 2),
    },
  })

  await prisma.candidate.create({
    data: {
      firstName: 'Wesley',
      lastName: 'Ng',
      email: 'wesley.ng@example.com',
      phone: '+65 9800 1002',
      dateOfBirth: subYears(now, 31),
      nationality: 'Singaporean',
      citizenship: 'SG_CITIZEN',
      positionApplied: 'Warehouse Assistant',
      department: 'Logistics',
      employmentTypeWanted: 'PART_TIME',
      earliestStartDate: addDays(now, 7),
      createdAt: subDays(now, 1),
    },
  })

  // Shortlisted: the "record the outcome" buttons need a subject.
  await prisma.candidate.create({
    data: {
      firstName: 'Nurul',
      lastName: 'Huda',
      email: 'nurul.huda@example.com',
      phone: '+60 12 700 2001',
      dateOfBirth: subYears(now, 27),
      nationality: 'Malaysian',
      citizenship: 'FOREIGNER',
      positionApplied: 'Visual Merchandiser',
      department: 'Merchandising',
      employmentTypeWanted: 'EMPLOYEE',
      earliestStartDate: addDays(now, 30),
      status: 'FOR_INTERVIEW',
      sentToInterviewAt: subDays(now, 3),
      decidedById: grace.id,
      notes: 'Strong portfolio. Interview booked with Marcus for Thursday.',
      createdAt: subDays(now, 9),
    },
  })

  // Already hired — the application Priya arrived through.
  await prisma.candidate.create({
    data: {
      firstName: priya.firstName,
      lastName: priya.lastName,
      email: priya.email,
      phone: priya.phone,
      dateOfBirth: priya.dateOfBirth,
      nationality: priya.nationality,
      citizenship: 'SG_PR',
      positionApplied: 'Sales Associate',
      department: 'Retail',
      employmentTypeWanted: 'EMPLOYEE',
      status: 'PASSED',
      sentToInterviewAt: subMonths(now, 4),
      decidedAt: subMonths(now, 3),
      decidedById: grace.id,
      hiredUserId: priya.id,
      notes: 'Interviewed well. Offered Sales Associate on standard retail terms.',
      createdAt: subMonths(now, 4),
    },
  })

  // Archived, with the reason on the record.
  await prisma.candidate.create({
    data: {
      firstName: 'Bryan',
      lastName: 'Teo',
      email: 'bryan.teo@example.com',
      phone: '+65 9800 1003',
      dateOfBirth: subYears(now, 22),
      nationality: 'Singaporean',
      citizenship: 'SG_CITIZEN',
      positionApplied: 'Sales Associate',
      department: 'Retail',
      status: 'ARCHIVED',
      sentToInterviewAt: subDays(now, 25),
      decidedAt: subDays(now, 18),
      decidedById: grace.id,
      notes: 'Withdrew before the interview — took a full-time role elsewhere.',
      createdAt: subDays(now, 30),
    },
  })
  console.log('Candidates: 2 new, 1 for interview, 1 hired, 1 archived')

  // A scan filed against a work pass, so the attachment list is not empty.
  const nguyenPass = await prisma.workPass.findFirst({
    where: { userId: nguyen.id },
    select: { id: true },
  })
  if (nguyenPass) {
    await prisma.workPassDocument.create({
      data: {
        workPassId: nguyenPass.id,
        blobId: await storeBlob(
          await makePdf('Work Permit card', ['Demo scan — not a real permit']),
        ),
        fileName: 'WP1234567 card.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        label: 'Pass card (front)',
        uploadedById: grace.id,
      },
    })
    console.log('Work-pass attachments: 1 (Nguyen, pass card)')
  }

  // ==========================================================
  console.log('\n=== Documents ===')
  // ==========================================================

  // Company-wide — readable by everyone.
  const handbookBlob = await storeBlob(
    await makePdf('Employee Handbook', ['Version 4.2', 'Applies to all SG and MY staff']),
  )
  await prisma.document.create({
    data: {
      name: 'Employee Handbook 2026',
      scope: 'COMPANY',
      category: 'OTHER',
      blobId: handbookBlob,
      fileName: 'employee-handbook-2026.pdf',
      fileSize: 1400,
      mimeType: 'application/pdf',
      uploadedById: grace.id,
    },
  })

  // Mass-pushed payslip: ONE blob, several Document rows, refCount matching.
  const payslipRecipients = [weiling, priya, kumar, rajesh]
  const payslipBlob = await storeBlob(
    await makePdf('Payslip', ['Period: last month', 'This file is shared by several employees']),
    'application/pdf',
    payslipRecipients.length,
  )
  for (const r of payslipRecipients) {
    await prisma.document.create({
      data: {
        name: 'Payslip — last month',
        scope: 'EMPLOYEE',
        category: 'PAYSLIPS',
        employeeId: r.id,
        blobId: payslipBlob,
        fileName: 'payslip.pdf',
        fileSize: 1300,
        mimeType: 'application/pdf',
        uploadedById: audrey.id,
      },
    })
  }

  // MEDICAL — HR and the employee only, never a manager.
  await prisma.document.create({
    data: {
      name: 'Medical certificate — March',
      scope: 'EMPLOYEE',
      category: 'MEDICAL',
      employeeId: priya.id,
      blobId: mcBlobId,
      fileName: 'medical-certificate.pdf',
      fileSize: 1200,
      mimeType: 'application/pdf',
      uploadedById: grace.id,
    },
  })
  await prisma.fileBlob.update({ where: { id: mcBlobId }, data: { refCount: { increment: 1 } } })

  // A contract, and a leaver's retained records.
  await prisma.document.create({
    data: {
      name: 'Employment contract',
      scope: 'EMPLOYEE',
      category: 'CONTRACTS',
      employeeId: weiling.id,
      blobId: await storeBlob(await makePdf('Employment Contract', ['Employee: Wei Ling Tan'])),
      fileName: 'contract-weiling.pdf',
      fileSize: 1250,
      mimeType: 'application/pdf',
      uploadedById: grace.id,
    },
  })
  await prisma.document.create({
    data: {
      name: 'Employment contract (retained after exit)',
      scope: 'EMPLOYEE',
      category: 'CONTRACTS',
      employeeId: ben.id,
      blobId: await storeBlob(await makePdf('Employment Contract', ['Employee: Ben Chua (leaver)'])),
      fileName: 'contract-ben.pdf',
      fileSize: 1250,
      mimeType: 'application/pdf',
      uploadedById: grace.id,
    },
  })
  console.log('Documents: 8 rows over 6 blobs (1 company-wide, 1 mass-pushed ×4, 1 medical, 2 contracts)')

  // ==========================================================
  console.log('\n=== Notifications, journeys, audit ===')
  // ==========================================================

  await prisma.notification.createMany({
    data: [
      {
        userId: marcus.id,
        type: 'LEAVE_SUBMITTED',
        title: 'Leave request from Wei Ling Tan',
        body: 'Annual Leave · 5 day(s). Waiting for your approval.',
        linkUrl: '/approvals',
      },
      {
        userId: marcus.id,
        type: 'TIMESHEET_SUBMITTED',
        title: 'Timesheet submitted by Kumar Raj',
        body: '1 day for this week needs approval.',
        linkUrl: '/time/approvals',
      },
      {
        userId: grace.id,
        type: 'LEARNING_LOCKED_OUT',
        title: 'Learning lockout: Olivia Tan — test1',
        body: 'Olivia Tan has used all attempts on test1 and is locked out. Reset their access from Learning Progress.',
        linkUrl: '/admin/learning',
      },
      {
        userId: grace.id,
        type: 'WORK_PASS_EXPIRING',
        title: 'EXPIRED work pass: Fatimah Zahra',
        body: 'MY_WORK_PERMIT expired 12 days ago and has not been renewed in the system.',
        linkUrl: '/admin/work-passes',
      },
      {
        userId: weiling.id,
        type: 'PERFORMANCE_ACK_REQUIRED',
        title: 'Your performance review is ready to read',
        body: `FY${thisYear} Annual Review — waiting for your acknowledgement.`,
        linkUrl: '/performance',
        readAt: subDays(now, 1),
      },
      {
        userId: kumar.id,
        type: 'TIMESHEET_REJECTED',
        title: 'A timesheet day was sent back to you',
        body: '12 hours with no break recorded — please correct and resubmit.',
        linkUrl: '/time',
      },
      {
        userId: olivia.id,
        type: 'LEARNING_LOCKED_OUT',
        title: 'You are locked out of test1',
        body: 'HR has been notified and can reset your access.',
        linkUrl: '/learning',
      },
    ],
  })

  // Career journeys for the profile timeline.
  await prisma.careerEvent.createMany({
    data: [
      { userId: weiling.id, type: 'JOINED', title: 'Joined as Sales Associate', detail: 'Retail Operations', effectiveDate: subYears(now, 3) },
      { userId: weiling.id, type: 'CONFIRMED', title: 'Confirmed after probation', effectiveDate: subMonths(subYears(now, 3), -3) },
      { userId: weiling.id, type: 'POSITION_CHANGE', title: 'Promoted to Senior Sales Associate', fromValue: 'Sales Associate', toValue: 'Senior Sales Associate', effectiveDate: subYears(now, 1) },
      { userId: priya.id, type: 'JOINED', title: 'Joined as Sales Associate', detail: 'Retail Operations', effectiveDate: subMonths(addDays(now, 14), 3) },
      { userId: ben.id, type: 'JOINED', title: 'Joined as Sales Associate', effectiveDate: subYears(now, 2) },
      { userId: ben.id, type: 'TERMINATED', title: 'Left the company', detail: 'Resignation', effectiveDate: subDays(now, 21) },
    ],
  })

  // A few audit rows so /admin/audit isn't empty, including an exception.
  await prisma.auditLog.createMany({
    data: [
      {
        userId: grace.id,
        action: 'USER_UPDATED',
        entityType: 'USER',
        entityId: weiling.id,
        details: { changed: { phone: { from: '+65 9222 9999', to: '+65 9222 0001' }, nric: { changed: true } } },
      },
      {
        userId: audrey.id,
        action: 'PAYROLL_EXPORTED',
        entityType: 'PAYROLL',
        details: { month: `${thisYear}-0${Math.max(1, now.getMonth())}`, employeeCount: 3, includesEmails: true, includesPayRates: true },
      },
      {
        userId: jin.id,
        action: 'SETTING_UPDATED',
        entityType: 'SETTING',
        entityId: 'leave.fallbackApproverId',
        details: { key: 'leave.fallbackApproverId', from: null, to: grace.id },
      },
      {
        userId: grace.id,
        action: 'LEAVE_REVERSED',
        entityType: 'LEAVE',
        details: { reversal: true, from: 'CANCELLED', to: 'PENDING', reason: 'Cancelled by mistake — employee still wants the day.' },
      },
    ],
  })
  console.log('Notifications: 7 · Career events: 6 · Audit rows: 4')

  // ==========================================================
  const blobCount = await prisma.fileBlob.count()
  const blobBytes = await prisma.fileBlob.aggregate({ _sum: { fileSize: true } })
  console.log('\n=== Done ===')
  console.log(`Files in Postgres: ${blobCount} blobs, ${((blobBytes._sum.fileSize ?? 0) / 1024).toFixed(1)} KB`)
  console.log(`
Logins — password "test123" for everyone:
  HR         jin@company.com       Jin Lee (Group IT Director — full access)
  HR         audrey@iora.demo      Audrey Wong (Finance — approves bonuses)
  HR         grace@iora.demo       Grace Chua (SG) — fallback approver, hiring
  HR         hafiz@iora.demo       Hafiz Rahman (MY)
  MANAGER    sara@iora.demo        Sara Tan (MD — letter signer)
  MANAGER    marcus@iora.demo      Marcus Lee (SG team + approvals queue)
  MANAGER    siti@iora.demo        Siti Nurhaliza (MY team)
  EMPLOYEE   weiling@iora.demo     Wei Ling Tan (rich history, certified, onboarding complete)
  EMPLOYEE   priya@iora.demo       Priya Sharma (SG PR — onboarding documents OUTSTANDING)
  EMPLOYEE   daniel@iora.demo      Daniel Ong (NO manager — fallback routing; DECLINED his letter)
  EMPLOYEE   olivia@iora.demo      Olivia Tan (LOCKED OUT of test1; letter in draft)
  PARTTIME   kumar@iora.demo       Kumar Raj (letter WAITING FOR HIS SIGNATURE, SG payroll)
  PARTTIME   chenxiu@iora.demo     Chen Xiu (MY payroll)
  PARTTIME   tommy@iora.demo       Tommy Goh (NO hourly rate — payroll warning)
  EMPLOYEE   nguyen@iora.demo      Nguyen Van An (work permit valid, pass card attached)
  EMPLOYEE   rajesh@iora.demo      Rajesh Kumar (EP renewal due)
  EMPLOYEE   fatimah@iora.demo     Fatimah Zahra (work pass EXPIRED)
  EMPLOYEE   ben@iora.demo         Ben Chua (TERMINATED — cannot log in)

Try: /apply (no login needed) → Candidates → send Nurul to interview → pass her
     to create an account, email a temporary password and draft her letter.
`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
