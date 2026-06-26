/**
 * Capture screenshots of the InsideHR app for the training decks.
 * Run: npx tsx scripts/capture-screenshots.ts
 *
 * Assumes:
 *   - dev server is running on http://localhost:3002
 *   - seed-employees.ts and seed-demo.ts have been run
 */

import { chromium, type Browser, type Page } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE_URL = 'http://localhost:3002'
const OUT_DIR = path.join(process.cwd(), 'docs', 'screenshots')

const ADMIN = { email: 'jin@company.com', password: 'changeme123', firstTime: true }
const MANAGER = { email: 'aisha.rahman@iora.test', password: 'password123', firstTime: false }
const STORE_MGR_MARINA = { email: 'james.lee@iora.test', password: 'password123', firstTime: false }
const FT_EMPLOYEE = { email: 'mei.lin@iora.test', password: 'password123', firstTime: false }
const FT_EMPLOYEE_WEI = { email: 'wei.ming@iora.test', password: 'password123', firstTime: false }
const PT_EMPLOYEE = { email: 'lim.boon@iora.test', password: 'password123', firstTime: false }

const VIEWPORT = { width: 1440, height: 900 }

async function login(page: Page, user: { email: string; password: string; firstTime: boolean }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[name="email"]', user.email)
  await page.fill('input[name="password"]', user.password)
  await page.click('button[type="submit"]')
  if (user.firstTime) {
    // Admin still has mustChangePassword=true from initial seed — change it once.
    try {
      await page.waitForURL(/\/change-password/, { timeout: 4000 })
      await page.fill('input[name="currentPassword"]', user.password).catch(() => {})
      await page.fill('input[name="newPassword"]', user.password).catch(() => {})
      await page.fill('input[name="confirmPassword"]', user.password).catch(() => {})
      // If the change-password page is shown, skip rather than spam attempts.
      // Reset mustChangePassword via DB before screenshots is the safer route, but
      // for a one-off capture this is fine.
    } catch {
      // Already on dashboard
    }
  }
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 10000 })
}

async function logout(page: Page) {
  // Clear cookies between user switches
  await page.context().clearCookies()
}

async function snap(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  const fullPage = opts.fullPage ?? false
  // Wait for network to settle and a brief render delay
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(400)
  const p = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: p, fullPage })
  console.log(`  ✓ ${name}.png`)
}

async function captureAdmin(browser: Browser) {
  console.log('\n[ADMIN] capturing as jin@company.com')
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()

  await login(page, ADMIN)

  // Workaround: admin's mustChangePassword may force the change-password page.
  // If we land there, navigate manually — screenshots can include it.
  if (page.url().includes('/change-password')) {
    await snap(page, 'admin-change-password')
    // Bypass by going direct to dashboard URL (proxy.ts will redirect us back
    // unless we update the cookie; safer to just snap the change-password page
    // and assume admin has bypassed via DB for the rest of the run).
    return
  }

  await page.goto(`${BASE_URL}/dashboard`)
  await snap(page, 'admin-dashboard')

  await page.goto(`${BASE_URL}/people`)
  await snap(page, 'admin-people-list')

  await page.goto(`${BASE_URL}/people/new`)
  await snap(page, 'admin-people-new', { fullPage: true })

  await page.goto(`${BASE_URL}/people/org-chart`)
  await snap(page, 'admin-org-chart')

  await page.goto(`${BASE_URL}/team-calendar`)
  await snap(page, 'admin-team-calendar')

  await page.goto(`${BASE_URL}/leave`)
  await snap(page, 'admin-leave')

  await page.goto(`${BASE_URL}/leave/request`)
  await snap(page, 'admin-leave-request')

  await page.goto(`${BASE_URL}/admin/leave`)
  await snap(page, 'admin-leave-management', { fullPage: true })

  await page.goto(`${BASE_URL}/documents`)
  await snap(page, 'admin-documents')

  await page.goto(`${BASE_URL}/holidays`)
  await snap(page, 'admin-holidays', { fullPage: true })

  await page.goto(`${BASE_URL}/expenses`)
  await snap(page, 'admin-expenses')

  await page.goto(`${BASE_URL}/expenses/approvals`)
  await snap(page, 'admin-expenses-approvals')

  // Performance
  await page.goto(`${BASE_URL}/performance/cycles`)
  await snap(page, 'admin-perf-cycles-list')

  await page.goto(`${BASE_URL}/performance/cycles/new`)
  await snap(page, 'admin-perf-cycle-new', { fullPage: true })

  await page.goto(`${BASE_URL}/performance/cycles/00000000-0000-0000-0000-000000000001`)
  await snap(page, 'admin-perf-cycle-detail', { fullPage: true })

  // Time / Payroll
  await page.goto(`${BASE_URL}/time/approvals`)
  await snap(page, 'admin-time-approvals')

  await page.goto(`${BASE_URL}/payroll`)
  await snap(page, 'admin-payroll')

  // Rewards
  await page.goto(`${BASE_URL}/rewards/cycles`)
  await snap(page, 'admin-rewards-cycles')

  await page.goto(`${BASE_URL}/rewards/cycles/new`)
  await snap(page, 'admin-rewards-cycle-new', { fullPage: true })

  await page.goto(`${BASE_URL}/rewards/cycles/00000000-0000-0000-0000-000000000010`)
  await snap(page, 'admin-rewards-cycle-detail', { fullPage: true })

  await ctx.close()
}

