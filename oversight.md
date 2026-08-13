# HRMS Oversight Review

Human/process oversights — not code bugs, but workflow design gaps a real HR, finance, or L&D team
would hit in production. Compiled from a full sweep of every module (people, leave, time/payroll,
expenses, performance, rewards, LMS, letters, work passes, documents, auth).

---

## Remediation status

Being fixed in phases, module by module. **§1 (cross-cutting) is done** — see the ✅ markers in that
section. The per-module sections (§2–§11) are not yet worked through, though several of their items
were resolved as a side effect of the §1 work and are marked accordingly.

| Phase | Scope | Status |
|---|---|---|
| 1 | §1 Cross-cutting themes | ✅ Done |
| 2 | §2 People, org chart, auth | Not started |
| 3 | §3 Leave, holidays, blackouts, calendar | Not started |
| 4 | §4 Time & attendance | Not started |
| 5 | §5 Payroll | Not started |
| 6 | §6 Expenses | Not started |
| 7 | §7 Performance | Not started |
| 8 | §8 Rewards | Not started |
| 9 | §9 Learning / LMS | Not started |
| 10 | §10 Letters, work passes, documents | Not started |
| 11 | §11 Operational odds and ends | Not started |

**Decisions taken in phase 1** (these set the pattern later phases should follow):

- **HR role** — capability-based authorization in `src/lib/permissions.ts`. HR holds everything
  except hard deletes, role/status changes, payroll export, and paying money out (expense
  reimbursement, bonus payout). ADMIN holds everything, always.
- **Notifications** — `Notification` model + header inbox + email via Resend, one `notify()` call
  in `src/lib/notify.ts`. Email is on by default, switchable via the `notify.emailEnabled` setting.
- **Self-approval** — hard-blocked everywhere, with `resolveApprover` routing to the reporting
  manager, then a configured fallback approver, then any other ADMIN/HR — never the requester.
- **Offboarding** — one flow (`src/actions/offboarding.ts`); sessions die immediately because the
  DAL re-reads user status from the database on every request.
- **Dead ends** — one audited `reverseState` helper (`src/lib/reversal.ts`) with a mandatory
  reason, reused per module.
- **Audit** — field-level diffs, export logging, and an `/admin/audit` viewer.
- **SG/MY** — versioned `StatutoryRuleSet` per country, HR-editable at `/admin/statutory`.
  ⚠️ The seeded values are the *previous* behaviour carried over and are flagged **unverified**;
  the Singapore overtime figures are still the Malaysian ones. They need employment-law review
  before anyone relies on them for pay.
- **MY state holidays** — deliberately deferred to §3.

> **Note on the "Add Employee" example:** in the current code the button *is* role-gated to ADMIN
> (`src/components/people/PeopleTable.tsx:225`) and `/people/new` enforces `requireRole(['ADMIN'])`.
> The real exposure on that screen is the **read** side: the "Show terminated" toggle and the full
> company directory are visible to every role — see §2.

---

## 1. Cross-cutting themes ✅ RESOLVED

These patterns repeat across almost every module and are the highest-impact fixes.

- ✅ **The HR role is locked out of nearly everything HR actually does.** Employee create/edit, identity
  records, work passes, the letters queue, performance cycles, reward cycles, holiday management, the
  admin learning page, and blackout admin are all `ADMIN`-only. The HR team will inevitably share the
  ADMIN login, destroying per-user accountability in the audit log.
  → Replaced with a capability map (`src/lib/permissions.ts`) enforced by `requireCapability` in the
  DAL. All ~40 role gates converted. Sidebar nav is capability-driven so HR can reach what it now
  holds. Verified per role: HR reaches every admin screen except `/admin/settings`.

- ✅ **Zero notifications for anything that matters.** Leave submit/approve/reject, timesheet submit/reject,
  expense lifecycle, performance deadlines, reward payouts, LMS lockouts — none send email or in-app
  notifications. Everything is discovered by chance login.
  → `Notification` model + header bell/inbox + email through the existing Resend integration, all
  behind one `notify()` call (`src/lib/notify.ts`). Wired into leave submit/approve/reject/cancel,
  timesheet submit/reject, expense submit/approve/reject/reimburse, review submission, reward
  approval and payout, LMS lockout (learner *and* HR), work-pass expiry, and approval reassignment
  on offboarding. `emailedAt`/`emailError` on each row so "was this person actually told?" is
  answerable.

- ✅ **Self-approval is possible everywhere.** ADMIN/HR can approve their own leave, an admin can
  approve and reimburse their own expense claim, approve their own timesheet, propose and approve
  their own bonus, and an employee with no reporting manager becomes **their own performance
  reviewer**. No module has a "not your own record" guard.
  → `assertNotSelf` + `resolveApprover` (`src/lib/approvers.ts`) applied to leave approve/reject,
  expense approve/reject/reimburse (single *and* bulk), timesheet approve/reject (single *and*
  bulk), reward proposal and cycle approval, and review submission. Cycle scoping now resolves a
  real reviewer instead of falling back to the employee, and reports employees it could not resolve
  instead of silently self-assigning.

