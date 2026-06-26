/**
 * Demo data for screenshots. Idempotent: safe to re-run.
 * Run: npx tsx -r dotenv/config prisma/seed-demo.ts
 *
 * Creates:
 *  - Q2 2026 perf review cycle (FULL) scoped to all SG full-timers,
 *    advanced to EVALUATION; goals + evaluations populated for 2-3 reviews.
 *  - Probation perf review cycle for one PT employee.
 *  - A LITE perf review cycle scoped to PT employees.
 *  - Lim Boon timesheet entries across the current week: 1 draft,
 *    2 submitted (one PH), prior week APPROVED.
 *  - Hari Raya 2026 reward cycle with draft allocations.
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function ymdDate(d: Date): Date {
  // Force UTC midnight for DATE columns
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`)
}

async function userByEmail(email: string) {
  return prisma.user.findUniqueOrThrow({ where: { email } })
}

async function ensurePerfCycle() {
  const admin = await userByEmail('jin@company.com')

  // === Q2 2026 — FULL template, EVALUATION phase, populated ===
  const fullCycle = await prisma.reviewCycle.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Q2 2026 SG Store Performance Review',
      templateType: 'FULL',
      status: 'EVALUATION',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-06-30'),
      goalSettingDeadline: new Date('2026-04-30'),
      evaluationOpensAt: new Date('2026-06-15'),
      evaluationDeadline: new Date('2026-07-15'),
      ratingScale: 5,
      ratingLabels: ['Below', 'Approaching', 'Meets', 'Exceeds', 'Outstanding'],
      minGoals: 3,
      maxGoals: 7,
      goalWeightsEnabled: false,
      employeeSelfAssessment: false,
      employeeCanComment: true,
      requireManagerNarrative: true,
      includeSalesTarget: true,
      targetCurrency: 'SGD',
      includeAttendanceMetric: false,
      createdById: admin.id,
    },
  })

  // Scope: SG full-timers
  const sgFt = await prisma.user.findMany({
    where: { country: 'SG', employmentType: 'EMPLOYEE', status: 'ACTIVE' },
    select: { id: true, reportingManagerId: true },
  })

  for (const u of sgFt) {
    await prisma.performanceReview.upsert({
      where: { cycleId_employeeId: { cycleId: fullCycle.id, employeeId: u.id } },
      update: {},
      create: {
        cycleId: fullCycle.id,
        employeeId: u.id,
        managerId: u.reportingManagerId ?? u.id,
        status: 'GOALS_SET',
      },
    })
  }

  // Populate Wei Ming's review with goals + advance to IN_EVALUATION
  const wei = await userByEmail('wei.ming@iora.test')
  const weiReview = await prisma.performanceReview.findUniqueOrThrow({
    where: { cycleId_employeeId: { cycleId: fullCycle.id, employeeId: wei.id } },
  })
  await prisma.performanceReview.update({
    where: { id: weiReview.id },
    data: {
      status: 'IN_EVALUATION',
      salesTargetAmount: 80000,
    },
  })

  const weiGoalsExist = await prisma.goal.count({ where: { reviewId: weiReview.id } })
  if (weiGoalsExist === 0) {
    await prisma.goal.createMany({
      data: [
        {
          reviewId: weiReview.id,
          title: 'Hit Q2 sales target for Orchard store',
          description: 'Drive consistent weekday traffic and conversion improvements.',
          goalType: 'QUANTITATIVE',
          targetValue: 80000,
          actualValue: 84500,
          unit: 'SGD',
          outcome: 'EXCEEDED',
          managerComment: 'Strong upselling on premium denim — +5% vs target despite a slow May.',
        },
        {
          reviewId: weiReview.id,
          title: 'Mentor two new sales associates',
          description: 'Onboard Priya and Hannah; pair-shift coverage for the first month.',
          goalType: 'QUALITATIVE',
          outcome: 'MET',
          managerComment: 'Both rookies passed probation. Hannah specifically called out his coaching.',
        },
        {
          reviewId: weiReview.id,
          title: 'Reduce mystery-shopper service score gaps',
          description: 'Target 90+ average on greeting + product knowledge dimensions.',
          goalType: 'QUANTITATIVE',
          targetValue: 90,
          actualValue: 87,
          unit: '%',
          outcome: 'PARTIAL',
          managerComment: 'Progress on greeting, product knowledge still inconsistent. Schedule refresher.',
        },
      ],
    })
  }

  // Priya — goals set but not evaluated yet
  const priya = await userByEmail('priya.naidu@iora.test')
  const priyaReview = await prisma.performanceReview.findUniqueOrThrow({
    where: { cycleId_employeeId: { cycleId: fullCycle.id, employeeId: priya.id } },
  })
  const priyaGoalsExist = await prisma.goal.count({ where: { reviewId: priyaReview.id } })
  if (priyaGoalsExist === 0) {
    await prisma.goal.createMany({
      data: [
        {
          reviewId: priyaReview.id,
          title: 'Hit Q2 sales target',
          goalType: 'QUANTITATIVE',
          targetValue: 65000,
          unit: 'SGD',
        },
        {
          reviewId: priyaReview.id,
          title: 'Lead Q3 visual merchandising refresh',
          description: 'Plan and execute the seasonal window updates with the VM team.',
          goalType: 'QUALITATIVE',
        },
        {
          reviewId: priyaReview.id,
          title: 'Achieve 95% punctuality',
          goalType: 'QUANTITATIVE',
          targetValue: 95,
          unit: '%',
        },
      ],
    })
  }

  // Mei Lin — fully submitted + pending acknowledgement
  const mei = await userByEmail('mei.lin@iora.test')
  const meiReview = await prisma.performanceReview.findUniqueOrThrow({
    where: { cycleId_employeeId: { cycleId: fullCycle.id, employeeId: mei.id } },
  })
  const meiGoalsExist = await prisma.goal.count({ where: { reviewId: meiReview.id } })
  if (meiGoalsExist === 0) {
    await prisma.goal.createMany({
      data: [
        {
          reviewId: meiReview.id,
          title: 'Hit Q2 sales target',
          goalType: 'QUANTITATIVE',
          targetValue: 70000,
          actualValue: 71200,
          unit: 'SGD',
          outcome: 'MET',
          managerComment: 'Solid quarter, hit target on the last week.',
        },
        {
          reviewId: meiReview.id,
          title: 'Cross-train on backroom inventory',
          goalType: 'QUALITATIVE',
          outcome: 'MET',
          managerComment: 'Comfortable with the stock system now.',
        },
        {
          reviewId: meiReview.id,
          title: 'Improve customer feedback NPS',
          goalType: 'QUANTITATIVE',
          targetValue: 60,
          actualValue: 55,
          unit: 'NPS',
          outcome: 'PARTIAL',
          managerComment: 'Trending up but didn’t cross the threshold.',
        },
      ],
    })
  }
  await prisma.performanceReview.update({
    where: { id: meiReview.id },
    data: {
      status: 'PENDING_ACKNOWLEDGEMENT',
      overallRating: 3,
      managerNarrative:
        'Reliable performer. Hit sales target despite a slow May. Cross-training on inventory was a big confidence boost. Customer-feedback NPS is the area to focus on next quarter.',
      salesTargetAmount: 70000,
      salesActualAmount: 71200,
      submittedForEvaluationAt: new Date('2026-07-10'),
    },
  })

  // === Probation cycle for Hannah Goh (PT) ===
  const probationCycle = await prisma.reviewCycle.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: '3-Month Probation — May 2026 intake',
      templateType: 'PROBATION',
      status: 'EVALUATION',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-08-01'),
      ratingScale: 0,
      ratingLabels: [],
      minGoals: 0,
      maxGoals: 0,
      employeeCanComment: true,
      requireManagerNarrative: true,
      includeSalesTarget: false,
      includeAttendanceMetric: true,
      createdById: admin.id,
    },
  })
  const hannah = await userByEmail('hannah.goh@iora.test')
  await prisma.performanceReview.upsert({
    where: { cycleId_employeeId: { cycleId: probationCycle.id, employeeId: hannah.id } },
    update: {},
    create: {
      cycleId: probationCycle.id,
      employeeId: hannah.id,
      managerId: hannah.reportingManagerId ?? hannah.id,
      status: 'IN_EVALUATION',
      attendanceDaysWorked: 38,
      attendanceDaysScheduled: 40,
    },
  })

  return fullCycle
}

async function ensureTimeEntries() {
  const lim = await userByEmail('lim.boon@iora.test')

  // Build last-week and this-week reference dates
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const dayOfWeek = today.getUTCDay() || 7 // 1..7
  const thisMonday = new Date(today)
  thisMonday.setUTCDate(today.getUTCDate() - (dayOfWeek - 1))

  const lastMonday = new Date(thisMonday)
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7)

  function addDays(base: Date, days: number): Date {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() + days)
    return d
  }

  // Previous week — APPROVED across 5 days
  const prevApprovals: Array<{ date: Date; hours: number; ph?: boolean }> = [
    { date: addDays(lastMonday, 0), hours: 5 },
    { date: addDays(lastMonday, 1), hours: 5 },
    { date: addDays(lastMonday, 2), hours: 6 },
    { date: addDays(lastMonday, 3), hours: 5 },
    { date: addDays(lastMonday, 4), hours: 4 },
  ]
  for (const e of prevApprovals) {
    await prisma.timeEntry.upsert({
      where: { userId_workDate: { userId: lim.id, workDate: ymdDate(e.date) } },
      update: {},
      create: {
        userId: lim.id,
        workDate: ymdDate(e.date),
        hoursWorked: e.hours,
        breakMinutes: 30,
        status: 'APPROVED',
        approverId: lim.reportingManagerId ?? null,
        submittedAt: addDays(lastMonday, 6),
        approvedAt: addDays(lastMonday, 6),
        isPublicHoliday: !!e.ph,
      },
    })
  }

  // This week: mix of SUBMITTED + DRAFT (no approval yet)
  const thisWeekEntries: Array<{ offset: number; hours: number; status: 'SUBMITTED' | 'DRAFT' }> = [
    { offset: 0, hours: 5, status: 'SUBMITTED' },
    { offset: 1, hours: 5, status: 'SUBMITTED' },
    { offset: 2, hours: 4.5, status: 'DRAFT' },
  ]
  for (const e of thisWeekEntries) {
    const wd = ymdDate(addDays(thisMonday, e.offset))
    await prisma.timeEntry.upsert({
      where: { userId_workDate: { userId: lim.id, workDate: wd } },
      update: {},
      create: {
        userId: lim.id,
        workDate: wd,
        hoursWorked: e.hours,
        breakMinutes: 30,
        description: e.offset === 2 ? 'Covering Marina, afternoon shift' : null,
        status: e.status,
        submittedAt: e.status === 'SUBMITTED' ? new Date() : null,
        approverId: e.status === 'SUBMITTED' ? lim.reportingManagerId : null,
      },
    })
  }
}

async function ensureRewardCycle() {
  const admin = await userByEmail('jin@company.com')
  const fullCycleId = '00000000-0000-0000-0000-000000000001'

  const reward = await prisma.rewardCycle.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Hari Raya 2026 Bonus',
      description: 'Discretionary mid-year bonus aligned with Q2 performance reviews.',
      status: 'DRAFT',
      reviewCycleId: fullCycleId,
      currency: 'SGD',
      totalPoolAmount: 6000,
      payoutDate: new Date('2026-08-30'),
      createdById: admin.id,
    },
  })

  // Allocate a few draft amounts
  const wei = await userByEmail('wei.ming@iora.test')
  const mei = await userByEmail('mei.lin@iora.test')
  const priya = await userByEmail('priya.naidu@iora.test')

  const weiReview = await prisma.performanceReview.findUnique({
    where: { cycleId_employeeId: { cycleId: fullCycleId, employeeId: wei.id } },
  })
  const meiReview = await prisma.performanceReview.findUnique({
    where: { cycleId_employeeId: { cycleId: fullCycleId, employeeId: mei.id } },
  })

  const allocs = [
    {
      employeeId: wei.id,
      amount: 1500,
      bonusType: 'PERFORMANCE' as const,
      linkedReviewId: weiReview?.id ?? null,
      rationale: 'Exceeded sales target, strong mentoring of new hires.',
    },
    {
      employeeId: mei.id,
      amount: 900,
      bonusType: 'PERFORMANCE' as const,
      linkedReviewId: meiReview?.id ?? null,
      rationale: 'Met sales target; needs more focus on customer feedback.',
    },
    {
      employeeId: priya.id,
      amount: 700,
      bonusType: 'PERFORMANCE' as const,
      rationale: 'Solid Q2; partial bonus pending Q3 evaluation.',
    },
  ]
  for (const a of allocs) {
    await prisma.rewardAllocation.upsert({
      where: {
        cycleId_employeeId_bonusType: {
          cycleId: reward.id,
          employeeId: a.employeeId,
          bonusType: a.bonusType,
        },
      },
      update: {},
      create: {
        cycleId: reward.id,
        employeeId: a.employeeId,
        bonusType: a.bonusType,
        amount: a.amount,
        currency: reward.currency,
        rationale: a.rationale,
        linkedReviewId: a.linkedReviewId,
        proposedById: admin.id,
        status: 'DRAFT',
      },
    })
  }
}

async function main() {
  console.log('Seeding demo data…')
  await ensurePerfCycle()
  console.log('  ✓ Performance cycles')
  await ensureTimeEntries()
  console.log('  ✓ Time entries')
  await ensureRewardCycle()
  console.log('  ✓ Reward cycle + allocations')
  console.log('Done.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
