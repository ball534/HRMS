/**
 * Demo seed — a presentation-ready fake company.
 *
 * Builds on the base seed (run `npm run db:seed` first for holidays, leave
 * types, and the jin@company.com admin), then creates ~14 employees at
 * `@iora.demo` addresses covering every story in the HRMS + LMS demo:
 * probation reminders, letter review/signing, an overdue confirmation,
 * work passes in every reminder bucket, archived leavers, leave balances
 * and requests, learning progress (incl. a lockout), and career journeys.
 *
 * Idempotent: re-running deletes and recreates all `@iora.demo` users.
 * All dates are relative to "today" so the demo always looks current.
 *
 * Every demo login uses password `test123` (no forced change).
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { addDays, addMonths, subDays, subMonths, subYears } from 'date-fns'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const now = new Date()
const PASSWORD = 'test123'

async function main() {
  console.log('Seeding demo company...')
  const passwordHash = await bcrypt.hash(PASSWORD, 12)

  // ---------- wipe previous demo data (children without cascade first) ----------
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@iora.demo' } },
    select: { id: true },
  })
  const demoIds = demoUsers.map(u => u.id)
  if (demoIds.length > 0) {
    await prisma.leaveRequest.deleteMany({ where: { userId: { in: demoIds } } })
    await prisma.leaveRequest.deleteMany({ where: { approverId: { in: demoIds } } })
    await prisma.leaveBalance.deleteMany({ where: { userId: { in: demoIds } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: demoIds } } })
    await prisma.employmentLetter.deleteMany({
      where: {
        OR: [
          { employeeId: { in: demoIds } },
          { approvingOfficerId: { in: demoIds } },
          { reviewedById: { in: demoIds } },
          { rejectedById: { in: demoIds } },
        ],
      },
    })
    await prisma.user.updateMany({
      where: { reportingManagerId: { in: demoIds } },
      data: { reportingManagerId: null },
    })
    await prisma.user.deleteMany({ where: { id: { in: demoIds } } })
    console.log(`Removed ${demoIds.length} previous demo users`)
  }

  // ---------- shared helper ----------
  type NewUser = Parameters<typeof prisma.user.create>[0]['data']
  async function employee(data: Partial<NewUser> & { email: string; firstName: string; lastName: string }) {
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

  // ---------- leadership ----------
  const sara = await employee({
    email: 'sara@iora.demo',
    firstName: 'Sara',
    lastName: 'Tan',
    role: 'MANAGER',
    position: 'Managing Director',
    department: 'Executive',
    employeeNumber: 'IORA-0001',
    nric: 'S7712345A',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9111 0001',
    startDate: subYears(now, 8),
    confirmationDate: subYears(now, 8 - 1),
  })

  // Upgrade the base-seed admin (jin@company.com) into a full demo profile so
  // "My Profile → My Journey" works when presenting as the logged-in admin.
  const jin = await prisma.user.update({
    where: { email: 'jin@company.com' },
    data: {
      mustChangePassword: false,
      passwordHash,
      position: 'HR Administrator',
      department: 'Human Resources',
      company: 'iORA Fashion Pte Ltd',
      employeeNumber: 'IORA-0002',
      nric: 'S8823456B',
      gender: 'Male',
      nationality: 'Singaporean',
      phone: '+65 9111 0002',
      startDate: subYears(now, 3),
      confirmationDate: addMonths(subYears(now, 3), 3),
      probationEndDate: addMonths(subYears(now, 3), 3),
      reportingManagerId: sara.id,
    },
  })

  const grace = await employee({
    email: 'grace@iora.demo',
    firstName: 'Grace',
    lastName: 'Lim',
    role: 'HR',
    position: 'HR Executive',
    department: 'Human Resources',
    employeeNumber: 'IORA-0003',
    nric: 'S9034567C',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9111 0003',
    startDate: subYears(now, 2),
    confirmationDate: addMonths(subYears(now, 2), 3),
    probationEndDate: addMonths(subYears(now, 2), 3),
    reportingManagerId: jin.id,
  })

  // ---------- long-tenure employee: rich career journey + LMS progress ----------
  const weiling = await employee({
    email: 'weiling@iora.demo',
    firstName: 'Wei Ling',
    lastName: 'Chua',
    position: 'Store Manager',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0104',
    nric: 'S9145678D',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9222 0104',
    dateOfBirth: new Date('1994-05-14'),
    startDate: subYears(now, 4),
    confirmationDate: addMonths(subYears(now, 4), 3),
    probationEndDate: addMonths(subYears(now, 4), 3),
    reportingManagerId: sara.id,
    role: 'MANAGER',
  })

  const marcus = await employee({
    email: 'marcus@iora.demo',
    firstName: 'Marcus',
    lastName: 'Ong',
    position: 'E-Commerce Manager',
    department: 'E-Commerce',
    employeeNumber: 'IORA-0105',
    nric: 'S8956789E',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9222 0105',
    startDate: subMonths(now, 30),
    confirmationDate: addMonths(subMonths(now, 30), 3),
    probationEndDate: addMonths(subMonths(now, 30), 3),
    reportingManagerId: sara.id,
    role: 'MANAGER',
  })

  // ---------- probation stories ----------
  // Priya: probation ends in 10 days, no confirmation date -> 2-week HR reminder window
  const priya = await employee({
    email: 'priya@iora.demo',
    firstName: 'Priya',
    lastName: 'Nair',
    position: 'Marketing Executive',
    department: 'Marketing',
    employeeNumber: 'IORA-0106',
    nric: 'S9867890F',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9222 0106',
    startDate: subDays(addDays(now, 10), 90),
    probationEndDate: addDays(now, 10),
    reportingManagerId: marcus.id,
  })

  // Daniel: brand-new hire (2 weeks in), employment letter awaiting HR review
  const daniel = await employee({
    email: 'daniel@iora.demo',
    firstName: 'Daniel',
    lastName: 'Koh',
    position: 'Retail Associate',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0107',
    nric: 'S0178901G',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9222 0107',
    startDate: subDays(now, 14),
    probationEndDate: addMonths(subDays(now, 14), 3),
    reportingManagerId: weiling.id,
  })

  // Aisyah: confirmation date set (3 weeks out), letter waiting for the boss to sign
  const aisyah = await employee({
    email: 'aisyah@iora.demo',
    firstName: 'Aisyah',
    lastName: 'Rahman',
    position: 'Finance Executive',
    department: 'Finance',
    employeeNumber: 'IORA-0108',
    nric: 'S9689012H',
    gender: 'Female',
    nationality: 'Singaporean',
    phone: '+65 9222 0108',
    startDate: subMonths(now, 3),
    probationEndDate: addDays(now, 2),
    confirmationDate: addDays(now, 21),
    reportingManagerId: sara.id,
  })

  // Kumar: confirmation date passed 5 days ago, boss never signed -> OVERDUE flag
  const kumar = await employee({
    email: 'kumar@iora.demo',
    firstName: 'Kumar',
    lastName: 'Raj',
    position: 'Logistics Coordinator',
    department: 'Warehouse & Logistics',
    employeeNumber: 'IORA-0109',
    nric: 'S9490123I',
    gender: 'Male',
    nationality: 'Singaporean',
    phone: '+65 9222 0109',
    startDate: subMonths(now, 4),
    probationEndDate: subDays(now, 30),
    confirmationDate: subDays(now, 5),
    reportingManagerId: sara.id,
  })

  // ---------- work-pass stories (one per reminder bucket) ----------
  // Nguyen: SG Work Permit expiring in 5 weeks -> DUE (2-month window)
  const nguyen = await employee({
    email: 'nguyen@iora.demo',
    firstName: 'Thi Hoa',
    lastName: 'Nguyen',
    position: 'Retail Associate',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0110',
    gender: 'Female',
    nationality: 'Vietnamese',
    phone: '+65 9222 0110',
    passportNumber: 'B7734561',
    passportExpiry: addYears(2),
    startDate: subYears(now, 1),
    confirmationDate: addMonths(subYears(now, 1), 3),
    probationEndDate: addMonths(subYears(now, 1), 3),
    reportingManagerId: weiling.id,
  })

  // Rajesh: Employment Pass expiring in 3 months -> DUE (4-month window)
  const rajesh = await employee({
    email: 'rajesh@iora.demo',
    firstName: 'Rajesh',
    lastName: 'Sharma',
    position: 'IT Executive',
    department: 'Information Technology',
    employeeNumber: 'IORA-0111',
    gender: 'Male',
    nationality: 'Indian',
    phone: '+65 9222 0111',
    passportNumber: 'Z2245678',
    passportExpiry: addYears(4),
    startDate: subYears(now, 2),
    confirmationDate: addMonths(subYears(now, 2), 3),
    probationEndDate: addMonths(subYears(now, 2), 3),
    reportingManagerId: sara.id,
  })

  // Ben: S Pass expiring in 8 months -> OK bucket
  const ben = await employee({
    email: 'ben@iora.demo',
    firstName: 'Ben',
    lastName: 'Santos',
    position: 'Visual Merchandiser',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0112',
    gender: 'Male',
    nationality: 'Filipino',
    phone: '+65 9222 0112',
    passportNumber: 'P5556789',
    passportExpiry: addYears(3),
    startDate: subMonths(now, 18),
    confirmationDate: addMonths(subMonths(now, 18), 3),
    probationEndDate: addMonths(subMonths(now, 18), 3),
    reportingManagerId: weiling.id,
  })

  // Chen Xiu: Malaysia office, MY work permit already expired -> EXPIRED bucket
  const chenxiu = await employee({
    email: 'chenxiu@iora.demo',
    firstName: 'Xiu',
    lastName: 'Chen',
    position: 'Warehouse Supervisor',
    department: 'Warehouse & Logistics',
    employeeNumber: 'IORA-0113',
    country: 'MY',
    company: 'iORA Fashion Sdn Bhd',
    gender: 'Female',
    nationality: 'Chinese',
    phone: '+60 12 555 0113',
    passportNumber: 'EA1237890',
    passportExpiry: addYears(1),
    startDate: subYears(now, 2),
    confirmationDate: addMonths(subYears(now, 2), 3),
    probationEndDate: addMonths(subYears(now, 2), 3),
    reportingManagerId: sara.id,
  })

  // ---------- leavers ----------
  const tommy = await employee({
    email: 'tommy@iora.demo',
    firstName: 'Tommy',
    lastName: 'Teo',
    position: 'Retail Associate',
    department: 'Retail Operations',
    employeeNumber: 'IORA-0114',
    nric: 'S9201234J',
    gender: 'Male',
    nationality: 'Singaporean',
    startDate: subYears(now, 2),
    confirmationDate: addMonths(subYears(now, 2), 3),
    status: 'TERMINATED',
    terminatedAt: subMonths(now, 1),
    folderArchivedAt: subMonths(now, 1),
    reportingManagerId: weiling.id,
  })

  await employee({
    email: 'olivia@iora.demo',
    firstName: 'Olivia',
    lastName: 'Wong',
    position: 'Marketing Executive',
    department: 'Marketing',
    nric: 'S9812345K',
    gender: 'Female',
    nationality: 'Singaporean',
    status: 'REJECTED',
    folderArchivedAt: subDays(now, 20),
  })

  function addYears(n: number) {
    return new Date(now.getFullYear() + n, now.getMonth(), now.getDate())
  }

  console.log('Created 14 demo employees')

  // ---------- work passes ----------
  await prisma.workPass.createMany({
    data: [
      {
        userId: nguyen.id,
        passType: 'SG_WORK_PERMIT',
        workPermitNumber: '0 2233445-6',
        finNumber: 'G5566778N',
        levy: 370,
        applicationDate: subYears(now, 1),
        approvalDate: subDays(subYears(now, 1), -14),
        issueDate: subDays(subYears(now, 1), -21),
        expiryDate: addDays(now, 35), // inside the 2-month window -> DUE
      },
      {
        userId: rajesh.id,
        passType: 'SG_EMPLOYMENT_PASS',
        passNumber: 'EP-88112233',
        finNumber: 'F1122334M',
        applicationDate: subYears(now, 2),
        approvalDate: subDays(subYears(now, 2), -10),
        issueDate: subDays(subYears(now, 2), -20),
        expiryDate: addMonths(now, 3), // inside the 4-month window -> DUE
      },
      {
        userId: ben.id,
        passType: 'SG_S_PASS',
        passNumber: 'SP-77445566',
        finNumber: 'G9988776P',
        levy: 650,
        applicationDate: subMonths(now, 18),
        approvalDate: subDays(subMonths(now, 18), -12),
        issueDate: subDays(subMonths(now, 18), -18),
        expiryDate: addMonths(now, 8), // outside all windows -> OK
      },
      {
        userId: chenxiu.id,
        passType: 'MY_WORK_PERMIT',
        workPermitNumber: 'MY-4455667',
        applicationDate: subYears(now, 2),
        issueDate: subYears(now, 2),
        expiryDate: subDays(now, 10), // already lapsed -> EXPIRED
        notes: 'Renewal application submitted to JIM, pending outcome.',
      },
    ],
  })
  console.log('Created 4 work passes (due x2, ok, expired)')

  // ---------- employment / confirmation letters ----------
  await prisma.employmentLetter.createMany({
    data: [
      // Daniel: fresh hire, draft waiting in the HR review queue
      {
        employeeId: daniel.id,
        type: 'EMPLOYMENT',
        status: 'PENDING_REVIEW',
        createdAt: subDays(now, 14),
      },
      // Aisyah: confirmation letter approved by HR, waiting for Sara to sign
      {
        employeeId: aisyah.id,
        type: 'CONFIRMATION',
        status: 'PENDING_SIGNATURE',
        reviewedById: jin.id,
        reviewedAt: subDays(now, 4),
        approvingOfficerId: sara.id,
        dueDate: addDays(now, 21),
        lastReminderAt: subDays(now, 2), // next every-2-days nudge fires today
      },
      // Kumar: due 5 days ago, still unsigned -> flagged overdue
      {
        employeeId: kumar.id,
        type: 'CONFIRMATION',
        status: 'PENDING_SIGNATURE',
        reviewedById: jin.id,
        reviewedAt: subDays(now, 12),
        approvingOfficerId: sara.id,
        dueDate: subDays(now, 5),
        lastReminderAt: subDays(now, 1),
        overdue: true,
      },
      // Marcus: fully completed lifecycle (signed + sent)
      {
        employeeId: marcus.id,
        type: 'CONFIRMATION',
        status: 'SENT',
        reviewedById: jin.id,
        reviewedAt: subMonths(now, 27),
        approvingOfficerId: sara.id,
        signedAt: subMonths(now, 27),
        dueDate: addMonths(subMonths(now, 30), 3),
        sentAt: addMonths(subMonths(now, 30), 3),
      },
      // Wei Ling: historical employment letter, signed
      {
        employeeId: weiling.id,
        type: 'EMPLOYMENT',
        status: 'SIGNED',
        reviewedById: jin.id,
        reviewedAt: subYears(now, 4),
        approvingOfficerId: sara.id,
        signedAt: subYears(now, 4),
      },
    ],
  })
  console.log('Created 5 letters (pending review, pending signature, overdue, sent, signed)')

  // ---------- career events (journeys) ----------
  const journeys: {
    userId: string
    type: 'JOINED' | 'POSITION_CHANGE' | 'DEPARTMENT_CHANGE' | 'CONFIRMED' | 'TERMINATED'
    title: string
    detail?: string
    fromValue?: string
    toValue?: string
    effectiveDate: Date
  }[] = [
    // Jin — the admin's own journey for the "My Profile" demo
    { userId: jin.id, type: 'JOINED', title: 'Joined as HR Executive', detail: 'Human Resources', toValue: 'HR Executive', effectiveDate: subYears(now, 3) },
    { userId: jin.id, type: 'CONFIRMED', title: 'Confirmed as a permanent employee', detail: 'Completed probation', effectiveDate: addMonths(subYears(now, 3), 3) },
    { userId: jin.id, type: 'POSITION_CHANGE', title: 'Moved to HR Manager', detail: 'Human Resources', fromValue: 'HR Executive', toValue: 'HR Manager', effectiveDate: subYears(now, 2) },
    { userId: jin.id, type: 'POSITION_CHANGE', title: 'Moved to HR Administrator', detail: 'Human Resources', fromValue: 'HR Manager', toValue: 'HR Administrator', effectiveDate: subMonths(now, 8) },

    // Wei Ling — the richest journey (retail career ladder)
    { userId: weiling.id, type: 'JOINED', title: 'Joined as Retail Associate', detail: 'Retail Operations', toValue: 'Retail Associate', effectiveDate: subYears(now, 4) },
    { userId: weiling.id, type: 'CONFIRMED', title: 'Confirmed as a permanent employee', detail: 'Completed probation', effectiveDate: addMonths(subYears(now, 4), 3) },
    { userId: weiling.id, type: 'POSITION_CHANGE', title: 'Moved to Senior Retail Associate', detail: 'Retail Operations', fromValue: 'Retail Associate', toValue: 'Senior Retail Associate', effectiveDate: subMonths(now, 34) },
    { userId: weiling.id, type: 'POSITION_CHANGE', title: 'Moved to Assistant Store Manager', detail: 'Retail Operations', fromValue: 'Senior Retail Associate', toValue: 'Assistant Store Manager', effectiveDate: subMonths(now, 20) },
    { userId: weiling.id, type: 'POSITION_CHANGE', title: 'Moved to Store Manager', detail: 'Retail Operations · Bugis Junction flagship', fromValue: 'Assistant Store Manager', toValue: 'Store Manager', effectiveDate: subMonths(now, 6) },

    // Marcus — joined marketing, transferred to e-commerce
    { userId: marcus.id, type: 'JOINED', title: 'Joined as Digital Marketing Executive', detail: 'Marketing', toValue: 'Digital Marketing Executive', effectiveDate: subMonths(now, 30) },
    { userId: marcus.id, type: 'CONFIRMED', title: 'Confirmed as a permanent employee', detail: 'Completed probation', effectiveDate: addMonths(subMonths(now, 30), 3) },
    { userId: marcus.id, type: 'DEPARTMENT_CHANGE', title: 'Transferred to E-Commerce', detail: 'E-Commerce Manager', fromValue: 'Marketing', toValue: 'E-Commerce', effectiveDate: subMonths(now, 14) },
    { userId: marcus.id, type: 'POSITION_CHANGE', title: 'Moved to E-Commerce Manager', detail: 'E-Commerce', fromValue: 'Digital Marketing Executive', toValue: 'E-Commerce Manager', effectiveDate: subMonths(now, 14) },

    // Simple JOINED nodes for everyone else
    { userId: sara.id, type: 'JOINED', title: 'Joined as Managing Director', detail: 'Executive', toValue: 'Managing Director', effectiveDate: subYears(now, 8) },
    { userId: grace.id, type: 'JOINED', title: 'Joined as HR Executive', detail: 'Human Resources', toValue: 'HR Executive', effectiveDate: subYears(now, 2) },
    { userId: grace.id, type: 'CONFIRMED', title: 'Confirmed as a permanent employee', detail: 'Completed probation', effectiveDate: addMonths(subYears(now, 2), 3) },
    { userId: priya.id, type: 'JOINED', title: 'Joined as Marketing Executive', detail: 'Marketing', toValue: 'Marketing Executive', effectiveDate: subDays(addDays(now, 10), 90) },
    { userId: daniel.id, type: 'JOINED', title: 'Joined as Retail Associate', detail: 'Retail Operations', toValue: 'Retail Associate', effectiveDate: subDays(now, 14) },
    { userId: aisyah.id, type: 'JOINED', title: 'Joined as Finance Executive', detail: 'Finance', toValue: 'Finance Executive', effectiveDate: subMonths(now, 3) },
    { userId: kumar.id, type: 'JOINED', title: 'Joined as Logistics Coordinator', detail: 'Warehouse & Logistics', toValue: 'Logistics Coordinator', effectiveDate: subMonths(now, 4) },
    { userId: nguyen.id, type: 'JOINED', title: 'Joined as Retail Associate', detail: 'Retail Operations', toValue: 'Retail Associate', effectiveDate: subYears(now, 1) },
    { userId: nguyen.id, type: 'CONFIRMED', title: 'Confirmed as a permanent employee', detail: 'Completed probation', effectiveDate: addMonths(subYears(now, 1), 3) },
    { userId: rajesh.id, type: 'JOINED', title: 'Joined as IT Executive', detail: 'Information Technology', toValue: 'IT Executive', effectiveDate: subYears(now, 2) },
    { userId: ben.id, type: 'JOINED', title: 'Joined as Visual Merchandiser', detail: 'Retail Operations', toValue: 'Visual Merchandiser', effectiveDate: subMonths(now, 18) },
    { userId: chenxiu.id, type: 'JOINED', title: 'Joined as Warehouse Supervisor', detail: 'Warehouse & Logistics', toValue: 'Warehouse Supervisor', effectiveDate: subYears(now, 2) },
    { userId: tommy.id, type: 'JOINED', title: 'Joined as Retail Associate', detail: 'Retail Operations', toValue: 'Retail Associate', effectiveDate: subYears(now, 2) },
    { userId: tommy.id, type: 'TERMINATED', title: 'Left the company', detail: 'Retail Associate', effectiveDate: subMonths(now, 1) },
  ]
  await prisma.careerEvent.createMany({ data: journeys })
  console.log(`Created ${journeys.length} career events`)

  // ---------- leave balances + requests ----------
  const annual = await prisma.leaveType.findUnique({ where: { name: 'Annual Leave' } })
  const sick = await prisma.leaveType.findUnique({ where: { name: 'Sick Leave' } })
  if (annual && sick) {
    const year = now.getFullYear()
    const staff = [
      { u: weiling, used: 6, pending: 2 },
      { u: marcus, used: 4, pending: 0 },
      { u: priya, used: 1, pending: 2 },
      { u: daniel, used: 0, pending: 0 },
      { u: aisyah, used: 2, pending: 0 },
      { u: kumar, used: 3, pending: 0 },
      { u: nguyen, used: 5, pending: 0 },
      { u: rajesh, used: 7, pending: 0 },
      { u: ben, used: 4, pending: 1 },
      { u: chenxiu, used: 8, pending: 0 },
      { u: grace, used: 5, pending: 0 },
    ]
    await prisma.leaveBalance.createMany({
      data: staff.flatMap(({ u, used, pending }) => [
        { userId: u.id, leaveTypeId: annual.id, year, entitlement: 18, used, pending, carryForward: 3 },
        { userId: u.id, leaveTypeId: sick.id, year, entitlement: 14, used: Math.min(used, 4), pending: 0 },
      ]),
    })

    await prisma.leaveRequest.createMany({
      data: [
        {
          userId: weiling.id, leaveTypeId: annual.id,
          startDate: subDays(now, 40), endDate: subDays(now, 38), daysCount: 3,
          status: 'APPROVED', approverId: sara.id, approvedAt: subDays(now, 45),
          reason: 'Family trip',
        },
        {
          userId: weiling.id, leaveTypeId: annual.id,
          startDate: addDays(now, 30), endDate: addDays(now, 31), daysCount: 2,
          status: 'PENDING', reason: 'Long weekend',
        },
        {
          userId: priya.id, leaveTypeId: annual.id,
          startDate: addDays(now, 14), endDate: addDays(now, 15), daysCount: 2,
          status: 'PENDING', reason: 'Personal matters',
        },
        {
          userId: marcus.id, leaveTypeId: annual.id,
          startDate: subDays(now, 90), endDate: subDays(now, 90), daysCount: 1,
          status: 'REJECTED', approverId: sara.id, rejectionReason: 'Campaign launch week',
        },
        {
          userId: nguyen.id, leaveTypeId: sick.id,
          startDate: subDays(now, 7), endDate: subDays(now, 6), daysCount: 2,
          status: 'APPROVED', approverId: weiling.id, approvedAt: subDays(now, 7),
          reason: 'Flu, MC attached',
        },
      ],
    })
    console.log('Created leave balances for 11 staff + 5 leave requests')
  }

  // ---------- learning (LMS) progress ----------
  // Marcus: completed the whole journey incl. survey (cert ready)
  await prisma.learningLessonProgress.createMany({
    data: [1, 2, 3].map(n => ({
      userId: marcus.id, lessonId: `lesson${n}`,
      slidesDone: true, pdfDone: true, videoDone: true,
      completedAt: subDays(now, 80 - n * 20),
    })),
  })
  await prisma.learningTestProgress.createMany({
    data: [1, 2, 3].map(n => ({
      userId: marcus.id, testId: `test${n}`,
      attempts: n === 2 ? 2 : 1, passed: true, bestScore: 0.85 + n * 0.03,
      completedAt: subDays(now, 75 - n * 20),
    })),
  })
  await prisma.learningSurvey.create({
    data: { userId: marcus.id, clarity: 5, pace: 4, usefulness: 5, comment: 'Clear and practical — the product-knowledge module especially.', submittedAt: subDays(now, 15) },
  })

  // Wei Ling: mid-journey (lesson 1+2 done, test 1 passed, test 2 in progress)
  await prisma.learningLessonProgress.createMany({
    data: [
      { userId: weiling.id, lessonId: 'lesson1', slidesDone: true, pdfDone: true, videoDone: true, completedAt: subDays(now, 40) },
      { userId: weiling.id, lessonId: 'lesson2', slidesDone: true, pdfDone: true, videoDone: true, completedAt: subDays(now, 20) },
      { userId: weiling.id, lessonId: 'lesson3', slidesDone: true, pdfDone: false, videoDone: false },
    ],
  })
  await prisma.learningTestProgress.createMany({
    data: [
      { userId: weiling.id, testId: 'test1', attempts: 1, passed: true, bestScore: 0.9, completedAt: subDays(now, 35) },
      { userId: weiling.id, testId: 'test2', attempts: 1, passed: false, bestScore: 0.65 },
    ],
  })

  // Daniel: just started (lesson 1 partially done)
  await prisma.learningLessonProgress.create({
    data: { userId: daniel.id, lessonId: 'lesson1', slidesDone: true, pdfDone: true, videoDone: false },
  })

  // Nguyen: locked out of test 1 after 3 failed attempts -> HR escalation story
  await prisma.learningLessonProgress.create({
    data: { userId: nguyen.id, lessonId: 'lesson1', slidesDone: true, pdfDone: true, videoDone: true, completedAt: subDays(now, 30) },
  })
  await prisma.learningTestProgress.create({
    data: { userId: nguyen.id, testId: 'test1', attempts: 3, passed: false, bestScore: 0.55, locked: true },
  })
  console.log('Created learning progress (completed, mid-journey, new, locked-out)')

  console.log('\nDemo seed complete. Logins (password: test123):')
  console.log('  Admin/HR   -> jin@company.com')
  console.log('  Boss/signer-> sara@iora.demo')
  console.log('  Employee   -> weiling@iora.demo (rich Journey + LMS progress)')
  console.log('  HR user    -> grace@iora.demo')
}

main()
  .catch((e) => {
    console.error('Demo seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