- ✅ **No offboarding flow.** Termination flips `status` and archives a Drive folder but never reassigns
  direct reports, never re-routes pending approvals pinned to the leaver, never revokes their session
  (the 7-day JWT keeps working — a terminated ADMIN retains full access for up to a week), and never
  touches their passes, letters, or reviews.
  → `src/actions/offboarding.ts` reassigns reports, re-routes the leave/timesheet/expense queue,
  cancels the leaver's own pending requests, moves reviews they owned and waives their own, prorates
  annual leave to the last working day for final settlement, and flags work passes for cancellation
  — with a preview of all of it before anything changes. Setting status to TERMINATED from the edit
  form is now refused and points at this flow. Sessions end immediately: the DAL re-reads user
  status per request. Verified: a terminated user's still-valid 7-day token is rejected on the next
  request, and a token forging `role: ADMIN` is ignored because the role comes from the database.

- ✅ **Dead-end states with no admin escape hatch.** Recurring shape: a state you can enter but never
  leave — LMS test lockout, CLOSED review cycle, APPROVED reward cycle, REJECTED expense, CANCELLED
  leave, rejected employment letter.
  → One audited `reverseState` helper (`src/lib/reversal.ts`) with an explicit allowed-transition
  table covering all nine entity types, a mandatory reason of 10+ characters, a dedicated
  `*_REVERSED` audit row, and a notification to the affected employee. Shared confirm dialog in
  `src/components/shared/ReversalDialog.tsx`. **UI wired so far:** LMS lockout reset (on
  `/admin/learning`) and review-cycle reopen. The remaining surfaces (expense reopen, leave
  un-cancel, reward correction, letter re-draft) are one dialog each and belong with their module
  rounds — the helper and action already accept them.

- ✅ **Audit trails are write-only or too thin to answer real questions.**
  → `USER_UPDATED` now records a per-field before/after diff, with NRIC and passport recorded as
  *changed* but value-redacted rather than copied into a second table. Payroll, expense
  (reimbursement + filtered) and ratings/bonus exports are all logged with their row counts and
  filters. New `/admin/audit` viewer filterable by actor, entity type, action and date range, with
  an "exceptions only" toggle for reversals, deletes and exports.

- ✅ **Singapore/Malaysia split is half-modelled.** One statutory rulebook is applied to both countries in
  several places: leave entitlements, sick-leave banding, payroll OT multipliers, and Malaysian
  *state* holidays are all country-blind or wrong for one market.
  → Versioned `StatutoryRuleSet` per country with an effective date, so a rule change never rewrites
  figures already calculated. `computePayroll` and `calculateAnnualEntitlement` now take rules as
  input and each employee is costed against their own country. HR-editable at `/admin/statutory`.
  The uncapped tenure accrual (a 20-year employee reaching 38 days) now has a ceiling, and the
  carry-forward cap the UI has always promised is now actually applied.
  ⚠️ **Not finished by this work:** the seeded values are the previous behaviour carried over and are
  flagged **unverified** in the UI — the Singapore overtime figures are still the Malaysian ones.
  Setting statutory values is not something this system or its developers can determine; they need
  confirming by a qualified employment-law adviser and entering as a new version. Payroll now warns
  on screen and in the export while the rules are unverified.
  **MY state holidays deferred to §3** by decision.

---

## 2. People, org chart, auth

- **Whole-company directory readable by every role, including terminated staff.** `GET /api/users` only
  checks for a session; the "Show terminated" checkbox and status filter are shown to everyone, so a
  shop-floor contractor can enumerate all staff emails/phones and see who was terminated when.
  (`src/app/api/users/route.ts:25-32,57-78`, `src/components/people/PeopleTable.tsx:99-111,190-212`)

- **Any employee can open any colleague's profile** and read DOB, nationality, phone, manager, and
  direct reports — only NRIC/passport/leave blocks are ADMIN-gated. (`src/app/(dashboard)/people/[id]/page.tsx:14-16`)

- **Employees have no self-service profile edit.** Every phone-number or name-spelling fix is an ADMIN
  ticket; `profilePhotoUrl` is displayed but nothing can ever set it. (`src/actions/users.ts:213-217`)

- **No way to delete or merge a mis-created employee.** A duplicate/test record can only be set
  INACTIVE, and it still occupies the unique email/employee-number namespace and shows in the directory.

- **Terminating a manager blanks the org chart for the whole company.** The chart only loads ACTIVE
  users but keeps raw `reportingManagerId` as `parentId`; orphaned nodes make d3 stratify throw with no
  fallback. (`src/app/(dashboard)/people/org-chart/page.tsx:8-31`, `src/components/people/OrgChartCanvas.tsx:17-84`)

- ✅ *(fixed in §1)* **Org-chart cycles are not prevented server-side.** A→B and B→A mutual managers is achievable through
  the normal UI (the only guard is a client-side dropdown filter), corrupting approval routing.
  (`src/actions/users.ts:132,306`)

- **Default password is a hardcoded, guessable constant.** Every new hire and every admin reset gets
  `changeme123`; the reset shows it in a toast for the admin to relay by chat/verbally.
  (`src/actions/users.ts:107,481-487`)

- **Forgot-password is unreachable.** `PUBLIC_ROUTES` only contains `/login`, so `/forgot-password` and
  the emailed `/reset-password?token=` link both bounce to login — every locked-out employee becomes an
  ADMIN ticket. (`src/proxy.ts:4,19-27`)

- **Password change doesn't ask for the current password**, so a borrowed/unlocked session can be taken
  over permanently. No login rate-limiting or failed-attempt logging either. (`src/actions/auth.ts:125-184,66-98`)

- ✅ *(fixed in §1)* **Nothing stops the last ADMIN from demoting or deactivating themselves** — one click locks the Group
  out of all admin functions with no in-app recovery. (`src/actions/users.ts:209-318`)

