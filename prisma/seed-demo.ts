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
import { buildPlaceholderTemplate } from '../src/lib/letterTemplate'
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
  'ExpenseApproval',
  'ExpenseReceipt',
  'Expense',
  'TimeEntry',
  'LeaveRequest',
  'LeaveBalance',
  'LeaveType',
  'Document',
  'EmploymentLetter',
  'LetterTemplate',
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

/** A tiny but valid PDF, so documents and receipts are really openable. */
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

  // Letter templates — placeholders, so the letters flow works immediately.
  for (const type of ['EMPLOYMENT', 'CONFIRMATION'] as const) {
    const bytes = await buildPlaceholderTemplate(type)
    const blobId = await storeBlob(bytes)
    const fieldNames = (await PDFDocument.load(bytes))
      .getForm()
      .getFields()
      .map(f => f.getName())
    await prisma.letterTemplate.create({
      data: {
        type,
        blobId,
        fileName: `${type === 'EMPLOYMENT' ? 'Employment' : 'Confirmation'} Letter (placeholder).pdf`,
        fieldNames,
        isPlaceholder: true,
      },
    })
  }
  console.log('Letter templates: EMPLOYMENT + CONFIRMATION (placeholders)')

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
    role: 'ADMIN',
    position: 'Group IT Director',
    department: 'Technology',
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
    role: 'ADMIN',
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
    department: 'Executive',
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
    department: 'Human Resources',
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
    department: 'Human Resources',
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
    department: 'Retail Operations',
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
    department: 'Retail Operations',
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
    department: 'Retail Operations',
    employeeNumber: 'IORA-0102',
    nric: 'S0112345G',
    gender: 'Female',
    nationality: 'Singapore PR',
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
    department: 'Retail Operations',
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
    department: 'Retail Operations',
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
    employmentType: 'PART_TIME',
    position: 'Part-time Sales Associate',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0201',
    nric: 'S9512345J',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9333 0001',
    hourlyRate: '14.5000',
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
    employmentType: 'PART_TIME',
    position: 'Part-time Sales Associate',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0202',
    gender: 'Female',
    nationality: 'Malaysian',
    phone: '+60 12 500 0001',
    hourlyRate: '12.0000',
    normalDailyHours: '8.00',
    startDate: subMonths(now, 14),
    confirmationDate: subMonths(now, 11),
    reportingManagerId: siti.id,
  })

  const tommy = await person({
    email: 'tommy@iora.demo',
    firstName: 'Tommy',
    lastName: 'Goh',
    employmentType: 'PART_TIME',
    position: 'Part-time Stock Assistant',
    department: 'Warehouse',
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
    role: 'CONTRACTOR',
    employmentType: 'CONTRACTOR',
    position: 'Warehouse Assistant',
    department: 'Warehouse',
    employeeNumber: 'IORA-0301',
    passportNumber: 'C1234567',
    passportExpiry: addMonths(now, 30),
    gender: 'Male',
    nationality: 'Vietnamese',
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
    department: 'Retail Operations',
    employeeNumber: 'IORA-0302',
    passportNumber: 'M7654321',
    passportExpiry: addMonths(now, 18),
    gender: 'Male',
    nationality: 'Indian',
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
    department: 'Retail Operations',
    employeeNumber: 'IORA-0303',
    passportNumber: 'A9988776',
    passportExpiry: addMonths(now, 12),
    gender: 'Female',
    nationality: 'Indonesian',
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
    department: 'Retail Operations',
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
    department: 'Retail Operations',
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
    ],
  })
  console.log('Org settings: fallback approver = Grace, notification email OFF')

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
  console.log('\n=== Expenses ===')
  // ==========================================================

  async function receipt(label: string, amount: string) {
    return storeBlob(
      await makePdf('Receipt', [`Merchant: ${label}`, `Amount: ${amount}`, `Date: ${now.toDateString()}`]),
    )
  }

  const expenseSpecs = [
    { user: weiling, merchant: 'Grab', amount: '28.4000', currency: 'SGD', category: 'LOCAL_TRANSPORT' as const, status: 'DRAFT' as const, approver: null },
    { user: weiling, merchant: 'Kopitiam Catering', amount: '156.0000', currency: 'SGD', category: 'MEALS_ENTERTAINMENT' as const, status: 'FOR_APPROVAL' as const, approver: audrey },
    { user: aisyah, merchant: 'Grab MY', amount: '64.5000', currency: 'MYR', category: 'LOCAL_TRANSPORT' as const, status: 'FOR_APPROVAL' as const, approver: audrey },
    { user: marcus, merchant: 'Officeworks', amount: '312.9000', currency: 'SGD', category: 'OFFICE_EXPENSES' as const, status: 'APPROVED' as const, approver: audrey },
    { user: rajesh, merchant: 'Singapore Airlines', amount: '890.0000', currency: 'SGD', category: 'TRAVEL' as const, status: 'REIMBURSED' as const, approver: audrey },
    { user: lokman, merchant: 'Watsons', amount: '45.2000', currency: 'MYR', category: 'MEDICAL' as const, status: 'REJECTED' as const, approver: audrey },
  ]

  for (const spec of expenseSpecs) {
    const blobId = await receipt(spec.merchant, `${spec.currency} ${spec.amount}`)
    const expense = await prisma.expense.create({
      data: {
        userId: spec.user.id,
        category: spec.category,
        amount: spec.amount,
        currency: spec.currency,
        merchant: spec.merchant,
        receiptDate: subDays(now, 12),
        description: `${spec.merchant} — demo claim`,
        status: spec.status,
        approverId: spec.approver?.id ?? null,
        submittedAt: spec.status === 'DRAFT' ? null : subDays(now, 10),
        reimbursedAt: spec.status === 'REIMBURSED' ? subDays(now, 3) : null,
        reimbursedById: spec.status === 'REIMBURSED' ? audrey.id : null,
        receipts: {
          create: {
            blobId,
            fileName: `${spec.merchant.toLowerCase().replace(/\s+/g, '-')}-receipt.pdf`,
            fileSize: 1200,
            mimeType: 'application/pdf',
            uploadedById: spec.user.id,
          },
        },
      },
    })

    if (spec.approver) {
      await prisma.expenseApproval.create({
        data: {
          expenseId: expense.id,
          approverId: spec.approver.id,
          status:
            spec.status === 'FOR_APPROVAL'
              ? 'PENDING'
              : spec.status === 'REJECTED'
                ? 'REJECTED'
                : 'APPROVED',
          comment: spec.status === 'REJECTED' ? 'Personal medical purchase — not claimable.' : null,
          actedAt: spec.status === 'FOR_APPROVAL' ? null : subDays(now, 8),
          order: 1,
        },
      })
    }
  }
  console.log(`Expenses: ${expenseSpecs.length} (draft / for-approval ×2 / approved / reimbursed / rejected)`)

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

  await prisma.employmentLetter.create({
    data: {
      employeeId: olivia.id,
      type: 'EMPLOYMENT',
      status: 'PENDING_REVIEW',
      blobId: await letterPdf('Olivia Tan', 'Employment'),
    },
  })
  await prisma.employmentLetter.create({
    data: {
      employeeId: priya.id,
      type: 'EMPLOYMENT',
      status: 'PENDING_SIGNATURE',
      reviewedById: grace.id,
      reviewedAt: subDays(now, 4),
      approvingOfficerId: sara.id,
      blobId: await letterPdf('Priya Sharma', 'Employment'),
    },
  })
  await prisma.employmentLetter.create({
    data: {
      employeeId: weiling.id,
      type: 'CONFIRMATION',
      status: 'SENT',
      reviewedById: grace.id,
      reviewedAt: subMonths(now, 33),
      approvingOfficerId: sara.id,
      signedAt: subMonths(now, 33),
      sentAt: subMonths(now, 33),
      dueDate: subMonths(now, 33),
      blobId: await letterPdf('Wei Ling Tan', 'Confirmation'),
    },
  })
  // OVERDUE confirmation — the cron chases this one.
  await prisma.employmentLetter.create({
    data: {
      employeeId: lokman.id,
      type: 'CONFIRMATION',
      status: 'PENDING_SIGNATURE',
      reviewedById: hafiz.id,
      reviewedAt: subDays(now, 12),
      approvingOfficerId: siti.id,
      dueDate: subDays(now, 3),
      overdue: true,
      blobId: await letterPdf('Lokman Hakim', 'Confirmation'),
    },
  })
  // REJECTED — re-draftable via reverseState.
  await prisma.employmentLetter.create({
    data: {
      employeeId: tommy.id,
      type: 'EMPLOYMENT',
      status: 'REJECTED',
      rejectedById: grace.id,
      rejectedAt: subDays(now, 6),
      rejectionReason: 'Job title is wrong — should read Stock Assistant, not Sales Assistant.',
      blobId: await letterPdf('Tommy Goh', 'Employment'),
    },
  })
  console.log('Letters: 5 (pending review / pending signature / sent / overdue / rejected)')

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
        userId: rajesh.id,
        type: 'EXPENSE_REIMBURSED',
        title: 'Your expense claim was reimbursed',
        body: 'SGD 890.00 — Singapore Airlines',
        linkUrl: '/expenses',
        readAt: subDays(now, 2),
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
  console.log('Notifications: 8 · Career events: 6 · Audit rows: 4')

  // ==========================================================
  const blobCount = await prisma.fileBlob.count()
  const blobBytes = await prisma.fileBlob.aggregate({ _sum: { fileSize: true } })
  console.log('\n=== Done ===')
  console.log(`Files in Postgres: ${blobCount} blobs, ${((blobBytes._sum.fileSize ?? 0) / 1024).toFixed(1)} KB`)
  console.log(`
Logins — password "test123" for everyone:
  ADMIN      jin@company.com       Jin Lee (Group IT Director)
  ADMIN      audrey@iora.demo      Audrey Wong (Finance — approves expenses/bonuses)
  HR         grace@iora.demo       Grace Chua (SG) — fallback approver
  HR         hafiz@iora.demo       Hafiz Rahman (MY)
  MANAGER    sara@iora.demo        Sara Tan (MD — letter signer)
  MANAGER    marcus@iora.demo      Marcus Lee (SG team + approvals queue)
  MANAGER    siti@iora.demo        Siti Nurhaliza (MY team)
  EMPLOYEE   weiling@iora.demo     Wei Ling Tan (rich history, certified, review to ack)
  EMPLOYEE   priya@iora.demo       Priya Sharma (on probation, MC on file)
  EMPLOYEE   daniel@iora.demo      Daniel Ong (NO manager — tests fallback routing)
  EMPLOYEE   olivia@iora.demo      Olivia Tan (LOCKED OUT of test1)
  PART_TIME  kumar@iora.demo       Kumar Raj (SG payroll + rejected timesheet day)
  PART_TIME  chenxiu@iora.demo     Chen Xiu (MY payroll)
  PART_TIME  tommy@iora.demo       Tommy Goh (NO hourly rate — payroll warning)
  CONTRACTOR nguyen@iora.demo      Nguyen Van An (work permit, valid)
  EMPLOYEE   rajesh@iora.demo      Rajesh Kumar (EP renewal due)
  EMPLOYEE   fatimah@iora.demo     Fatimah Zahra (work pass EXPIRED)
  EMPLOYEE   ben@iora.demo         Ben Chua (TERMINATED — cannot log in)
`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