async function captureManager(browser: Browser) {
  console.log('\n[MANAGER] capturing as aisha.rahman@iora.test')
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()
  await login(page, MANAGER)

  await page.goto(`${BASE_URL}/dashboard`)
  await snap(page, 'manager-dashboard')

  await page.goto(`${BASE_URL}/approvals`)
  await snap(page, 'manager-leave-approvals')

  await page.goto(`${BASE_URL}/expenses/approvals`)
  await snap(page, 'manager-expense-approvals')

  await page.goto(`${BASE_URL}/performance/team`)
  await snap(page, 'manager-perf-team')

  // Find one of Aisha's direct reports' reviews to detail
  // Wei Ming's review id — we need to fetch via API or guess. Easier: click first row.
  const firstRow = page.locator('table a:has-text("Set goals"), table a:has-text("Evaluate"), table a:has-text("View")').first()
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click()
    await snap(page, 'manager-perf-review-detail', { fullPage: true })
  }

  await page.goto(`${BASE_URL}/time/approvals`)
  await snap(page, 'manager-time-approvals', { fullPage: true })

  await page.goto(`${BASE_URL}/team-calendar`)
  await snap(page, 'manager-team-calendar')

  await page.goto(`${BASE_URL}/documents`)
  await snap(page, 'manager-documents')

  await ctx.close()
}

async function captureEmployee(browser: Browser) {
  console.log('\n[EMPLOYEE — FT] capturing as mei.lin@iora.test')
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()
  await login(page, FT_EMPLOYEE)

  await page.goto(`${BASE_URL}/dashboard`)
  await snap(page, 'employee-dashboard')

  await page.goto(`${BASE_URL}/leave`)
  await snap(page, 'employee-leave')

  await page.goto(`${BASE_URL}/leave/request`)
  await snap(page, 'employee-leave-request', { fullPage: true })

  await page.goto(`${BASE_URL}/expenses`)
  await snap(page, 'employee-expenses')

  await page.goto(`${BASE_URL}/expenses/new`)
  await snap(page, 'employee-expense-new', { fullPage: true })

  await page.goto(`${BASE_URL}/performance/me`)
  await snap(page, 'employee-perf-me')

  // Mei Lin should have a PENDING_ACKNOWLEDGEMENT review
  const reviewLink = page.locator('table a:has-text("Acknowledge"), table a:has-text("View")').first()
  if (await reviewLink.isVisible().catch(() => false)) {
    await reviewLink.click()
    await snap(page, 'employee-perf-review-detail', { fullPage: true })
  }

  await page.goto(`${BASE_URL}/team-calendar`)
  await snap(page, 'employee-team-calendar')

  await page.goto(`${BASE_URL}/documents`)
  await snap(page, 'employee-documents')

  await ctx.close()

  // Part-time employee for timesheet
  console.log('\n[EMPLOYEE — PT] capturing as lim.boon@iora.test')
  const ptCtx = await browser.newContext({ viewport: VIEWPORT })
  const ptPage = await ptCtx.newPage()
  await login(ptPage, PT_EMPLOYEE)

  await ptPage.goto(`${BASE_URL}/dashboard`)
  await snap(ptPage, 'pt-dashboard')

  await ptPage.goto(`${BASE_URL}/time`)
  await snap(ptPage, 'pt-timesheet', { fullPage: true })

  // Click one of the day cards to open the dialog
  const dayCard = ptPage.locator('button:has-text("Log hours"), button:has(p:has-text("h"))').first()
  if (await dayCard.isVisible().catch(() => false)) {
    await dayCard.click()
    await ptPage.waitForTimeout(300)
    await snap(ptPage, 'pt-timesheet-day-modal')
    // Close modal
    await ptPage.keyboard.press('Escape')
  }

  await ptCtx.close()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    await captureAdmin(browser)
    await captureManager(browser)
    await captureEmployee(browser)
  } finally {
    await browser.close()
  }
  console.log(`\nDone. Screenshots in ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