- ✅ *(mostly fixed in §1 — capability map + `requireCapability`; middleware still does no authorization)* **Role/permission checks are per-page, not centralized.** The middleware does no authorization, so
  every page must remember to call `requireRole`; the coverage is already inconsistent (e.g.
  `/admin/letters` is ADMIN-only but `/admin/letters/[id]` is open to all roles). (`src/proxy.ts:4-47`)

- **NRIC/passport numbers stored and displayed in cleartext** with no field-level access log or masking.
  (`prisma/schema.prisma:291-295`, `src/components/people/EmployeeProfile.tsx:473-480`)

- **No emergency contact, next-of-kin, or bank fields exist at all** — HR will keep a side spreadsheet,
  defeating the system of record.

---

## 3. Leave, holidays, blackouts, team calendar

### Approvals
- ✅ *(fixed in §1 — sidebar entry added)* **The approvals inbox has no navigation entry point.** `/approvals` isn't in the sidebar; the only way
  in is a dashboard card that renders `null` when the count is zero. Managers can never review what they
  already actioned. (`src/components/layout/Sidebar.tsx:53-83`, `src/components/dashboard/ApprovalCountCard.tsx:14`)

- ✅ *(fixed in §1)* **HR is authorized to approve leave but has no screen to do it from.** The approvals page shows "you
  don't have any direct reports" to HR, while the server action explicitly allows role HR.
  (`src/app/(dashboard)/approvals/page.tsx:14-26` vs `src/actions/leave.ts:273`)

- ✅ *(leaver case fixed in §1 via offboarding re-routing; away/on-leave delegation still open)* **No delegate/escalation when the approver leaves or is away.** The inbox is strictly
  `approverId === me`; termination never reassigns pending requests, and there is no HR "all pending"
  view — requests are stranded with balance already deducted as pending. (`src/actions/leave.ts:569-590`,
  `src/actions/users.ts:285-317`)

- ✅ *(fixed in §1 — routes to the fallback approver)* **Employees with no reporting manager can't take any leave at all** — submission hard-fails with
  "contact your administrator", with no HR fallback approver and no submit-on-behalf action.
  (`src/actions/leave.ts:102-104`)

- **Approvers decide blind.** The approval card shows no remaining balance, no overlapping team leave,
  no blackout conflict, no store coverage — and approve is a single unconfirmed click the manager cannot
  reverse. Nothing checks how many people from the same store are already off, so an entire store can be
  approved off the same Saturday. (`src/components/leave/ApprovalList.tsx:102-172`, `src/actions/leave.ts:255-310`)

- **Actioning a request overwrites who was assigned to approve it**, and approval comments are stored in
  the `rejectionReason` column, so "approved with note" and "rejected because" are indistinguishable.
  Rejections aren't timestamped at all. (`src/actions/leave.ts:300-308,374-384`)

### Lifecycle dead-ends
- **No editing a pending request** — wrong dates mean cancel (irreversible) + resubmit.
- **Employees can't cancel their own approved leave** — the most common real-world change requires
  chasing HR/ADMIN. (`src/actions/leave.ts:421-427`)
- ✅ *(reversal available via `reverseState`; still needs a button on the leave detail page)* **CANCELLED is terminal** — an accidental cancel can only be "fixed" by ADMIN hard-delete + fresh
  submission. Hard delete is also the only correction tool for history, at odds with statutory
  record-keeping. (`src/actions/leave.ts:405-541`)
- **No duplicate/overlap check on submission** — the same week can be submitted twice, consuming balance
  twice. (`src/actions/leave.ts:151-234`)
- **Requests spanning New Year charge every day to the start year**, breaking carry-forward
  reconciliation. (`src/actions/leave.ts:168,210,288`)
- **Half-day on a multi-day range doesn't say which day is the half day** — payroll/rostering can't act
  on it. (`src/lib/workingDays.ts:44-45`)
- **Maternity, paternity, childcare, and NS leave cannot be requested by anyone** — the form only lists
  `applicableToAll` types, and there's no HR submit-on-behalf, so statutory parental leave can only enter
  via CSV import or DB edit. (`src/app/(dashboard)/leave/request/page.tsx:8-18`, `prisma/seed.ts:111-115`)
- **Insufficient balance blocks submission outright** — no "apply anyway / unpaid overflow / HR
  exception" path. (`src/actions/leave.ts:165-176`)

### Entitlements & balances
- ✅ *(country-aware and capped in §1 via the statutory rulebook; MY sick-leave banding still to be entered)* **Entitlement formula is hardcoded and country/grade-blind**: Employee 18 / Contractor 14 / Part-time 8,
  +1 day per year of tenure *with no cap* (a 20-year veteran silently accrues 38 days). MY sick-leave
  tenure banding and SG/MY statutory differences aren't modelled. (`src/lib/leaveEntitlement.ts:17-27`,
  `prisma/seed.ts:108-116`)
- **Maternity/paternity eligibility keys off a free-text nullable `gender` string** — a blank or
  lowercase value grants the wrong 112-day balance. (`src/actions/leaveBalance.ts:68-81`)
- ✅ *(cap now applied, configurable in Settings → Leave; re-runnable / no-preview / terminated-staff issues still open)* **Carry-forward UI promises a 5-day cap the code doesn't implement** — it carries the full unused
  balance, uncapped. It's also re-runnable with no guard (re-running after 31 March double-credits
  employees), includes terminated staff, and silently forfeits pending requests with no preview/dry-run.
  (`src/components/leave/CarryForwardForm.tsx:28-31` vs `src/actions/leaveBalance.ts:279-322`)
- ✅ *(proration fixed in §1 offboarding; balance admin still can't select terminated staff)* **No leaver proration or final-settlement flow** — someone leaving in February keeps a full year's
  entitlement; balance admin can't even select terminated employees to correct final pay.
  (`src/lib/leaveEntitlement.ts:32-42`, `src/app/(dashboard)/admin/leave/page.tsx:12-16`)
- **No leave-type admin UI** — adding "Marriage Leave" or changing sick-leave rules is a code/DB change.
- **Any authenticated user can read anyone's leave history and balances** via the exported server
  actions — sick/maternity history of any colleague is exposed. (`src/actions/leave.ts:547-563`,
  `src/actions/leaveBalance.ts:111-124`)
- **CSV import bypasses every validation** (balance, blackout, overlap, attachment), forces all rows to
  APPROVED regardless of the CSV's status column, is irreversible with no dry-run or batch ID, and
  leaves `approverId` null so imported records are invisible to managers. (`src/actions/leaveImport.ts:63-141`)

### Holidays
- **Holiday management is ADMIN-only and manual, one date at a time** — ~26 SG+MY holidays per year with
  no bulk import; an incomplete calendar silently overcharges leave. HR can't maintain it at all.
  (`src/actions/holidays.ts:36,96`, `src/components/holidays/HolidayManager.tsx:42-101`)
- **A holiday can never be deleted, and `isObserved` can't be turned off from the UI** — a mistyped or
  re-gazetted date is permanently baked into every working-day calculation.
  (`src/components/holidays/HolidayManager.tsx:145`)
- **Years are hardcoded to 2025–2027** in the manager, and the dashboard widget literally fetches
  `year=2026` — in 2028 the app quietly stops working. (`src/components/holidays/HolidayManager.tsx:158,203`,
  `src/components/people/CountryHolidays.tsx:27`)
- **No Malaysian state holidays** — the model is country-level only, so Selangor/Johor/Penang staff get
  charged leave on their state holiday. (`prisma/schema.prisma:385-396`)
- **Fixed Sat/Sun weekend assumption** — retail store staff work weekends on rotating rest days; their
  leave days are miscounted. (`src/lib/workingDays.ts:35-40`)

### Blackouts
- **Hard blackouts have no exception path for anyone, including HR** — the error says "Talk to HR if
  it's an emergency" but there is no in-system route; the block even applies to sick, hospitalisation,
  and compassionate leave. (`src/actions/leave.ts:155-163`)
- **"Warning only" mode does literally nothing** — non-hard-block overlaps are fetched and discarded;
  the admin toggle is decorative. (`src/actions/leave.ts:156-163`)
- **Employees can't see blackout windows before planning** — they're ADMIN-only and absent from the
  calendar and request form; staff discover the block only after filling in the whole form.
  (`src/actions/blackouts.ts:114-117`)
- **Blackouts scope to country only** — a CNY peak window blocks HQ finance exactly like store staff,
  and creating a blackout after the fact doesn't flag already-approved leave inside it.
  (`src/actions/blackouts.ts:15-23,29-94`)
- **Blackout delete is one un-confirmed click, hard-deleted.** (`src/components/admin/BlackoutManager.tsx:120-126`)

### Team calendar
- **Everyone in the company sees everyone's leave *type*** — "Maternity Leave"/"Sick Leave" is broadcast
  company-wide (contractors included), with no team/store/country filter, so the view is also unusable
  at 75+ stores. Terminated employees' future leave keeps showing. Pending requests are invisible, so an
  approver can't see the three other requests queued for the same week.
  (`src/app/api/calendar/leaves/route.ts:26-101`)

---

## 4. Time & attendance

- **The 14-day retroactive cap has no admin override — a genuine dead-end.** A forgotten shift, or an
  entry rejected on day 13, can never be entered or fixed; there is no admin back-door entry path.
  (`src/actions/timeEntry.ts:20,77-79`)
- ✅ *(reversal available via `reverseState`; still needs a button on the approvals screen)* **The admin unlock exists in the action layer but has no UI** — an entry approved in error is
  permanently APPROVED without database access. (`src/actions/timeEntry.ts:352-375`)
- ✅ *(fixed in §1 — resolves a real approver)* **Timesheets from unmanaged employees vanish.** `submitWeek` sets `approverId: null` when there's no
  manager; those entries appear in nobody's queue, can't be edited, and never reach payroll.
  (`src/actions/timeEntry.ts:204-211,414-423`)
- **Approvers see a bare hours number** — start/end/break are hidden from the queue and never
  cross-checked against `hoursWorked`, so "12h worked, 09:00–12:00" is approvable. One-click
  approve-whole-week, no bulk reject, no anomaly highlighting, no cap beyond 24h/day (7×24h flows
  through to pay). (`src/components/time/ApprovalQueue.tsx:182-241`, `src/actions/timeEntry.ts:25`)
- **Managers can't adjust hours or partially approve** — reject-the-day is the only tool, and combined
  with the 14-day cap it can lose the day entirely near month end.
- ✅ *(the employee is now notified on rejection; the misleading submit-week counter is still open)* **Rejected days silently disappear** — the "Submit week" counter only counts DRAFTs, so a week looks
  complete while a rejected day sits unresolved and unpaid. No notification tells the employee they were
  rejected. (`src/components/time/WeeklyTimesheet.tsx:113,183-186`)
- **Saving hours writes no audit log**, and a save posted without `entryId` can overwrite an APPROVED
  (possibly already-exported) entry back to DRAFT. (`src/actions/timeEntry.ts:100-135`)
- **Holiday premium is frozen at save time** — a holiday gazetted or corrected later never propagates,
  paying 1× instead of 2×/3×; the calendar is also keyed to the employee's country, not the store they
  actually worked at. (`src/actions/timeEntry.ts:88-98,119`)
- **The Timesheet nav is shown to admins/managers, then blocked with an error** — a visible action that
  cannot work, and no on-behalf-of entry mode exists. (`src/components/time/TimeTabs.tsx:17-23`)
- **`/time/approvals` shows subordinates' hourly pay rates to any user with reports** — no HR/finance
  restriction. (`src/components/time/ApprovalQueue.tsx:150-158`)

---

## 5. Payroll

- **No approval, sign-off, or lock step at all.** No PayrollRun entity, no `exportedAt`, nothing freezes
  what was actually paid; the export regenerates from live data every time, so re-running after edits
  silently produces different figures from what was paid. (`src/app/(dashboard)/payroll/page.tsx:36-80`,
  `src/app/api/payroll/export-monthly/route.ts:7-40`)
- **Leavers are silently dropped from their final payroll.** Both the page and the export filter
  `status: 'ACTIVE'`, so someone terminated mid-month has their approved final hours never paid and
  never flagged. Converting a part-timer to full-time mid-month similarly wipes their hours from the
  view. (`src/actions/timeEntry.ts:430-432`)
- ✅ *(payroll screen and export now warn on both)* **Missing hourly rate silently pays zero** — the row renders "0.00" and exports as 0 with no warning.
  A missing daily-hours value silently defaults to 8, changing the OT threshold.
  (`src/actions/timeEntry.ts:462-463`, `src/lib/payroll.ts:51`)
- ⚠️ *(structurally separated in §1 — each country now has its own editable rule set, but the SG values are still the MY ones and are flagged unverified pending qualified review)* **Malaysian Employment Act OT multipliers are applied to Singapore employees** — the 45h/week cap and
  1.5×/2×/3× rules run unconditionally for both countries (the page subtitle even says so). Compliance
  and pay-accuracy issue; needs qualified employment-law review, not just a code tweak.
  (`src/lib/payroll.ts:1-13,35,98-103`)
- **SGD and MYR are summed into one "Total payout" headline number.** (`src/app/(dashboard)/payroll/page.tsx:46,94-98`)
- **Weeks straddling month-end get a fresh 45h OT allowance in each month**, understating overtime every
  single month. (`src/lib/payroll.ts:35,84-92`)
- **No warning about hours still awaiting approval** — payroll can be finalized while a manager's queue
  is full, and the shortfall is invisible. No drill-down from any payroll figure to the entries behind it.
- ✅ *(now audit-logged; the future-month issue is still open)* **The export leaks emails and hourly rates in an unlogged XLSX**, and accepts any month including
  future ones (a file of zeros that looks like a real run). (`src/app/api/payroll/export-monthly/route.ts:10-87`)

---

## 6. Expenses

- **The whole module is hidden behind a hardcoded flag, but every server action and export API is still
  live.** In-flight claims are frozen with no UI to approve, reject, or even view them — money owed to
  staff is stranded — while the mutations remain callable by URL. (`src/app/(dashboard)/expenses/page.tsx:21-24`,
  `src/actions/expense.ts`)
- ✅ *(fixed in §1 — routes through `resolveApprover`, with an optional finance-approver env override that no longer throws when unset)* **Every claim in the company routes to two hardcoded named individuals at an external domain**
  (`jin@tictag.io`, fallback `kevin@tictag.io`) — `reportingManagerId` is ignored, there's no delegation
  or backup, and if the user row is missing, submission throws. A company-wide single point of failure.
  (`src/lib/expenses.ts:22-46`)
- **No receipt is ever required** to submit, approve, or reimburse a claim. No spending thresholds or
  second-level approval either — SGD 12 and SGD 120,000 are approved identically (approval `order` is
  hardcoded to 1, so multi-tier is structurally impossible). (`src/actions/expense.ts:43,92-100,236-243`)
- **No duplicate detection** — the same taxi receipt can be claimed twice across two months, undetected.
- ✅ *(reversal available via `reverseState` → DRAFT; still needs a button on the expense detail modal)* **REJECTED is a dead-end** — only DRAFTs can be edited/submitted, so a rejected claim can never be
  corrected and resubmitted; the employee can't delete it either. And the rejection reason is optional,
  so staff can be denied money with no explanation. (`src/actions/expense.ts:115-117,221-223,340`)
- **No withdraw/cancel after submission** — there is no CANCELLED status; the employee must ask the
  approver to reject their own mistake.
- ✅ *(reversal available via `reverseState` → APPROVED; the delete-on-any-state button is still open)* **REIMBURSED is terminal with no reversal** — a bounced payment can't be un-marked; the only exit is
  an admin hard delete that also destroys the Drive receipts backing a *paid* claim. That delete button
  is offered on every expense in every state. (`src/actions/expense.ts:404-415,805-854`,
  `src/components/expenses/ExpenseDetailModal.tsx:387-426`)
- **The reimbursement export is a double-payment machine.** It dumps *all* APPROVED expenses on every
  run with no payment-run record, no date scope, and no "exported" marker — Monday's and Friday's files
  overlap and nothing records what already went to the bank. (`src/app/api/expenses/export-reimbursement/route.ts:16-31`)
- **When an admin overrides an approval, the timeline shows the wrong person as having approved.**
  (`src/actions/expense.ts:289-302`)
- **13 currencies accepted with no FX rate stored** — no SGD/MYR equivalent anywhere, so group spend
  can't be totalled and the amount actually paid out is unrecorded. (`src/lib/expense-constants.ts:10-24`)
- ✅ *(both exports are now audit-logged with their filters and row counts; the DRAFT leak via `status` is still open)* **The filtered export with no filters is a full-company dump** (emails + receipt links), DRAFTs of
  other employees can be listed via the `status` param, and no export is audit-logged.
  (`src/app/api/expenses/export-filtered/route.ts:23-77`)
- **Bulk reimburse fires from one un-confirmed button**, reports only a count (skipped IDs are never
  named), and stamps `reimbursedAt = now()` rather than the actual bank payment date.
  (`src/actions/expense.ts:446-497`)

---

## 7. Performance

- ✅ *(reopen wired on the cycle page in §1; the missing precondition checks before closing are still open)* **CLOSED is permanently terminal.** Close FY2026 a week early by mis-click and there is no reopen —
  late reviews, corrections, and appeals are all impossible; the only workaround is a duplicate cycle
  splitting the year's history. Closing also has zero precondition checks — 40 reviews still
  IN_EVALUATION close with one un-confirmed click, and ACTIVE → CLOSED can skip evaluation entirely.
  (`src/actions/performance.ts:245-263`)
- ✅ *(fixed in §1 — scoping resolves a real reviewer and reports anyone it cannot)* **Employees with no manager become their own reviewer** — `managerId: reportingManagerId ?? u.id`.
  The code comment says "admin can reassign" but **no reassignment action exists anywhere**. They set
  their own goals, rate themselves, and that self-rating feeds the bonus picker.
  (`src/actions/performance.ts:220,310,469,578`)
- ✅ *(fixed in §1 — offboarding reassigns reviews they owned)* **When a manager leaves, their team's reviews are permanently unactionable** — the departed manager
  can't log in, `managerId` is never rewritten, and the detail page gates every form on `isManager`, so
  even the ADMIN fallback in the actions is unreachable through the UI. (`src/actions/performance.ts:310`,
  `src/app/(dashboard)/performance/[id]/page.tsx:83-98`)
- **Wrongly scoped employees can never be removed from a cycle** — scoping is add-only with no preview
  and no undo; a bad department filter that pulls in 200 people is permanent.
  (`src/components/performance/ScopeAssignmentForm.tsx:66-91`)
- **No calibration stage** — the employee sees the raw rating the instant the manager submits; HR has no
  moderation window, and the bonus picker exposes mid-flight ratings from cycles still in EVALUATION.
  (`src/actions/performance.ts:505-521`, `src/actions/rewards.ts:325-329`)
- **No dispute/appeal path** — the employee's only button is "Acknowledge review"; the helper text sends
  them to find HR out-of-system. `reopenReview` has no UI, only accepts already-ACKNOWLEDGED reviews (so
  a known-wrong rating can't be fixed until the employee signs it), and reopening after cycle close
  strands the review permanently. (`src/actions/performance.ts:563-637`)
- ✅ *(fixed in §1 — offboarding waives it, audit-logged)* **A terminated employee's review is stranded at "Awaiting employee" forever** — no admin
  force-acknowledge/waive exists, skewing every completion report.
- **All three deadlines are decorative** — stored and displayed but never compared to `now`; nothing
  locks, flags overdue, or reminds. `evaluationOpensAt` can't even be set in the create form, and no
  date-ordering validation exists (end before start is accepted). (`src/actions/performance.ts:24-43,130-132`)
- **Config options that do nothing:** the employee self-assessment toggle is stored/exported but no form
  ever writes it; sales targets render read-only "Not set" with no way to enter them; `minGoals` isn't
  re-checked at submission; goal weights are never validated to sum to 100; rating labels can disagree
  with the scale length so top ratings render as "5 — " with no meaning.
  (`src/components/performance/ReviewSubmitForm.tsx:125-133`, `src/actions/performance.ts:349-391,53,109-122`)

---

## 8. Rewards

- ✅ *(fixed in §1 — you cannot write your own allocation, nor approve a cycle you are a recipient in; payout is now a separate ADMIN-only capability)* **One admin can allocate themselves a bonus and approve it alone** — proposer, approver, and recipient
  can all be the same person; approval is a bulk one-click `updateMany` of every draft with no
  per-allocation review or confirmation. (`src/actions/rewards.ts:118-124,165,208`)
- ✅ *(reversal available via `reverseState` for both cycle and allocation; still needs buttons on the cycle page)* **APPROVED is a one-way door** — a 5,000 typed as 50,000 discovered after approval can only be
  cancelled, never corrected or replaced; employees can't be added after approval (new hires miss the
  cycle); CANCELLED has no un-cancel. Closing a DRAFT cycle strands every allocation in DRAFT forever;
  closing an APPROVED cycle marks the round "done" while nobody ever gets paid — and nothing surfaces it.
  (`src/actions/rewards.ts:103-107,178-211,238-248`)
- **The bonus pool is not a budget control** — labelled "informational only", never compared to the sum
  of allocations; nothing blocks or warns when allocations exceed the pool.
  (`src/components/rewards/RewardCycleForm.tsx:112`)
- **One currency per cycle but candidates span SG and MY** — an MYR cycle hands payroll MYR amounts for
  Singapore staff. (`src/actions/rewards.ts:205,309-321`)
- **Paid bonuses drift from their justification** — the linked rating is read live at render/export time,
  so reopening a review retro-changes an already-paid bonus's paper trail. The `linkedReviewId` isn't
  even validated to belong to the same employee. (`src/actions/rewards.ts:36,182-212,290`)
- **No eligibility rules and optional rationale** — nothing requires a completed review, excludes failed
  probation, or pro-rates part-year service; amounts can be approved and paid with no recorded
  justification. `PAID` is one click that stamps `paidAt = now()` with no payroll confirmation.
  (`src/actions/rewards.ts:35,125-130,160-232`)
- ⚠️ *(they are now notified on approval and payout in §1, but there is still no employee-facing rewards route)* **Employees have zero visibility of their own rewards** — no employee-facing route, no notification,
  no record they can see, hence no basis for dispute. (`src/components/layout/Sidebar.tsx:69-82`)

---

## 9. Learning / LMS

- ✅ *(fixed in §1 — HR/ADMIN reset on `/admin/learning`, audited with a reason; the attempt limit is now a setting)* **Test lockout after 3 fails is permanent — no reset exists anywhere in the product.** No action, API,
  or admin UI ever writes `locked: false` for another user; a store associate who fails Test 1 three
  times can never complete onboarding without a database edit. Worse, the lockout message tells learners
  in three languages "Please contact HR, who can reset your access" — a capability that does not exist.
  (`src/components/learning/LearningApp.jsx:240-244,1689-1703,2677`, `src/actions/learning.ts:189-212`)
- **The only "Reset attempts" button in the codebase is unreachable dead code** — nothing navigates to
  the admin screen it lives on, and even if reached it would only reset the *admin's own* attempts.
  (`src/components/learning/LearningApp.jsx:2079-2085,3192-3203`)
- ✅ *(fixed in §1 — lockouts now notify the whole HR group and the learner, in-app and by email)* **"HR escalation" on lockout is a string that's thrown away** — the `hrEvents` array is never
  persisted, emailed, or shown to anyone; HR is never actually notified of lockouts, failures, or
  completions. There is no Notification model at all. (`src/components/learning/LearningApp.jsx:2687-2696,2875-2879`)
- **Week 4/6/8 unlock gating has no override for late joiners or transfers** — a new hire stares at an
  empty hub for four weeks with no admin early-access control; meanwhile enrollment is implicit (falls
  back to `createdAt`), so long-tenured staff imported into the system get everything unlocked instantly.
  (`src/components/learning/LearningApp.jsx:2955-2961`, `src/actions/learning.ts:114`)
- **New module lessons are gated behind the full onboarding certificate**, so L&D can never deliver new
  training to existing staff (or anyone locked out of a test). (`src/components/learning/LearningApp.jsx:3056-3075`)
- **Admins cannot correct any learner's progress** — wrongly recorded passes or progress lost to a bad
  sync are unfixable in-product. Meanwhile progress is fully client-asserted: the browser can POST
  `passed: true, locked: false` with any backdated `completedAt`, and no audit trail or attempt history
  exists to tell a genuine pass from a forged one. (`src/actions/learning.ts:42-72,189-212,372-430`)
- **Question banks including the answer key are publicly fetchable** — default banks live in `/public`
  (no session needed) with the convention "column `a` is always correct", and admin-uploaded banks are
  returned as raw CSV to any learner. Uploaded SOP decks are served with auth deliberately removed.
  (`public/materials/en/1.csv`, `src/app/api/learning/materials/route.ts:33-58`, `src/app/api/learning/materials/[key]/route.ts:5-9`)
- **Lesson "completion" is a 1.5–4 second timer plus a click** — cash-handling training can be signed
  off in under 10 seconds, and this is what the admin dashboard reports as compliance.
  (`src/components/learning/LearningApp.jsx:1110-1119,1239-1246`)
- **A dropped connection or timer expiry burns a real attempt** toward the permanent lock, with no
  "void this attempt" discretion. (`src/components/learning/LearningApp.jsx:1664-1671`)
- **Deleting a module lesson silently destroys every learner's completion record** for it — the only
  guard is a browser confirm that doesn't mention progress loss. And module-lesson completion is
  invisible in the admin table anyway, which only iterates the hardcoded onboarding IDs.
  (`src/actions/learning.ts:346-353,393-415`)
- **Material uploads overwrite in place, live, with no version history** — "Revert" only restores the
  shipped default, not the previous custom upload; replacing a quiz bank doesn't invalidate or re-run
  anyone's results; and a single upload force-applies to all three languages, so an English-only bank
  silently replaces the Chinese and Malay assessments. (`src/app/api/learning/materials/route.ts:144-186`,
  `src/components/learning/LearningApp.jsx:928-936`)
- **Due dates are cosmetic and nothing chases anyone** — the cron has no learning coverage, managers
  have no visibility of their team's progress, and learning appears on no one's dashboard. A cashier can
  sit at 0% for a year with no signal. (`src/lib/reminders.ts:55-161`, `src/actions/dashboard.ts:12-69`)
- **The certificate is print-only, signed by a hardcoded "John Doe", dated whenever it's printed, and
  never recorded** — HR can't prove who is certified, when, or against which content version. The admin
  "Certified" column also uses a different rule (3 tests) than the app itself (3 tests + survey).
  (`src/components/learning/LearningApp.jsx:1911-1948`, `src/actions/learning.ts:427`)
- **Learners are forced to submit a feedback survey that no one can ever read** — it's only rendered in
  the unreachable admin console. (`src/actions/learning.ts:215-232`)
- **Completion % is meaningless** — computed over *all* ACTIVE employees (veterans, admins, contractors)
  against a hardcoded 6-unit denominator, with no filter, search, or export on a 75-store roster.
  (`src/actions/learning.ts:375-377,417`)
- **Demo scaffolding ships in the live compliance path** — `devCompleteAll` (auto-passes everything with
  backdated timestamps), `setRole`, and `setSimDate` (fast-forwards past week gates) are all wired into
  the production reducer. (`src/components/learning/LearningApp.jsx:2589-2594,2736-2770`)

---

## 10. Letters, work passes, documents

### Letters
- **Signed employment letters are never delivered — the workflow dead-ends at SIGNED.** Only
  CONFIRMATION letters are ever sent (by `signLetter` and the cron); there's no "send to employee"
  button, so the new hire never receives their signed letter. (`src/actions/letters.ts:341-343`,
  `src/components/letters/LetterWorkspace.tsx:167-208`)
- **A rejected employment letter can never be re-drafted** — generation returns early if *any* letter of
  that type exists (including REJECTED), and no delete/regenerate/void action exists. The PDF is a
  creation-time snapshot, so fixing a misspelled name never updates the letter. (`src/actions/letters.ts:69-102`)
- **Nothing stops self-review/self-signing** — the officer picker doesn't exclude the letter's subject,
  and any ADMIN can draw a signature on a letter assigned to someone else while the record still names
  the intended signer. (`src/actions/letters.ts:196-219,291-338,440-447`)
- ✅ *(fixed in §1 — gated on `letters.read` or being the letter's subject, and `passwordHash`/`nric` are no longer selected)* **Any role can open any letter's detail page** and read the signed PDF; `getLetterDetail` has no
  authorization and returns the employee's entire User row — including `passwordHash` and `nric`.
  (`src/app/(dashboard)/admin/letters/[id]/page.tsx:11`, `src/actions/letters.ts:428-438`)
- **A letter already emailed to the employee can be flipped to REJECTED afterwards** — record and
  reality diverge. Employment letters also have no due date or reminder; only confirmations get chased.
  (`src/actions/letters.ts:237-253`, `src/lib/reminders.ts:85-139`)

### Work passes
- ✅ *(fixed in §1 — reminders repeat from the lead day onwards and expired passes escalate daily to all of HR)* **Renewal reminders fire on exactly one calendar day and never repeat** — strict-equality date match
  with no "reminded" marker, so one missed cron run means no reminder ever. Expired passes are never
  escalated by email despite the code comment promising it — an employee can keep working on a lapsed
  pass, a direct MOM/immigration exposure. (`src/actions/workPass.ts:211-227`)
- **Reminders go to an arbitrary "first HR user"** with no acknowledgement or escalation if that person
  is away or gone. (`src/lib/reminders.ts:39-45`)
- **Editing a pass overwrites the previous one in place** — no renewal workflow, no history, so the
  record of which permit covered which period is destroyed on every renewal. No validation stops expiry
  before issue, or overlapping active passes. (`src/actions/workPass.ts:81-118`)
- ✅ *(HR visibility fixed in §1, and the unauthenticated `getWorkPassesForReminder` action is gone — moved to a server-only module; telling the holder their own pass is expiring is still open)* **Passes are invisible to HR and to the pass holder themselves** — ADMIN-only everywhere; the employee
  is never told their own pass is expiring. `getWorkPassesForReminder` is meanwhile an exported action
  with **no auth at all**, returning every foreign worker's FIN/passport/expiry to any caller.
  (`src/actions/workPass.ts:68,187,215-227`)

### Documents
- **The file proxy is an authenticated open door to the whole Drive.** `GET /api/files/[fileId]` checks
  only for a session and streams any file ID — payslips, medical certs, signed letters of any employee —
  without verifying the caller may see that document. The Drive identity it impersonates falls back to a
  hardcoded personal account on an external domain (`jin@tictag.io`). (`src/app/api/files/[fileId]/route.ts:15-45`)
- **Mass-push documents share one physical file across N employees**, and one employee deleting "their"
  copy can bin the shared original once the row count hits zero. (`src/actions/documents.ts:114-137,305-330`)
- **Leavers' documents become unreachable through the UI** — the HR browser only lists ACTIVE employees,
  yet contracts/payslips must be retained after exit; no retention/purge workflow exists.
  (`src/actions/documents.ts:273-277`)
- **All-or-nothing visibility model** — HR sees everything including MEDICAL uploads; managers see
  nothing; no per-category restriction and no read-access log. (`src/actions/documents.ts:48-50,153-192`)

---

## 11. Operational odds and ends

- **The daily cron is fully open when `CRON_SECRET` is unset** (`if (!secret) return true`) and its run
  result is returned to the caller but never stored — a silently dead cron produces no missing-reminder
  signal. (`src/app/api/cron/daily/route.ts:11-30`)
- **Seed scripts ship weak documented credentials** — `test123` for ADMIN/HR/etc., with the demo seed
  disabling forced password change; `demo-start.cmd` prints them. Fine for a demo, fatal if run against
  anything internet-facing. (`prisma/seed-demo.ts`, `demo-start.cmd:19-26`)
- ✅ *(fixed in §1 for the five export routes via `requireCapabilityApi`/`withApiAuth`; other API routes still redirect)* **Unauthorized API/export fetches redirect (307) to an HTML dashboard instead of returning 403**,
  producing confusing failures rather than a permission error. (`src/lib/dal.ts:31-36`)
- **Shipped LMS assessment content is placeholder trivia** ("What is the capital of France?") presented
  as the graded, lockout-enforcing onboarding test for retail staff. (`public/materials/en/1.csv:2-3`)
