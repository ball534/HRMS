# InsideHR — Developer Handover

**Read this end to end before touching code.** It explains what every system in this
HRMS does, the exact step-by-step path each action takes through the codebase, and
how the systems trigger each other. File paths and function names are real — you can
open any of them as you read.

---

## Contents

**Part 0 — Orientation**
- [0.1 What this app is](#01-what-this-app-is)
- [0.2 Get it running](#02-get-it-running)
- [0.3 The mental model](#03-the-mental-model)
- [0.4 Seven rules that explain 90% of the code](#04-seven-rules-that-explain-90-of-the-code)
- [0.5 How to trace any feature in four steps](#05-how-to-trace-any-feature-in-four-steps)

**Part 1 — The foundations every system sits on**
- [1.1 The request lifecycle, step by step](#11-the-request-lifecycle-step-by-step)
- [1.2 Sessions and authentication](#12-sessions-and-authentication)
- [1.3 The DAL — the only auth boundary](#13-the-dal--the-only-auth-boundary)
- [1.4 The database client](#14-the-database-client)
- [1.5 The audit log](#15-the-audit-log)
- [1.6 The file storage layer](#16-the-file-storage-layer)
- [1.7 The notification layer](#17-the-notification-layer)
- [1.8 The User record — the hub everything hangs off](#18-the-user-record--the-hub-everything-hangs-off)

**Part 2 — The systems, in detail**
- [2.1 People and onboarding](#21-people-and-onboarding)
- [2.2 Career journey](#22-career-journey)
- [2.3 Work passes](#23-work-passes)
- [2.4 Employment and confirmation letters](#24-employment-and-confirmation-letters)
- [2.5 Leave — entitlement engine](#25-leave--entitlement-engine)
- [2.6 Leave — request and approval flow](#26-leave--request-and-approval-flow)
- [2.7 Leave — HR admin tools](#27-leave--hr-admin-tools)
- [2.8 Public holidays](#28-public-holidays)
- [2.9 Blackout windows](#29-blackout-windows)
- [2.10 Team calendar and Who's Out](#210-team-calendar-and-whos-out)
- [2.11 Part-time timesheet](#211-part-time-timesheet)
- [2.12 Payroll computation](#212-payroll-computation)
- [2.13 Expenses (currently switched off)](#213-expenses-currently-switched-off)
- [2.14 Documents](#214-documents)
- [2.15 Performance reviews](#215-performance-reviews)
- [2.16 Rewards and bonuses](#216-rewards-and-bonuses)
- [2.17 Learning Hub (LMS)](#217-learning-hub-lms)
- [2.18 Dashboard](#218-dashboard)
- [2.19 The daily cron](#219-the-daily-cron)

**Part 3 — How the systems connect**
- [3.1 The trigger map](#31-the-trigger-map)
- [3.2 Walkthrough: a new hire, day 0 to month 3](#32-walkthrough-a-new-hire-day-0-to-month-3)
- [3.3 Walkthrough: probation to confirmation](#33-walkthrough-probation-to-confirmation)
- [3.4 Walkthrough: month-end payroll](#34-walkthrough-month-end-payroll)
- [3.5 What breaks what](#35-what-breaks-what)

**Part 4 — Working on this codebase**
- [4.1 How to add a field to an employee](#41-how-to-add-a-field-to-an-employee)
- [4.2 How to add a new server action](#42-how-to-add-a-new-server-action)
- [4.3 Traps that will bite you](#43-traps-that-will-bite-you)

---

# Part 0 — Orientation

## 0.1 What this app is

One Next.js application that runs the employee lifecycle for a retail group operating
in **Singapore and Malaysia**: hiring, leave, part-time timesheets and payroll,
expenses, documents, performance reviews, bonus cycles, work-pass compliance,
auto-generated employment letters, and a three-language onboarding course.

It is a **monolith by design**. There are no microservices, no message queue, no
separate API server. Every system reads and writes one Postgres database through one
Prisma client. "Integration" between systems means one function importing another —
which makes the connections easy to follow once you know where to look, and easy to
break accidentally if you don't.

The internal product name is **InsideHR** (`package.json` says `insidehr`; the sidebar
header says InsideHR). The Learning Hub brands itself **iORA Learning Hub**.

## 0.2 Get it running

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and SESSION_SECRET at minimum
npx prisma migrate dev        # apply migrations + generate the Prisma client
npm run db:seed               # admin user, SG/MY 2026 holidays, 9 leave types
npm run db:seed-demo          # ~14 demo employees covering every flow (optional)
npm run dev                   # http://localhost:3000
```

On Windows, `demo-start.cmd` starts the portable Postgres in `..\.localdb` (port
**5455**) and then the dev server.

Demo logins after `db:seed-demo`, all with password `test123`:
`jin@company.com` (admin), `grace@iora.demo` (HR), `sara@iora.demo` (manager and
letter signer), `weiling@iora.demo` (employee with rich journey and learning data).

Everything else in this document is the detail.

## 0.3 The mental model

```
        ┌──────────────────────────────────────────────────────┐
        │  BROWSER                                             │
        └───────────────┬──────────────────────────────────────┘
                        │
             src/proxy.ts   ← runs first on every page request.
                        │      No session? → /login.
                        │      mustChangePassword? → /change-password.
                        ▼
        ┌──────────────────────────────────────────────────────┐
        │  SERVER COMPONENTS  (src/app/**/page.tsx)            │
        │  Run on the server. Call verifySession(), then       │
        │  await data functions directly. No fetch, no API.    │
        └───────────────┬──────────────────────────────────────┘
                        │ pass serialized props
                        ▼
        ┌──────────────────────────────────────────────────────┐
        │  CLIENT COMPONENTS  ('use client')                   │
        │  Forms, tables, dialogs. Submit via useActionState   │
        │  or call an action inside startTransition().         │
        └───────────────┬──────────────────────────────────────┘
                        │ server action call (an RPC Next.js wires up)
                        ▼
        ┌──────────────────────────────────────────────────────┐
        │  SERVER ACTIONS  (src/actions/*.ts, 'use server')    │
        │  1. verifySession / requireRole                      │
        │  2. Zod-validate the FormData                        │
        │  3. Load current state, check the transition is legal│
        │  4. Write (usually in a $transaction)                │
        │  5. createAuditLog(...)                              │
        │  6. revalidatePath(...)                              │
        │  7. return { success } or { error }                  │
        └───────────────┬──────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┬──────────────────────┐
        ▼                               ▼                      ▼
   PostgreSQL                    PostgreSQL (files)       Resend / Lark
   (src/lib/db.ts)               (src/lib/storage.ts)    (src/lib/notifications.ts)
```

Route handlers under `src/app/api/**` exist only for things server actions can't do:
streaming a file, receiving a raw upload, returning an XLSX download, serving JSON to
a client-side `fetch`, and the cron entry point.

## 0.4 Seven rules that explain 90% of the code

**Rule 1 — Server actions are the write API.** Every mutation in the product is an
exported async function in `src/actions/*.ts` marked `'use server'`. There is no
`/api/leave` POST endpoint. If you want to know how something gets written, find the
action.

**Rule 2 — Actions return state, they don't throw.** The shape is always
`{ success?: boolean; error?: string; errors?: Record<string, string[]> }`, designed
for React's `useActionState`. Errors are caught, `console.error`'d server-side, and
returned as a friendly string. That is why almost every action body is wrapped in
`try/catch`.

**Rule 3 — Auth is `verifySession()` / `requireRole()`, called at the top.** From
`src/lib/dal.ts`. They **redirect** — they do not return 401. A page render that
fails the check bounces to `/login` or `/dashboard`.

**Rule 4 — Ownership is checked inside the action, not by the role.** `MANAGER` is
barely a role gate; what matters is `User.reportingManagerId`. A manager can approve
a leave request because `request.approverId === session.userId`, not because their
role says MANAGER.

**Rule 5 — Every meaningful write is audited.** `createAuditLog()` from
`src/lib/audit.ts`, with an action from the ~50-value `AuditAction` enum. If you add
a state transition, add an enum value and an audit call.

**Rule 6 — Status transitions are validated server-side against an allowed-from
list.** You will see this pattern repeatedly:

```ts
const valid = { ACTIVE: ['DRAFT'], EVALUATION: ['ACTIVE'], CLOSED: ['EVALUATION','ACTIVE'] }
if (!valid[to].includes(cycle.status)) return { error: `Cannot transition ...` }
```

**Rule 7 — Prisma `Decimal` and `Date` must be serialized before crossing to a client
component.** `.toString()` for Decimal, `.toISOString()` for Date. Forgetting this is
the single most common runtime error in this codebase. See
`src/app/(dashboard)/people/[id]/page.tsx` for the canonical example — it serializes
about fifteen fields by hand.

## 0.5 How to trace any feature in four steps

Say a user reports "leave balance is wrong after approval".

1. **Find the page.** URL `/leave` → `src/app/(dashboard)/leave/page.tsx`.
2. **Find the data source.** That page calls `getLeaveBalances()` from
   `src/actions/leaveBalance.ts`.
3. **Find the writer.** Balances are written by `approveLeave` in
   `src/actions/leave.ts`, and by `adjustBalance` / `runCarryForward` in
   `leaveBalance.ts`.
4. **Find the rule.** The arithmetic lives in `src/lib/leaveEntitlement.ts`
   (`computeAvailable`, `applyCarryForwardExpiry`).

Pages render, actions write, `lib/` holds the rules. That layering holds everywhere.

---

# Part 1 — The foundations every system sits on

## 1.1 The request lifecycle, step by step

Concrete example: **an employee submits a leave request.** Follow this once and every
other flow in the app will look familiar.

**Step 1 — Navigation.** The user clicks "Request Leave" and the browser requests
`/leave/request`.

**Step 2 — The proxy runs** (`src/proxy.ts`). This is Next.js 16's renamed
middleware; the exported function is `proxy()` and its `config.matcher` excludes
`/api`, `/_next/static`, `/_next/image` and `.png`. It reads the `session` cookie and
calls `decrypt()` from `src/lib/session.ts`.
- No valid session and not a public route → redirect to `/login`.
- Valid session but `mustChangePassword` is true and the path isn't
  `/change-password` → redirect there.
- Otherwise `NextResponse.next()`.

**Step 3 — The layout renders** (`src/app/(dashboard)/layout.tsx`). It is an async
server component. It calls `verifySession()`, loads the user's name/email/
`employmentType`, counts direct reports, and renders `<Sidebar>` and `<TopBar>`
around the page. The sidebar's contents are computed from `role`, `isPartTime` and
`hasDirectReports` — that's why part-timers see Timesheet and others don't.

**Step 4 — The page renders** (`src/app/(dashboard)/leave/request/page.tsx`). Another
async server component. It loads the leave types — **filtered to
`applicableToAll: true`** — and renders the client component `LeaveRequestForm` with
them as props. That filter matters: Childcare, Maternity, Paternity and Military (NS)
leave are seeded with `applicableToAll: false` and therefore **never appear in the
request dropdown**. They have balances and the actions accept them, but there is no UI
path to request them today. Flip the flag on the `LeaveType` row to expose one.

**Step 5 — The user fills in the form.** As they pick dates,
`LeaveRequestForm` calls the server action `previewWorkingDays()`
(`src/actions/leave.ts:630`) to show a live "this will use N days, you have M
available" preview. This is a read-only action — it runs the same holiday and
balance maths the real submission will, so the preview can't disagree with the
outcome.

**Step 6 — Submit.** The form posts `FormData` to `submitLeaveRequest()`
(`src/actions/leave.ts:57`) through `useActionState`.

**Step 7 — The action runs.** In order:
1. `verifySession()` — who is this.
2. Zod parses `leaveTypeId`, `startDate`, `endDate`, `halfDay`, `reason`. On failure
   it returns the first field error.
3. Sanity checks: valid dates, start ≤ end.
4. Load the user (`country`, `reportingManagerId`, `employmentType`, `startDate`).
   **No reporting manager is a hard error** — there is nobody to route to.
5. Load the leave type. Enforce `requiresAttachment` and `allowsHalfDay`.
6. Load `PublicHoliday` rows for the user's country across every year the range
   touches.
7. `calculateWorkingDays()` (`src/lib/workingDays.ts`) — excludes weekends and those
   holidays, applies the half-day rule. Zero working days is an error.
8. `findOverlappingBlackouts()` (`src/actions/blackouts.ts`). Any overlapping window
   with `hardBlock: true` rejects the request by name.
9. Balance check, skipped when the leave type's `defaultEntitlement` is `0`
   (the "unlimited" convention). Otherwise `getOrCreateBalance()` then
   `computeAvailable()`.
10. If there's an attachment, store it via `putChecked()` and keep the blob id on
    `attachmentBlobId`. (Was: uploaded to Drive under
    `Documents/<Employee Name>/Leave Attachments` and keep the returned file ID.
11. **One `$transaction`**: create the `LeaveRequest` with `status: 'PENDING'` and
    `approverId = reportingManagerId`, **and** increment `LeaveBalance.pending` by
    the day count. The reservation and the request must land together or not at all —
    that is what prevents someone spending the same days twice.
12. `createAuditLog({ action: 'LEAVE_SUBMITTED', ... })`.
13. Return `{ success: true }`.

**Step 8 — The UI reacts.** The form sees `success` and redirects or toasts. The
manager's `/approvals` page and dashboard card pick the request up on their next
render, because they query by `approverId` + `status: 'PENDING'`.

Every other write in this app is a variation on those eight steps.

## 1.2 Sessions and authentication

**File:** `src/lib/session.ts`

A session is a **signed JWT in an httpOnly cookie**. There is no session table — the
cookie *is* the session.

- Payload: `{ userId, role, mustChangePassword, expiresAt }`.
- Algorithm HS256, signed with `SESSION_SECRET`, via the `jose` library.
- Cookie name `session`, `httpOnly`, `sameSite: 'lax'`, `secure` in production,
  7-day expiry (`SESSION_DURATION`).
- `createSession()`, `getSession()`, `decrypt()`, `deleteSession()` are the whole API.

**Consequence you must internalise:** the role lives in the cookie. If an admin
changes someone's role, that person keeps their old role until their session expires
or they log in again. Same for `mustChangePassword`, which is why `changePassword`
explicitly deletes and recreates the session with the flag cleared.

### Login — `login()` in `src/actions/auth.ts:49`

1. Zod-validate email and password.
2. Look the user up by email. **Every failure returns the same generic
   `'Invalid credentials'`** — unknown email, non-`ACTIVE` status and wrong password
   are indistinguishable to the caller, to prevent account enumeration.
3. `bcrypt.compare` against `passwordHash` (cost factor 12 everywhere).
4. `createSession(user.id, user.role, user.mustChangePassword)`.
5. Audit `LOGIN`.
6. Re-read `mustChangePassword` and `redirect()` to `/change-password` or
   `/dashboard`. The redirect is deliberately outside the `try/catch`, because
   Next.js implements `redirect()` by throwing — catching it would swallow the
   navigation.

### Change password — `changePassword()` at `auth.ts:125`

Minimum 8 characters, must match the confirmation, and **must differ from the current
password** (checked with `bcrypt.compare`). On success: hash, set
`mustChangePassword: false`, delete the session, create a fresh one, audit
`PASSWORD_CHANGED`, redirect to `/dashboard`.

### Forgot / reset password — `auth.ts:204` and `auth.ts:264`

`forgotPassword` **always returns `{ success: true }`**, even for unknown or inactive
emails — again, no enumeration. When the user does exist it invalidates any
outstanding tokens (`usedAt = now`), creates a `PasswordResetToken` with 32 random
bytes and a **1-hour** expiry, and emails `${NEXT_PUBLIC_APP_URL}/reset-password?token=…`.

`resetPassword` rejects tokens that are missing, already used, or expired; otherwise
it sets the new hash, clears `mustChangePassword`, stamps `usedAt`, audits, and
redirects to `/login?reset=success`.

### Admin reset — `adminResetPassword()` in `src/actions/users.ts:463`

ADMIN only. Sets the password back to the literal `changeme123`, sets
`mustChangePassword: true`, returns the temp password to the caller so the UI can
display it. Same value used for newly created employees.

### Logout — `auth.ts:330`

Audits `LOGOUT` (failure to audit doesn't block), deletes the cookie, redirects to
`/login`.

## 1.3 The DAL — the only auth boundary

**File:** `src/lib/dal.ts` — 37 lines, and everything depends on them.

```ts
export const verifySession = cache(async (): Promise<VerifiedSession> => {
  const session = await getSession()
  if (!session || !session.userId) redirect('/login')
  return { isAuth: true, userId, role, mustChangePassword }
})

export async function requireRole(allowedRoles: string[]) {
  const session = await verifySession()
  if (!allowedRoles.includes(session.role)) redirect('/dashboard')
  return session
}
```

Three things to note:

1. **`cache()` is React's per-request memoisation.** Calling `verifySession()` in a
   layout, a page and three actions during one request decrypts the cookie once.
2. **They redirect, not throw.** Great for pages. Awkward for anything called outside
   a browser navigation: a script or test that calls a server action without a valid
   cookie sees a redirect, not a clean error.
3. **`requireRole` sends unauthorised users to `/dashboard`,** so a non-admin who
   guesses `/admin/letters` bounces to the dashboard rather than seeing a 403.

The four permission shapes used across the app:

| Shape | Meaning | Typical caller |
|---|---|---|
| `verifySession()` | any logged-in user | submit leave, view own documents |
| `requireRole(['ADMIN'])` | admin only | review cycles, rewards, work passes, learning admin, payroll |
| `requireRole(['ADMIN','HR'])` | HR operations | letters queue, carry-forward, entitlement overrides |
| ownership check in the action | row-level | `expense.approverId === session.userId`, `entry.userId === session.userId` |

## 1.4 The database client

**File:** `src/lib/db.ts` (13 lines). A `PrismaClient` built on `@prisma/adapter-pg`,
reusing `global.prisma` if present and — **outside production only** — storing itself
there, so hot reload in dev doesn't open a new connection pool on every save.

The generated client lives in **`src/generated/prisma`** (see the `generator` block in
`prisma/schema.prisma`) and is **committed to the repo**. Import types from
`@/generated/prisma/client`, not from `@prisma/client`.

After changing `schema.prisma` you must run `npx prisma migrate dev` **and restart the
dev server** — the running process holds the old generated client and will throw
confusing "unknown field" errors otherwise.

## 1.5 The audit log

**File:** `src/lib/audit.ts` · **Model:** `AuditLog`

```ts
createAuditLog({ userId, action, entityType, entityId?, details?, ipAddress? })
```

- `userId` is the **actor**, not the subject. When HR adjusts Wei Ling's balance, the
  row's `userId` is HR's ID and the subject lives in `details.targetUserId`.
- `action` comes from the `AuditAction` enum (~50 values covering auth, leave,
  expenses, documents, reviews, time entries, rewards, work passes, blackouts,
  letters, probation decisions and folder archival).
- `entityType` comes from `AuditEntityType`.
- `details` is free-form JSON. The convention for updates is
  `{ before: {...}, after: {...} }`; for deletes, a snapshot of what was destroyed.

Reading it back is deliberately per-feature. `getLeaveAuditLogs(userId)` shows the
pattern — it unions three conditions: actions taken *by* the user, actions on that
user's leave request IDs, and balance adjustments found via a Prisma JSON path filter
`details: { path: ['targetUserId'], equals: userId }`. Capped at 50 rows, newest
first. That JSON-path query is the reason `targetUserId` must keep its exact name in
`details`.

## 1.6 The file storage layer

**Files:** `src/lib/storage.ts`, `src/lib/fileAccess.ts`, `src/lib/letterPdf.ts`

**All files are stored in Postgres.** Google Drive and Google Docs have been removed
entirely — there is no `googleapis` dependency and no `GOOGLE_*` configuration.

### Where bytes live

One table, `FileBlob`, holds every file. Records that own a file reference it by
`blobId`:

| Model | Column |
|---|---|
| `Document` | `blobId` |
| `ExpenseReceipt` | `blobId` |
| `LeaveRequest` | `attachmentBlobId` |
| `EmploymentLetter` | `blobId` (the generated PDF) |
| `LetterTemplate` | `blobId` (the fillable PDF template) |

The old `s3Key` / `driveFileId` / `attachmentKey` columns are still on those models but
are **legacy and never written** — they hold Drive ids for rows that predate this, and
those files were not migrated.

`LearningMaterial.data` still holds its bytes inline rather than going through
`FileBlob`; it predates this layer and was left alone.

### Two properties that matter

**Content addressing.** `FileBlob.sha256` is unique, so `put()` reuses an existing row
when the bytes match. Uploading the same PDF twice stores it once.

**Reference counting.** `put()` hands the caller one reference; `addRef()` takes
another; `release()` gives one back and deletes the bytes when the last one goes. This
is what makes mass-push documents safe — previously N employees shared one physical
Drive file with no accounting, so one of them deleting "their" copy could bin the
shared original for everyone.

Get this wrong in the safe direction: a leaked reference wastes space, a missing one
destroys a payslip.

### The functions you'll use

| Function | What it does |
|---|---|
| `storage.put(buffer, mime)` | Stores bytes (or reuses on hash match), takes one reference, returns `{ blobId, sha256, fileSize, deduped }` |
| `putChecked(buffer, mime)` | `put` plus the `files.maxUploadMb` limit; throws `FileTooLargeError` |
| `storage.get(blobId)` | Returns `{ data, mimeType, fileSize, sha256 }` or null |
| `storage.stat(blobId)` | Metadata **without** pulling the bytes |
| `storage.addRef(blobId)` | Take an additional reference |
| `storage.release(blobId)` | Give up a reference; deletes bytes at zero |
| `storage.pruneOrphans()` | Deletes blobs nothing references |

`storage` is a `StorageDriver`, so swapping to S3/R2 later is a new driver rather than
a sweep through every call site.

### Downloads and authorization

`GET /api/files/[fileId]` — the parameter is a `FileBlob` id now, though the route name
is unchanged so existing links keep working.

This route used to require only a session and then stream any Drive id handed to it,
which made every payslip, medical certificate and signed letter readable by anyone who
could observe an id. It now resolves what the blob *is* — via
`resolveFileAccess()` in `src/lib/fileAccess.ts` — and applies that record's rule:

| What it is | Who can read it |
|---|---|
| Company-scope document | any authenticated employee |
| Employee document | the employee, or `documents.admin` |
| MEDICAL document | the employee, or `documents.admin` — never a manager |
| Expense receipt | the claimant, the claim's approver, or `expense.admin` |
| Letter | the employee, the approving officer, or `letters.read` |
| Letter template | `letters.write` |

Anything else gets a 404 (not a 403 — telling an unauthorized caller that a file
exists is itself a disclosure). Every allowed read writes a `DOCUMENT_VIEWED` audit
row, so "who opened this payslip" is answerable.

### Letter generation (`letterPdf.ts`)

Letters were produced through Google Docs: copy a template Doc, `replaceAllText` the
`{{placeholders}}`, export to PDF via Drive. Templates are now **fillable PDFs**:

1. `LetterTemplate` holds one PDF per `LetterType`, uploaded at
   Admin → Letter Templates.
2. `fillLetterTemplate()` sets each AcroForm text field named after a merge field
   (`LETTER_MERGE_FIELDS`), then **flattens** the form so the delivered letter is not
   editable.
3. `stampSignature()` draws the officer's PNG signature 180pt wide at `x: 72, y: 90`
   on the last page, capped at 70pt tall — unchanged from before, since signatures
   always went on with `pdf-lib`.

Field names that match no merge field are logged as a warning rather than failing the
letter, and surfaced on the admin screen — a typo'd field silently prints blank
otherwise.

**The trade-off:** PDF form fields are fixed boxes, so a long value clips instead of
reflowing the way it did in a Doc. Size `position`, `department` and `company`
generously.

`npm run letters:placeholder-templates` installs a plain unbranded working template
for both letter types (also a button on the admin screen). It exists so the workflow
runs before HR supplies stationery, and doubles as a reference PDF showing the field
names. It will not overwrite a real uploaded template.

If no template exists for a letter type, generation returns null and the letter record
is still created without a PDF — the same degradation the Drive-less path had.

## 1.7 The notification layer

**Files:** `src/lib/notifications.ts` (facade), `src/lib/email.ts` (Resend),
`src/lib/lark.ts` (scaffold)

Two functions, deliberately few:

```ts
sendHrReminder({ to, subject, bodyHtml })   → { ok }             // always email
deliverLetter({ to, subject, bodyHtml, attachment? })
                                            → { channel: 'lark' | 'email' | 'failed' }
```

`sendHrReminder` **never throws** — it catches, logs, and returns `{ ok: false }`.
The daily cron depends on this: one bad address must not abort the sweep.

`deliverLetter` tries Lark first when `isLarkConfigured()`, and falls through to email
when Lark is unconfigured, stubbed, or fails. HTML is stripped to plain text for the
Lark path.

`src/lib/lark.ts` is **explicitly a scaffold, not an integration**. Its header lists
the four remaining steps (tenant_access_token exchange, email→open_id mapping via the
contact API, message send, file upload for the PDF). Until `LARK_APP_ID` and
`LARK_APP_SECRET` are set, sends are logged and stubbed. **In practice today every
letter goes out by email.**

`email.ts` lazily constructs the Resend client so a missing `RESEND_API_KEY` doesn't
crash at import time — only actual sends throw.

## 1.8 The User record — the hub everything hangs off

`User` in `prisma/schema.prisma` has 30+ relations. Before you change a field, check
this table — most fields are read by systems far from where they're edited.

| Field | Written by | Read by |
|---|---|---|
| `role` | admin, `updateUser` | session cookie, `requireRole`, sidebar, LMS admin console |
| `status` | `updateUser` | login (non-ACTIVE ends the session immediately — the DAL re-reads it per request), every "active users" query |
| `country` | `updateUser` | holiday lookup, working-day maths, blackout scope, timesheet PH detection, payroll currency, calendar colour |
| `employmentType` | `updateUser` | annual-leave base, timesheet eligibility, payroll roll-up, sidebar |
| `startDate` | `updateUser` | tenure bonus, pro-rata entitlement, probation end date, **LMS lesson unlock weeks** |
| `reportingManagerId` | `updateUser` | leave approver, timesheet approver, org chart, performance manager snapshot |
| `probationMonths` | `updateUser` | recomputes `probationEndDate` on every save |
| `probationEndDate` | derived | daily cron probation reminder, letter merge fields |
| `confirmationDate` | `setConfirmationDate` | **triggers the confirmation letter**, `CONFIRMED` career event, merge fields |
| `hourlyRate`, `normalDailyHours` | `updateUser` | payroll computation and XLSX export |
| `gender` | `updateUser` | maternity/paternity entitlement |
| `dateOfBirth` | `updateUser` | dashboard birthday widget |
| `employeeNumber` | `updateUser` | letter merge field (unique) |
| `nric`, `passportNumber`, `passportExpiry` | `updateUser` | letter merge fields, work-pass screen |
| `company` | `updateUser` | letter merge field, letter email subject |
| `folderArchivedAt` | — | **legacy**, no longer written (there is no folder to archive) |

**`startDate` is the highest-leverage field in the system.** Changing it silently
moves leave entitlement, probation end date, the confirmation-letter due date and
every LMS lesson unlock.

---

# Part 2 — The systems, in detail

## 2.1 People and onboarding

**Pages** `/people`, `/people/new`, `/people/[id]`, `/people/org-chart`
**Actions** `src/actions/users.ts`
**Components** `PeopleTable`, `AddEmployeeForm`, `EditEmployeeForm`, `EmployeeProfile`,
`OrgChart` → `OrgChartCanvas`, `CareerJourney`, `CountryHolidays`, `WorkPassManager`
**Models** `User`, `CareerEvent`

### Creating an employee — `createUser()` (`users.ts:54`), ADMIN only

1. `verifySession()`, then an explicit `session.role !== 'ADMIN'` check (this one
   returns an error rather than redirecting, because it's called from a form).
2. Zod-validate. `position`, `department`, `employmentType`, `country` and `role` are
   required; everything else optional.
3. Uniqueness: `email`, and `employeeNumber` if provided. Both return field-scoped
   errors so the form can highlight the input.
4. `bcrypt.hash('changeme123', 12)`.
5. `probationEndDate = computeProbationEnd(startDate, probationMonths ?? 3)` — literally
   `addMonths(startDate, months)` from date-fns, null when there's no start date.
6. `db.user.create()` with `mustChangePassword: true`, `status: 'ACTIVE'`.
7. Audit `USER_CREATED` with an `after` snapshot.
8. **Create a `CareerEvent`** of type `JOINED`, titled `Joined as <position>`,
   `effectiveDate = startDate ?? now`.
9. **`await generateEmploymentLetter(user.id)`** — see §2.4. This call is wrapped so
   it can never throw; a letter-generation failure must not block a hire.
10. `redirect('/people')`.

Note what does **not** happen: no leave balances are created (they're lazily created
on first access, §2.5), no LMS rows are created (also lazy), no welcome email is sent.

### Updating an employee — `updateUser()` (`users.ts:209`), ADMIN only

The interesting part is that it **diffs** against a `before` snapshot and derives side
effects:

1. Load `before` with the fields it needs to compare.
2. `becomingArchived = status ∈ {TERMINATED, REJECTED} && before.status ∉ {…}`.
3. Update the row, recomputing `probationEndDate`, auto-stamping `terminatedAt` when
   moving into TERMINATED (and clearing it when moving out), and stamping
   `folderArchivedAt` when archiving.
4. Audit `USER_UPDATED` with before/after status and role.
5. Build career events from the diff:
   - `position` changed → `POSITION_CHANGE`, titled `Moved to X` (or `Became X` when
     there was no previous position).
   - `department` changed → `DEPARTMENT_CHANGE`, titled `Transferred to X`.
   - status became TERMINATED → `TERMINATED`, titled "Left the company".
   All with `effectiveDate = new Date()` — **the date of the edit, not an effective
   date you can backdate.** A known limitation.
6. Nothing to archive: documents live in Postgres keyed by `employeeId` and are
   retained after the employee leaves
   inside its own `try/catch`, then audit `EMPLOYEE_FOLDER_ARCHIVED`.
7. `revalidatePath('/people/<id>')`.

### The profile page — `src/app/(dashboard)/people/[id]/page.tsx`

Worth reading in full as a model server component. It:
- resolves `isAdmin` and `isSelf` up front and uses them to **conditionally skip
  queries** (leave balances, requests, audit logs and work passes are only fetched for
  admins; career events only for `isSelf`);
- strips `passwordHash` by destructuring before passing the user down;
- serializes every `Date` to an ISO string and `Decimal` (`levy`) to a string;
- passes `WorkPassManager` in as a `workPassSlot` prop so the client component doesn't
  need to know about admin gating.

Careful: it computes the balance `available` inline as
`entitlement + carryForward + adjustment - used - pending` — **it does not use
`computeAvailable()`**, so it ignores `entitlementOverride` and carry-forward expiry.
The `/leave` page and dashboard use the real helper. If you see two different numbers
for the same person, this is why.

### Org chart

`OrgChart` is a thin wrapper that dynamically imports `OrgChartCanvas` with
`ssr: false`, because `d3-org-chart` touches `window` at module scope. Nodes are built
from `reportingManagerId`. Local type declarations live in
`src/types/d3-org-chart.d.ts`.

## 2.2 Career journey

**Model** `CareerEvent` · **Component** `src/components/people/CareerJourney.tsx`
**Shown on** the "Journey" tab of your **own** profile only (`isSelf`)

A timeline of milestones, ordered by `effectiveDate`. Five types: `JOINED`,
`POSITION_CHANGE`, `DEPARTMENT_CHANGE`, `CONFIRMED`, `TERMINATED`. Each row stores a
title, optional detail, and `fromValue`/`toValue` for change events so the UI can
render "Sales Associate → Senior Associate".

Events are **written by other systems, never by hand**:

| Event | Written where |
|---|---|
| `JOINED` | `createUser()` |
| `POSITION_CHANGE`, `DEPARTMENT_CHANGE`, `TERMINATED` | `updateUser()` diff |
| `CONFIRMED` | `setConfirmationDate()` |

`setConfirmationDate` **deletes all existing `CONFIRMED` events for the user before
creating the new one**, so re-setting the date keeps exactly one confirmation
milestone rather than accumulating them.

The component also infers un-recorded states (still on probation, etc.) from the
user's date fields, so a fresh employee's journey isn't empty.

## 2.3 Work passes

**Page** `/admin/work-passes` (also embedded on the profile via `WorkPassManager`)
**Actions** `src/actions/workPass.ts` · **Model** `WorkPass`

Tracks SG/MY immigration status. Pass types: `NONE` (citizen or PR — recorded
explicitly so "no pass needed" is distinguishable from "not captured yet"),
`SG_WORK_PERMIT`, `SG_S_PASS`, `SG_EMPLOYMENT_PASS`, `SG_DEPENDANT_PASS`,
`SG_LTVP_PLUS`, `MY_WORK_PERMIT`, `MY_EMPLOYMENT_PASS`, `MY_DEPENDANT_PASS`, `OTHER`.

Each row holds `passNumber`, `workPermitNumber`, `finNumber`, the four dates
(application → approval → issue → expiry), optional monthly `levy` and `notes`. A user
can have several rows — renewals are new records, not edits.

**The whole point of the module is the type-aware reminder lead time**
(`reminderLeadDays()`, `workPass.ts:49`):

| Pass type | Lead days |
|---|---|
| `SG_EMPLOYMENT_PASS`, `SG_S_PASS`, `MY_EMPLOYMENT_PASS` | 120 (≈4 months) |
| `SG_WORK_PERMIT`, `MY_WORK_PERMIT` | 60 (≈2 months) |
| everything else | 90 |

Two consumers:

- **`getWorkPassDashboard()`** — admin view. Excludes `NONE` passes and inactive
  users, then buckets by `daysUntil(expiryDate)`: `expired` (< 0), `due`
  (≤ lead days), `ok`. A null expiry counts as `ok`.
- **`getWorkPassesForReminder()`** — used by the cron. Returns passes where
  `daysUntil === reminderLeadDays` **exactly**. This is a deliberate one-shot so HR
  isn't spammed daily for four months — but it also means **a day the cron doesn't
  run is a reminder nobody ever gets.** The dashboard is the safety net; the email is
  a convenience. If you ever make the cron less reliable, change this to a
  "fire once, record that you fired" design.

`upsertWorkPass` and `deleteWorkPass` are ADMIN only, audit `WORK_PASS_CREATED` /
`_UPDATED` / `_DELETED`, and revalidate both `/people/<id>` and `/admin/work-passes`.

## 2.4 Employment and confirmation letters

**Pages** `/admin/letters` (queue), `/admin/letters/[id]` (workspace)
**Actions** `src/actions/letters.ts`, `src/actions/letterTemplates.ts` · **Libs** `letterPdf.ts`, `storage.ts`
**Components** `LetterWorkspace`, `SignaturePad` · **Model** `EmploymentLetter`

The most involved workflow in the app: template merge → PDF → review → signature →
storage → delivery, with the cron chasing it along.

### The two triggers

| Letter type | Created when | By |
|---|---|---|
| `EMPLOYMENT` | an employee is created | `createUser()` → `generateEmploymentLetter()` |
| `CONFIRMATION` | HR sets a `confirmationDate` | `setConfirmationDate()` → `generateConfirmationLetter(userId, date)` |

Both generators are **idempotent and never throw**. `generateEmploymentLetter` returns
early if an EMPLOYMENT letter already exists. `generateConfirmationLetter` returns
early if a non-REJECTED CONFIRMATION letter exists — but first it **syncs the due
date** and clears `overdue`, promoting an `OVERDUE` letter back to
`PENDING_SIGNATURE`. So moving someone's confirmation date forward un-flags the
overdue state rather than creating a second letter.

### Generating the PDF — `generateAndStorePdf()` (`letters.ts:69`)

1. Bail out returning `null` if there is no `LetterTemplate` row for
   this letter type is missing. The letter row is still created, just without a PDF.
2. `getEmployeeFolderName()` → `getLetterFolderPath()` = `['Employees', name, 'Letters']`.
3. Filename: `"Employment Letter - First Last - 05 August 2026.pdf"`.
4. `buildReplacements()` produces the merge map: `firstName`, `lastName`, `fullName`,
   `employeeNumber`, `nric`, `passportNumber`, `position`, `department`, `company`,
   `country`, `email`, `startDate`, `probationEndDate`, `confirmationDate`, `today`,
   `approvingOfficerName`. Dates are formatted `en-GB`, `02 January 2026`, forced to
   UTC. Missing values become empty strings, never "undefined".
5. `fillLetterTemplate()` fills the template's AcroForm fields and flattens, then
   `putChecked()` stores the PDF
   dance described in §1.6.

Templates are Google Docs containing `{{fullName}}`-style placeholders, identified by
`GOOGLE_DOCS_EMPLOYMENT_TEMPLATE_ID` and `GOOGLE_DOCS_CONFIRMATION_TEMPLATE_ID`.
Adding a merge field means editing the Doc **and** adding a key in
`buildReplacements()`.

### The state machine

```
        (auto-generated)
              │
              ▼
      PENDING_REVIEW ──── HR approves + names an officer ────► PENDING_SIGNATURE
              │                                                       │
              │                                              officer draws signature
              │                                                       ▼
              │                                                    SIGNED
              │                                                       │
              │                                    due date reached (or already past)
              │                                                       ▼
              │                                                     SENT
              │
              └──── reject (HR or officer, with a reason) ────► REJECTED

      PENDING_REVIEW / PENDING_SIGNATURE + past dueDate ──► overdue = true (cron)
```

### Step by step

**HR review — `approveLetterForSignature(letterId, approvingOfficerId)`**
ADMIN or HR. Requires status `PENDING_REVIEW` and a chosen officer. Sets
`PENDING_SIGNATURE`, stamps `reviewedById` and `reviewedAt`, stores
`approvingOfficerId`. Audits `LETTER_REVIEWED`. The officer can be **any active
user** (`getActiveOfficers()`), not a special role.

**Rejection — `rejectLetter(letterId, reason)`**
Allowed for HR **or** the assigned officer. Sets `REJECTED` with
`rejectedById`/`rejectedAt`/`rejectionReason`. There is no un-reject; a new letter
must be generated.

**Signing — `signLetter(letterId, signatureDataUrl)`** (`letters.ts:279`) — the
critical path:
1. Only the assigned officer, or an ADMIN, may sign. Status must be
   `PENDING_SIGNATURE`. The signature must be a `data:image` URL.
2. Look up the signer's name for the `approvingOfficerName` merge field.
3. **Regenerate the PDF from the template** with the officer's name merged in — the
   draft PDF didn't have it, since no officer was known at generation time.
4. `stampSignature()` draws the PNG onto the last page and stores the result as a new
   blob, releasing the
   file's bytes in place.
5. Delete the old draft file if the new one has a different ID.
6. Update the row: `SIGNED`, `signedAt`, the raw `signatureDataUrl` (kept for audit),
   and the new `blobId` — falling back to the old one if PDF generation failed.
7. Audit `LETTER_SIGNED`.
8. **If this is a CONFIRMATION letter whose `dueDate` has already passed, call
   `sendLetterToEmployee()` immediately** rather than waiting a day for the cron.

The whole PDF section is inside its own `try/catch`: if generation fails, the letter is
still recorded as signed. That is a deliberate trade — the workflow state matters more
than the artifact.

**Delivery — `sendLetterToEmployee(letterId)`**
Idempotent: returns success immediately if `sentAt` is set; refuses unless status is
`SIGNED`. Downloads the PDF as an attachment (best-effort), calls `deliverLetter()`
(Lark → email fallback), sets `SENT` + `sentAt`, clears `overdue`, audits
`LETTER_SENT` with the channel used. Called from two places: `signLetter` (when
already due) and the daily cron (when the due date arrives).

### The UI

`LetterWorkspace` (client) computes `isHr`, `isOfficer` and
`canSign = (isOfficer || ADMIN) && status === 'PENDING_SIGNATURE'`, and calls the
actions inside `startTransition`, toasting via `sonner` and calling `router.refresh()`
on success. Note the detail page uses
`requireRole(['ADMIN','HR','MANAGER','EMPLOYEE','CONTRACTOR'])` — effectively "any
logged-in user" — because **the approving officer may be an ordinary employee** who
needs to reach their own signing page. The real gate is inside the actions.

`SignaturePad` is a `<canvas>` capturing pointer events and exporting a PNG data URL.
It is also the component where a genuine React bug was fixed once — see §4.3.

## 2.5 Leave — entitlement engine

**File** `src/lib/leaveEntitlement.ts` (pure functions, no DB) and
`getOrCreateBalance()` in `src/actions/leaveBalance.ts`
**Models** `LeaveType`, `LeaveBalance`

### Leave types are data

`LeaveType` rows carry `name`, `defaultEntitlement`, `requiresAttachment`,
`allowsHalfDay`, `applicableToAll`. The seed (`prisma/seed.ts`) creates nine:

| Name | Default | Attachment | Half-day | In the request dropdown? |
|---|---|---|---|---|
| Annual Leave | 18 | no | yes | yes |
| Sick Leave | 14 | **yes** | yes | yes |
| Hospitalisation Leave | 60 | **yes** | no | yes |
| Childcare Leave | 6 | no | yes | **no** |
| Maternity Leave | 0 | no | no | **no** |
| Paternity Leave | 0 | no | no | **no** |
| Compassionate Leave | 3 | **yes** | no | yes |
| Military Leave (NS) | 25 | no | no | **no** |
| Unpaid Leave | 0 | no | yes | yes |

The last column is `applicableToAll`. The request form queries
`where: { applicableToAll: true }`, so the four "no" rows have balances that nobody can
currently spend through the UI.

**`defaultEntitlement === 0` is the "unlimited" sentinel.** Everywhere in the leave
code you'll see `const isUnlimited = leaveType.defaultEntitlement === 0` — those types
skip the balance check entirely and never move `pending` or `used`. Maternity and
Paternity are zero here but get real numbers from `getOrCreateBalance` (below), so in
practice "unlimited" means Unpaid Leave plus whichever of maternity/paternity doesn't
apply to that person.

### Balances are created lazily — `getOrCreateBalance(userId, leaveTypeId, year)`

There is no "provision balances for the new year" job. The row is created the first
time anyone asks for it, and the entitlement is computed **by leave type name**:

- **`Annual Leave`** →
  `calculateProRataEntitlement(calculateAnnualEntitlement(employmentType, startDate, year), startDate, year)`.
- **`Maternity Leave`** → `0` if `gender === 'Male'`, else SG **112** days, MY **98**
  (default 98 for anything else).
- **`Paternity Leave`** → `0` if `gender === 'Female'`, else SG **14**, MY **7**
  (default 0).
- Any other type with `defaultEntitlement > 0` → that value.
- Otherwise `0`.

The upsert uses `update: {}` — **an existing row is never overwritten**, which is what
preserves HR's manual overrides and adjustments across re-reads.

After upserting it calls `ensureCarryForwardExpiryApplied()`, which is how expiry is
enforced (below).

### The annual-leave formula

```
base           = EMPLOYEE 18 | CONTRACTOR 14 | PART_TIME 8
tenureYears    = floor(daysBetween(Jan 1 of year, startDate) / 365)
full           = base + max(0, tenureYears)          // uncapped
proRata        = joined this year
                   ? floor(full * min(monthsRemaining, 12) / 12 * 2) / 2   // → 0.5 steps
                   : full
```

`monthsRemaining = differenceInCalendarMonths(Dec 31, startDate) + 1`.

### The availability formula

```
available = effectiveEntitlement + activeCarry + adjustment - used - pending

effectiveEntitlement = entitlementOverride ?? entitlement
activeCarry          = now > carryForwardExpiresAt ? 0 : carryForward
```

Five columns feed it, and each is written by a different part of the system:

| Column | Written by |
|---|---|
| `entitlement` | `getOrCreateBalance` (on create), `runCarryForward` (new year) |
| `entitlementOverride` | HR via `setEntitlementOverride` |
| `carryForward` + `carryForwardExpiresAt` | `runCarryForward` |
| `adjustment` | HR via `adjustBalance` (a delta, `increment`) |
| `used` / `pending` | leave approval / submission flows |

### Carry-forward expiry — the subtle bit

The HR rule is: all unused days carry into the next year, and the carried days expire
on **31 March**. `carryForwardExpiryFor(year)` returns 31 March 23:59:59.999 local.

Naïvely zeroing `carryForward` after the deadline would over-charge anyone who had
already *spent* carried days, because `used` counts them. So
`applyCarryForwardExpiry()` normalises the row on first access after the deadline:

```
spentFromCarry = min(used, carryForward)
used           = used - spentFromCarry
carryForward   = 0
carryForwardExpiresAt = null
```

Days already taken out of the carried pool stop counting against the base entitlement,
and the simple `available` formula keeps working. It returns `null` (no write needed)
when there's no expiry date, no carry, or the deadline hasn't passed.

**This is lazy, not scheduled.** It runs inside `getOrCreateBalance` via
`ensureCarryForwardExpiryApplied`. If you query `LeaveBalance` in raw SQL on 1 April
before anyone has opened the app, you'll see stale values. That's expected.

## 2.6 Leave — request and approval flow

**Pages** `/leave` (own balances + history), `/leave/request`, `/leave/[id]`,
`/approvals` (manager queue)
**Actions** `src/actions/leave.ts`
**Components** `LeaveRequestForm`, `LeaveBalanceCards`, `LeaveHistoryTable`,
`ApprovalList`, `LeaveDetailActions`

Submission is walked through step by step in §1.1. Here is the rest.

### Working-day counting — `calculateWorkingDays()` (`src/lib/workingDays.ts`)

Builds a `Set` of holiday keys as `"UTCyear-UTCmonth-UTCdate"`, expands the range with
`eachDayOfInterval`, filters out weekends (`isWeekend`) and holiday matches, then:

```
count === 0            → 0
halfDay === 'NONE'     → count
count === 1            → 0.5          // half of a single working day
otherwise              → count - 0.5  // AM/PM on a multi-day range
```

**Holiday keys use UTC components deliberately.** Holidays are stored at UTC midnight;
comparing with local-timezone `startOfDay` on a server in UTC+8 would shift them a day.

### Balance movements — memorise this table

| Action | `pending` | `used` |
|---|---|---|
| `submitLeaveRequest` | **+days** | — |
| `approveLeave` | −days | **+days** |
| `rejectLeave` | −days | — |
| `cancelLeave` on a `PENDING` request | −days | — |
| `cancelLeave` on an `APPROVED` request | — | **−days** |
| `deleteLeave` on a `PENDING` request | −days | — |
| `deleteLeave` on an `APPROVED` request | — | **−days** |

Every one of these is inside a `$transaction` with the status update, and every one is
skipped for unlimited types. The year used for the balance lookup is always
`request.startDate.getFullYear()` — **a request spanning New Year is charged entirely
to the starting year.** Known simplification.

### Approve / reject — `approveLeave()` (`leave.ts:255`), `rejectLeave()` (`leave.ts:331`)

Authorised if you are the assigned `approverId`, or ADMIN, or HR. Status must be
`PENDING`. Approve sets `approvedAt` and overwrites `approverId` with whoever actually
acted (relevant when HR steps in for an absent manager). Audits `LEAVE_APPROVED` /
`LEAVE_REJECTED`.

Quirk worth knowing: **the approver's comment is stored in `rejectionReason` on both
paths** — an approval comment lands in a column named for rejections. Don't "fix" it
without checking what the UI reads.

### Cancel — `cancelLeave()` (`leave.ts:405`)

Allowed if it's **your own request and still `PENDING`**, or you are ADMIN/HR (who can
cancel an already-approved request, which is how an employee gets days back after a
plan changes). Already-cancelled is an error. Stamps `cancelledAt`, audits with
`details.previousStatus` — needed because the row's status is now CANCELLED and the
balance effect depended on what it was before.

### Delete — `deleteLeave()` (`leave.ts:490`), ADMIN/HR only

A hard delete that reverses the balance first and writes a rich audit snapshot
(employee name, type, dates, day count, previous status) because the row itself is
about to vanish.

### Reading

- `getLeaveRequests(userId?, status?)` — defaults to the caller's own requests.
- `getPendingApprovals()` — requests where `approverId = you` and status `PENDING`,
  oldest first. Powers `/approvals` and the dashboard card.
- `getAttachmentUrl(requestId)` — authorises owner / approver / ADMIN / HR, then
  returns `/api/files/<blobId>` plus the original filename, or `null`.
- `previewWorkingDays(...)` — the live preview; runs the same holiday and balance
  logic as submission so preview and reality agree.

`/approvals` short-circuits: if you have no direct reports and aren't ADMIN, it
renders an empty state without running the query.

## 2.7 Leave — HR admin tools

**Page** `/admin/leave` · **Actions** `src/actions/leaveBalance.ts`,
`src/actions/leaveImport.ts`
**Components** `BalanceAdjustForm`, `EntitlementOverrideForm`, `CarryForwardForm`,
`CsvImportForm`

All four require `['ADMIN','HR']`.

**`adjustBalance`** — applies a **delta** to `adjustment` (`increment: delta`), so
`+2` twice gives `+4`. Takes a free-text reason, stored in the audit `details`
alongside `targetUserId`. Use for one-off goodwill days or corrections.

**`setEntitlementOverride`** — sets `entitlementOverride` to an absolute value, or
clears it when the field is empty. Calls `getOrCreateBalance` first to guarantee the
row exists. This exists because the per-grade entitlement table was never finalised —
HR gives us a number per employee and the app honours it over its own calculation.

**`runCarryForward(year)`** — the year-end batch. `year` is the year being carried
*into*. For each previous-year **Annual Leave** balance:
```
prevEntitlement = entitlementOverride ?? entitlement
available       = prevEntitlement + carryForward + adjustment - used     // pending EXCLUDED
carryForwardDays = max(available, 0)                                     // no cap
```
then upserts the new year's row with the freshly recalculated entitlement (tenure has
advanced, so this is not the same number as last year), `carryForward = carryForwardDays`
and `carryForwardExpiresAt = 31 March of the new year`. Audits `BALANCE_ADJUSTED` per
employee with `action: 'carry-forward'` in the details.

Note it excludes `pending` — days awaiting approval at year-end are not carried. And
it's **not idempotent in an interesting way**: re-running it recomputes from the same
previous-year row, so it's safe to re-run, but if approvals happened in between the
number will change.

**`importLeaveCsv`** — bulk import of historical leave from an OmniHR export. Expected
header: `employee_email, leave_type, start_date, end_date, days, status,
approved_by_email, year`. Behaviour: header-driven column lookup (order doesn't
matter), each row processed independently with errors collected rather than aborting,
idempotent on `userId + leaveTypeId + startDate + endDate`, rows created as `APPROVED`,
and the matching year's `used` incremented. Returns `{ imported, skipped, errors[] }`.

It splits on `,` naively — **a comma inside a quoted field will corrupt that row.**
Fine for the known export format; check your file before importing something else.

## 2.8 Public holidays

**Page** `/holidays` · **Actions** `src/actions/holidays.ts` · **API** `/api/holidays`
**Component** `HolidayManager` · **Model** `PublicHoliday`

Unique on `(country, date)`. Fields: `name`, `year`, `isObserved`, `type`
(`PUBLIC_HOLIDAY` or `COLLECTIVE_LEAVE`). Create and update are ADMIN only and audited;
duplicates are rejected with a field error.

The seed ships **11 SG** and **16 MY** holidays for 2026, with a comment flagging that
the Islamic dates are provisional until the Cabinet Office gazettes them — verify
before a production deploy.

Three systems read this table, and all three break in different ways if it's wrong:

1. **Leave** — a missing holiday means the employee is charged a day they shouldn't be.
2. **Timesheets** — `saveTimeEntry` looks up `country_date` to set `isPublicHoliday`,
   which decides whether the hours pay at 1×/1.5× or 2×/3×. A missing holiday is a
   **payroll error**.
3. **Calendar** — holidays render alongside leave.

Only `isObserved: true` rows count for leave; the timesheet lookup doesn't filter on
`isObserved`.

## 2.9 Blackout windows

**Page** `/admin/blackouts` · **Actions** `src/actions/blackouts.ts`
**Component** `BlackoutManager` · **Model** `BlackoutWindow`

Retail peak periods when leave is restricted — CNY, Hari Raya, year-end. Fields:
`name`, `reason`, `country` (**`null` means all countries**; the form's `ALL` option
maps to null), `startDate`, `endDate` (both `@db.Date`, parsed as UTC midnight), and
`hardBlock`.

`findOverlappingBlackouts(country, start, end)` is the integration point:

```ts
where: {
  OR: [{ country }, { country: null }],
  AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
}
```

Standard interval-overlap. `submitLeaveRequest` filters the result for
`hardBlock: true` and rejects with the window names. **Soft windows (`hardBlock:
false`) are currently returned but not surfaced to the user** — the data is there for
a warning UI that hasn't been built.

CRUD is ADMIN only and audited (`BLACKOUT_CREATED` / `_UPDATED` / `_DELETED`).

## 2.10 Team calendar and Who's Out

**Page** `/team-calendar` · **API** `/api/calendar/leaves`
**Components** `TeamCalendar` (react-big-calendar), `WhosOut`

One endpoint, two modes:

- **`?scope=today|tomorrow`** — everyone whose approved leave spans that date
  (`startDate <= target && endDate >= target`). Returns name, country, leave type and
  half-day flag. Powers the dashboard widget.
- **`?year=&month=`** — a month of approved leave plus public holidays as calendar
  events.

Country colours are hardcoded in the route: SG `#EF4444` (red), MY `#3B82F6` (blue),
fallback grey. `TeamCalendar` sets up `dateFnsLocalizer` with **Monday** as the first
day of the week.

This endpoint shows every employee's leave to every logged-in user — deliberate ("who's
around this week"), but worth knowing before you add anything sensitive to the payload.

## 2.11 Part-time timesheet

**Pages** `/time` (weekly grid), `/time/approvals` (manager queue)
**Actions** `src/actions/timeEntry.ts` · **Model** `TimeEntry`
**Components** `WeeklyTimesheet`, `TimeEntryDialog`, `ApprovalQueue`, `TimeTabs`

**Only `PART_TIME` employees can log time.** `saveTimeEntry` and `submitWeek` both
check `employmentType` and refuse otherwise. The sidebar shows the section to
part-timers, admins and anyone with direct reports (so managers can reach approvals).

**One row per person per day**, enforced by `@@unique([userId, workDate])`. The weekly
grid therefore **upserts** on `userId_workDate` — editing Tuesday twice updates one
row instead of creating two.

### Entry rules — `saveTimeEntry()` (`timeEntry.ts:62`)

- `hoursWorked` between 0.25 and 24; `breakMinutes` 0–720.
- `workDate` parsed as `new Date("YYYY-MM-DDT00:00:00.000Z")` — **forced UTC midnight**
  to line up with the `@db.Date` column.
- **No more than `RETROACTIVE_DAYS = 14` in the past.**
- No future dates.
- `isPublicHoliday` is **auto-detected** by looking up `country_date` for the user's
  country. The employee never sets it — it changes their pay rate.
- Editing is allowed only while the entry is `DRAFT` or `REJECTED`; the upsert resets
  `rejectionReason`, `approverId`, `submittedAt` and `approvedAt` so a re-saved
  rejected entry starts clean.

### The state machine

```
DRAFT ──submitWeek()──► SUBMITTED ──approveEntry()/approveEntries()──► APPROVED
  ▲                          │                                            │
  │                          └──rejectEntry(reason)──► REJECTED           │
  │                                    │                                  │
  └────── employee edits and resubmits ┘        unlockEntry() (ADMIN) ────┘
```

- **`submitWeek(weekStartIso)`** — finds all `DRAFT` entries in that Mon–Sun window,
  flips them to `SUBMITTED`, stamps `submittedAt`, and sets
  `approverId = user.reportingManagerId ?? null`. Audits one row per entry. Errors if
  there are no drafts.
- **`approveEntry` / `approveEntries`** — the assigned approver or an ADMIN. Bulk
  approval silently filters the selection to entries that are `SUBMITTED` and
  approvable by you, and errors only if nothing qualifies.
- **`rejectEntry`** — requires a reason (Zod-enforced), sets `REJECTED` and clears
  `approvedAt`. The employee can then edit and resubmit.
- **`unlockEntry`** — ADMIN only, `APPROVED` → `DRAFT`, for corrections after
  approval. Audits `TIME_ENTRY_UNLOCKED`.
- **`deleteTimeEntry`** — own entry (or ADMIN), only while `DRAFT` or `REJECTED`.

`getMyWeek(weekStartIso?)` returns the week's entries, that week's public holidays and
the user's rate fields; `weekBounds()` from `src/lib/payroll.ts` computes the Mon–Sun
window in UTC.

**Only `APPROVED` entries reach payroll.** Everything else is invisible to the money.

## 2.12 Payroll computation

**Page** `/payroll` (ADMIN) · **Engine** `src/lib/payroll.ts`
**Action** `getMonthlyPayroll(year, monthIndex)` · **Export** `/api/payroll/export-monthly?month=YYYY-MM`

`computePayroll(entries, { normalDailyHours, hourlyRate })` splits approved hours per
the Malaysian Employment Act 1955 (2022 amendments):

| Bucket | Rule | Multiplier |
|---|---|---|
| Regular | up to `normalDailyHours` on a working day, **and** within 45 h for the week | 1.0× |
| Overtime | above the daily cap, **or** the portion of otherwise-regular hours that pushes the week past 45 | 1.5× |
| PH regular | up to `normalDailyHours` on a gazetted holiday | 2.0× |
| PH overtime | above the daily cap on a gazetted holiday | 3.0× |

The algorithm, per entry:

1. If `isPublicHoliday`: split into `min(hrs, dailyCap)` and the remainder, add to the
   PH buckets, and **`continue`** — PH hours never count toward the weekly cap.
2. Otherwise split into `dayRegular = min(hrs, dailyCap)` and `dayOt = hrs - dailyCap`.
3. Look up the running weekly regular total for this entry's ISO week
   (`isoWeekKey()`, UTC-based). `roomLeftInWeek = max(0, 45 - weekSoFar)`.
4. `dayRegularCappedToWeek = min(dayRegular, roomLeftInWeek)`; the difference is
   `weekOverflow`.
5. `regularHours += dayRegularCappedToWeek`; `overtimeHours += dayOt + weekOverflow`.
6. Update the weekly running total.

So the weekly cap is a **secondary** trigger applied after the daily rule, and entry
order within a week determines which specific hours are reclassified (the totals are
the same either way).

Defaults when the user record is incomplete: `normalDailyHours` falls back to **8**,
`hourlyRate` to **0** (hours still tabulate, pay comes out zero). Currency is derived
from country: `MY` → MYR, otherwise SGD.

`getMonthlyPayroll` fetches active part-timers, all their `APPROVED` entries in the
month (`monthBounds()`), groups by user in a `Map`, and runs the engine per person.
The export route does the same and emits a multi-sheet XLSX (summary + detail).

> **This route currently cannot run** — see §4.3 on the missing `xlsx` dependency.

## 2.13 Expenses (currently switched off)

**Status: the entire Expenses UI is disabled.** All four pages —
`/expenses`, `/expenses/new`, `/expenses/[id]`, `/expenses/approvals` — begin with

```ts
const HIDDEN: boolean = true
export default async function ExpensesPage(...) { if (HIDDEN) notFound() }
```

The comment in `src/app/(dashboard)/expenses/page.tsx` records why: *"Expenses module
hidden per HR/finance team decision (2026-06). The HIDDEN flag keeps the rest of the
file as live, type-checked code so we can re-enable the module by flipping it back to
`false` without re-debugging types."* There is also no Expenses link in the sidebar.

The **server actions, API routes and database tables are all still live** — nothing was
deleted. Flipping the four flags (and adding a sidebar entry) brings it back. Document
it here so nobody spends a morning wondering why `/expenses` 404s.

What it does when enabled:

**Models** `Expense`, `ExpenseReceipt`, `ExpenseApproval`
**Actions** `src/actions/expense.ts` (854 lines)

Claims carry a category (9 values), an amount in one of **13 currencies**, merchant,
receipt date, description and one or more receipts. Status flow:

```
DRAFT ──submit──► FOR_APPROVAL ──approve──► APPROVED ──reimburse──► REIMBURSED
                        └──reject──► REJECTED
```

- `handleExpenseAction` is an **intent dispatcher**: one form, `intent=draft|submit`,
  routing to `saveExpenseDraft` or `submitExpense`, so `ExpenseForm` needs only one
  `useActionState`.
- `saveExpenseDraft` diffs the receipt list on edit — removes rows whose key vanished,
  adds rows that are new — and refuses to touch anything that isn't `DRAFT`.
- `submitExpense` resolves the approver via `getExpenseApprover()`, sets
  `FOR_APPROVAL`, stamps `submittedAt`, and creates an `ExpenseApproval` row with
  `order: 1`.
- **Approver routing is a hardcoded two-person rule** (`src/lib/expenses.ts`):
  everyone routes to `EXPENSE_APPROVER_EMAIL` (default `jin@tictag.io`); that person's
  own claims route to `EXPENSE_FALLBACK_APPROVER_EMAIL` (default `kevin@tictag.io`).
  It does **not** use the reporting line. The `order` column exists so this can become
  a real multi-step chain without a migration.
- `approveExpense` / `rejectExpense` require the assigned approver or ADMIN and status
  `FOR_APPROVAL`; they update the expense and the pending `ExpenseApproval` row in one
  transaction, so `ApprovalTimeline` can render the history.
- **Receipts no longer move anywhere as status changes.** They used to be re-parented
  between Drive folders, which kept a second copy of the claim's status that could
  disagree with the database. Was:
  `Expenses/Pending Approval` → `Expenses/Approved/YYYY-MM` →
  `Expenses/Reimbursed/YYYY-MM`. Every `moveFile` is wrapped in a bare `try/catch` —
  a storage failure must never block an approval.
- `markReimbursed` (ADMIN) and `bulkReimburse(ids)` for payment runs.
- `deleteExpense` (ADMIN) releases the receipts' blob references after deleting
  approvals → receipts → expense in one transaction, with a full audit snapshot.
- Visibility: non-admins see only their own expenses (`getExpenses`) and only claims
  where they are the approver (`getApprovalExpenses`, `getPendingExpenseApprovals`).
- All read functions `.toString()` the `Decimal` amount before returning it.

## 2.14 Documents

**Page** `/documents` → `DocumentsClient` · **Actions** `src/actions/documents.ts`
**API** `/api/documents/upload-url` (upload), `/api/files/[fileId]` (download)
**Component** `DocumentUploaderModal` · **Model** `Document`

Two scopes and six categories:

- `COMPANY` — handbooks, policies. HR uploads, everyone reads.
- `EMPLOYEE` — `CONTRACTS`, `PAYSLIPS`, `MEDICAL`, `CERTIFICATIONS`, `PERSONAL_DOCS`,
  `OTHER`.

### Upload — two-step

1. **`POST /api/documents/upload-url`** with multipart form data. Validates the MIME
   type against an allowlist (PDF, JPEG/PNG/WebP, Word, Excel,
   `application/octet-stream`) and the category, checks permissions, stores the bytes
   via `putChecked()`, and returns the blob id. Despite the route name it does
   **not** return a presigned URL — it performs the upload.
2. **`uploadDocument({...})`** (server action) creates the `Document` row(s).

### Mass push — the clever part

For `scope: 'EMPLOYEE'` with several `employeeIds`, the file is stored **once** under
`Documents/Shared/<Category>` (`getSharedDocumentFolderPath`) and **N `Document` rows**
are created, all sharing the same `s3Key`. Each employee sees it in their own list;
storage doesn't multiply. Payslip distribution is the driving use case.

`deleteDocument` is therefore **refcount-aware**: it counts other rows with the same
`blobId`, deletes the row, and calls `storage.release()` — the bytes go only when the
last reference does.
The audit details record `sharedRowsRemaining`.

### Visibility rules — `getDocuments()`

- HR/ADMIN: everything, filterable by scope, employee, category, free-text search on
  name/filename, sortable.
- Non-HR with no scope filter: `OR: [{ scope: 'COMPANY' }, { scope: 'EMPLOYEE', employeeId: self }]`.
- Non-HR asking for someone else's employee documents: returns `[]`.
- `canDelete` per row = HR, or you uploaded it.

`getMyDocuments()` is the employee view (company docs + own docs).
`getEmployeeFolderSummary()` powers the HR left panel using a `groupBy` with
`_count._all` and `_max.updatedAt`.

Non-HR users may only upload to themselves; `scope: 'COMPANY'` requires HR.

## 2.15 Performance reviews

**Pages** `/performance` (role router), `/performance/me`, `/performance/team`,
`/performance/cycles`, `/performance/cycles/new`, `/performance/cycles/[id]`,
`/performance/[id]`
**Actions** `src/actions/performance.ts` (742 lines)
**Models** `ReviewCycle`, `PerformanceReview`, `Goal`
**Components** `ReviewCycleForm`, `ScopeAssignmentForm`, `CycleTransitionControls`,
`GoalEditor`, `GoalEvaluator`, `ReviewSubmitForm`, `AcknowledgeForm`, `PerformanceTabs`

`/performance` is a pure redirect: ADMIN → `/performance/cycles`, MANAGER →
`/performance/team`, everyone else → `/performance/me`.

### A cycle is a configurable template

Three `templateType` values with different defaults:

| | FULL | LITE | PROBATION |
|---|---|---|---|
| Default rating scale | 5 | 3 | 0 (no rating) |
| Default min/max goals | 3 / 7 | 0 / 0 | 3 / 7 |
| Outcome | rating + narrative | rating + narrative | `ProbationDecision` |

Per-cycle knobs stored on `ReviewCycle`: `ratingScale` (2–10) and `ratingLabels` (a
JSON array, defaulting to `["Below","Approaching","Meets","Exceeds","Outstanding"]`),
`minGoals`/`maxGoals`, `goalWeightsEnabled`, `employeeSelfAssessment`,
`employeeCanComment`, `requireManagerNarrative`, plus two retail extras —
`includeSalesTarget` (with `targetCurrency`) and `includeAttendanceMetric`. Dates:
`startDate`, `endDate`, `goalSettingDeadline`, `evaluationOpensAt`,
`evaluationDeadline` (deadlines are **informational** — nothing enforces them).

`defaultLabelsForScale()` fills labels when none are supplied. Booleans arrive from
`FormData` as strings, hence `boolFromForm()` accepting `'true' | 'on' | '1'`.

### Cycle lifecycle — `transitionCycle(cycleId, to)`, ADMIN

```
DRAFT ──► ACTIVE ──► EVALUATION ──► CLOSED
              └──────────────────────►┘        (CLOSED is reachable from ACTIVE too)
```

Allowed-from map: `ACTIVE: ['DRAFT']`, `EVALUATION: ['ACTIVE']`,
`CLOSED: ['EVALUATION','ACTIVE']`. Audits `REVIEW_CYCLE_OPENED` /
`_EVALUATION_OPENED` / `_CLOSED`.

### Scoping — `scopeReviews(cycleId, filters)`, ADMIN

Only on a `DRAFT` or `ACTIVE` cycle. Either an explicit `employeeIds` list (takes
precedence) or filters on `employmentType` / `country` / `department`, always
restricted to `status: 'ACTIVE'`.

Two design decisions matter:

1. **The manager is snapshotted.** `managerId` is copied from
   `user.reportingManagerId` at scope time and never re-read. A reorg mid-cycle does
   not reassign in-flight reviews.
2. **Employees with no manager get themselves** (`managerId = u.id`) so they still
   appear in the cycle and an admin can reassign.

It skips employees already scoped, so re-running adds only the newcomers.
`listScopeCandidates()` returns active users not yet in the cycle, for the picker.

### Review lifecycle

```
NOT_STARTED ──goals reach minGoals──► GOALS_SET ──first goal evaluated──► IN_EVALUATION
     │                                                                          │
     │                                                            submitReview()│
     │                                                                          ▼
     │                                                        PENDING_ACKNOWLEDGEMENT
     │                                                                          │
     │                                                     acknowledgeReview()  │
     │                                                                          ▼
     └────────────────── reopenReview() (ADMIN) ◄────────────────────────  ACKNOWLEDGED
```

Note the promotions are **implicit side effects**, not separate buttons:

- `upsertGoal` — manager only, **cycle must be `ACTIVE`**. Enforces `maxGoals` on
  create. After saving, if the review is `NOT_STARTED` and the goal count has reached
  `minGoals`, it flips to `GOALS_SET` and audits `REVIEW_GOALS_SET`.
- `deleteGoal` — same authorisation and cycle-state rule. Does **not** demote the
  status back to `NOT_STARTED` if you drop below `minGoals`.
- `evaluateGoal` — manager only, **cycle must be `EVALUATION`**. Records `outcome`
  (`MISSED | PARTIAL | MET | EXCEEDED`), `actualValue`, `managerComment`. If the review
  was `GOALS_SET`, flips it to `IN_EVALUATION`.

### Submitting — `submitReview()` (`performance.ts:451`)

Manager or ADMIN, cycle must be `EVALUATION`. Validation, in order:

1. Non-probation cycles: `overallRating` required and within `1..ratingScale`.
2. Probation cycles: `probationDecision` required.
3. `requireManagerNarrative` → narrative must be non-empty.
4. Non-probation: **every goal must have an outcome other than `NOT_EVALUATED`** —
   the error names how many are outstanding.

Then it writes the rating, narrative, the retail extras
(`salesActualAmount`, `attendanceDaysWorked/Scheduled`, `promotionReady`), the
probation decision, `submittedForEvaluationAt`, and sets
`PENDING_ACKNOWLEDGEMENT`. It audits `REVIEW_SUBMITTED` **and**, for probation cycles,
a second audit row of `PROBATION_CONFIRMED` / `PROBATION_EXTENDED` /
`PROBATION_NOT_CONFIRMED`.

**Important integration gap:** a probation decision of `CONFIRMED` writes an audit row
but **does not set `User.confirmationDate`**. HR still has to enter that on the profile
to start the confirmation-letter flow (§2.4). If you want them linked, this is where
you'd do it.

### Acknowledging and reopening

`acknowledgeReview` — **only the reviewed employee** (not their manager, not an
admin), status must be `PENDING_ACKNOWLEDGEMENT`. Stores the comment in
`employeeAcknowledgement`, stamps `acknowledgedAt`, sets `ACKNOWLEDGED`.

`reopenReview` — ADMIN only, `ACKNOWLEDGED` → `IN_EVALUATION`, clears
`acknowledgedAt`. The escape hatch for a review submitted with the wrong numbers.

### Reading

`getMyReviews`, `getTeamReviews` (`managerId = you`), `getCycleReviews` (ADMIN),
`getReviewDetail` — which authorises employee / manager / admin and returns a
`viewer: { isEmployee, isManager, isAdmin }` object so the client component can decide
which panels to show. `getReviewDetail` **throws** on an unauthorised viewer rather
than returning null — one of the few places that does.

Export: `/api/performance/cycles/[id]/export` (XLSX).

## 2.16 Rewards and bonuses

**Pages** `/rewards/cycles`, `/rewards/cycles/new`, `/rewards/cycles/[id]`
**Actions** `src/actions/rewards.ts` · **Models** `RewardCycle`, `RewardAllocation`
**Components** `RewardCycleForm`, `AllocationManager`, `CycleTransitionControls`
**Everything here is ADMIN-only.**

A `RewardCycle` is a bonus pool: `name`, `description`, optional `totalPoolAmount`,
`currency` (default **MYR**), `payoutDate`, and an optional `reviewCycleId` linking it
to a performance cycle.

A `RewardAllocation` is one payment: unique on
`(cycleId, employeeId, bonusType)` where `bonusType` is `PERFORMANCE`,
`CONTRACTUAL_13TH` or `AD_HOC`. It stores `amount`, a **currency snapshot copied from
the cycle at creation time**, `rationale`, optional `linkedReviewId`, `proposedById`,
and its own status.

### Lifecycle — and the cascade

```
Cycle:       DRAFT ──► APPROVED ──► PAID ──► CLOSED
Allocations: DRAFT ──► APPROVED ──► PAID
                  └──► CANCELLED (any time before PAID)
```

`transitionRewardCycle` runs inside a `$transaction` and **cascades to the
allocations**:

- → `APPROVED`: every `DRAFT` allocation becomes `APPROVED` with
  `approverId = you` and `approvedAt = now`.
- → `PAID`: every `APPROVED` allocation becomes `PAID` with `paidAt = now`.
- → `CLOSED`: cycle only; allowed from `PAID`, `APPROVED` or `DRAFT`.

`upsertAllocation` refuses unless the cycle is `DRAFT` and the allocation (if editing)
is `DRAFT`. It catches Prisma error **`P2002`** (unique violation) and turns it into
*"This employee already has an allocation of that bonus type in this cycle."*

`cancelAllocation` works on anything not yet `PAID`.

`listCandidatesForCycle(cycleId)` returns active users, each annotated with their
review from the cycle's linked `ReviewCycle` (id and `overallRating`), so the "add
allocation" picker can show performance context next to each name. That's the only
real coupling between rewards and performance — the link is informational, nothing
computes a bonus from a rating.

Export: `/api/rewards/cycles/[id]/export` (XLSX).

## 2.17 Learning Hub (LMS)

**Page** `/learning` — its own route group `(learning)` with a bare layout (no HRMS
sidebar), because the LMS ships its own chrome.
**Bundle** `src/components/learning/LearningApp.jsx` — **~3,300 lines, one file**
**Actions** `src/actions/learning.ts` · **API** `/api/learning/materials`, `/api/learning/materials/[key]`
**Admin page** `/admin/learning` → `LearningContentManager`
**Content** `public/materials/{en,ch,ms}/`
**Models** `LearningLessonProgress`, `LearningTestProgress`, `LearningSurvey`,
`LearningMaterial`, `LearningModuleLesson`

### Why it's one file

It's a mechanical port of a standalone Vite SPA. The original module boundaries survive
as comment markers — `// ===== i18n.jsx =====`, `icons`, `materials`, `data`, `quiz`,
`slides`, `lessonPlayer`, `dashboard`, `testflow`, `chrome`, `app`. **Treat those as
file boundaries**: edit within a section, and don't move code across them casually,
because everything relies on globals defined earlier in the file (`MAT`, `COURSES`,
`TESTS`, `Icon`, `useTr`).

### The course

Six tiles: Lesson 1 → Test 1 → Lesson 2 → Test 2 → Lesson 3 → Test 3.

| Lesson | Topic | Unlock week | Materials stem |
|---|---|---|---|
| 1 | New Employee Training — brand, service standards, first week | 4 | `1.pptx/1.pdf/1.csv` |
| 2 | Fitting & Storeroom — fitting-room service, stock, replenishment | 6 | `2.*` |
| 3 | Cashier's Responsibility — POS/SWAIN, payments, refunds, cash-up | 8 | `3.*` |

Each lesson has three parts, consumed in order: **slides → PDF → video**. Everything
exists in three languages: English, 中文 (folder `ch`, UI code `zh`) and Bahasa
Malaysia (`ms`).

### Gating — `D = useMemo(...)` in the `app.jsx` section

```js
lessonUnlockDate(n) = enrolledAt + (LESSONS[n-1].week - 1) * 7 days
prevUnitDone(n)     = n === 1 || (lessonComplete(n-1) && testPassed(n-1))
lessonUnlocked(n)   = today >= lessonUnlockDate(n) && prevUnitDone(n)
testUnlocked(n)     = lessonComplete(n)
```

`enrolledAt` comes from the server as `User.startDate` (falling back to
`User.createdAt`) in milliseconds — this is the direct dependency between the HR record
and the course. `today` respects `state.simDate` if set, which is how you demo the
gating without waiting eight weeks.

Locked tiles explain themselves: either *"Pass Test N−1 first"* or *"Opens 05 Sep"*.

### Tests

Constants in the `data.jsx` section: `PASS_MARK = 0.75`, `TEST_TOTAL = 40`,
`TEST_BANK_SIZE = 60`, `TEST_DURATION_SEC = 1800`, `MAX_TEST_ATTEMPTS = 3`.

Each attempt calls `MAT.sampleQuestions(bank, 40)` — a Fisher–Yates shuffle of the
60-question bank, sliced to 40. Question **and option order** are randomised
(`buildMCQ` permutes the columns and recomputes which index is correct; CSV column `a`
is always the correct answer in the source file).

The quiz is a timed exam: one question at a time, prev/next navigation, a countdown,
a single submit, auto-submit at zero, and **no per-question answer reveal**.

Reducer outcomes:
- `passTest` — attempts +1, `passed: true`, `bestScore = max(prev, score)`, `locked:
  false`, `completedAt` preserved if already set.
- `failTest` — attempts +1, `locked = attempts >= 3`, best score updated. On lockout it
  pushes an alert notification and an `hrEvents` entry reading *"locked, HR
  escalation"*.
- `resetTestAttempts` — clears attempts and the lock (admin console).

### Certificate and module lessons

The certificate needs **all three tests passed AND the survey submitted**. The survey
(`SurveyScreen`) collects three 1–5 star ratings — clarity, pace, usefulness — plus a
comment, and is stored one row per learner (`LearningSurvey`, `userId` unique).

The same condition unlocks the **Module lessons** tab.

### Persistence — the HRMS is the source of truth

The original SPA used `localStorage`. That was replaced:

**On load** — `/learning/page.tsx` calls `getLearningSeed()` server-side, which reads
the user, their `LearningLessonProgress`, `LearningTestProgress` and `LearningSurvey`
rows, and returns a `LearningSeed` containing `userName`, `role` (`'admin'` if
`User.role === 'ADMIN'`), `enrolledAt` in ms, and the progress/tests/survey maps.
`makeInitial(seed)` builds the reducer's initial state from it. Any progress key that
isn't `lesson1..3` is treated as module-lesson progress.

**On change** — a `useEffect` watching `state.progress`, `state.tests` and
`state.survey` debounces **600 ms** and calls the `saveLearningProgress` server action
with a snapshot. A `didMount` ref skips the very first render so the seeded state
doesn't immediately echo back to the server.

**On save** — `saveLearningProgress()` (`learning.ts:131`):
1. Zod-validates the snapshot (scores clamped 0–1, ratings 0–5).
2. Loads existing lesson rows, all module lessons, and all material keys.
3. Builds `modulePartsById` — for each module lesson, which of `slides|pdf|video`
   actually exist, derived from `LearningMaterial` keys.
4. For each lesson: `allDone` is "all three parts" for onboarding lessons, but **"all
   the parts this module actually has"** for module lessons. `completedAt` is
   preserved if already set, so re-syncing doesn't keep moving the timestamp forward.
5. Upserts each lesson, each test and (if done) the survey.

`saveLearningProgress` uses `getSession()` directly rather than `verifySession()` — it
returns `{ ok: false }` instead of redirecting, because a redirect in the middle of a
background sync would be useless.

### Content: bundled defaults vs. admin overrides

**Defaults** are static files under `public/materials/<lang>/`: `N.pptx`, `N.pdf`,
`N.csv` (60-question bank, header `question,a,b,c,d`, column `a` correct), and one
`videos.csv` per language mapping lesson number → YouTube URL.

**Overrides** are `LearningMaterial` rows keyed `"<kind>:<ref>"` where kind is
`pptx | pdf | video | csv` and ref is a lesson number `1-3` **or** a module-lesson
UUID. Two regexes in the API route enforce that shape. `pptx`/`pdf` bytes are stored
in a Postgres `Bytes` column (20 MB cap); `video` URLs and `csv` text go in a `text`
column.

**Reading them** — `GET /api/learning/materials` (any session) returns
`{ overrides, modules }`. `IORA_OVERRIDES.refresh()` in the bundle caches it, converting
root-relative serving paths to absolute URLs (the Office Online and PDF viewers need
absolute). `hydrateMaterials()` then builds `COURSES`, `TESTS` and `MODULES`, preferring
an override over the bundled file. **An override is language-agnostic — one uploaded
file replaces all three languages.**

**Writing them** — `POST /api/learning/materials` (ADMIN): validates the key, checks
the module lesson exists for module keys, enforces the 20 MB limit, upserts, audits.
`DELETE ?key=…` removes the row, reverting to the bundled default.

**`GET /api/learning/materials/[key]` is deliberately unauthenticated.** Slide decks
render through the Microsoft Office Online viewer, which fetches the URL from
Microsoft's servers and cannot carry our session cookie. Its exposure matches the
bundled defaults already served from `public/`. **Do not put anything confidential
behind this route.**

### Module lessons

Admin-created extra lessons (`LearningModuleLesson`: title, summary, position) shown in
a second dashboard tab after certification. They have **no test**. Their content is
`LearningMaterial` rows keyed by the module's UUID, and learner progress reuses
`LearningLessonProgress` with `lessonId` = that UUID. `deleteModuleLesson` cleans up all
three in a transaction: materials (`pptx:`/`pdf:`/`video:` + id), progress rows, then
the lesson.

### Admin views

- **In-app admin console** (inside the LMS, visible when the seed says `role: 'admin'`)
  — upload or revert each lesson's four material kinds via `IORA_OVERRIDES.upload/remove`.
- **`/admin/learning`** — `LearningContentManager` (material overrides + module lessons)
  and `getAllLearningProgress()`, which returns a per-employee matrix: each lesson's
  three parts, each test's attempts/passed/bestScore/locked, an
  `overallPct = round((lessonsDone + testsPassed) / 6 * 100)`, and
  `certified = testsPassed === 3`.

Note `getAllLearningProgress` defines "certified" as three tests passed and **ignores
the survey**, while the LMS certificate screen requires the survey too. The admin table
can therefore show someone as certified before they can print their certificate.

## 2.18 Dashboard

**Page** `/dashboard` · **Action** `getDashboardData(userId, role)`
**Components** `ApprovalCountCard`, `BirthdayWidget`, `WhosOut`, `LeaveBalanceCards`,
`CountryHolidays`

One `Promise.all` fetching: the user's name/country, a count of leave requests where
`approverId = you && status = 'PENDING'`, a count of `FOR_APPROVAL` expenses
(**ADMIN only** — everyone else gets 0, and the expenses module is off anyway), and
every active user with a `dateOfBirth`.

Birthdays are filtered to the current month **in JavaScript, after fetching every
active user with a birthday** — fine at this headcount, the first thing to fix if the
company grows.

The page also renders the user's leave balances via `getLeaveBalances()` (which is
what lazily creates the year's balance rows for a new employee the first time they log
in) and greets them by time of day using the **server's** clock.

## 2.19 The daily cron

**Route** `/api/cron/daily` · **Logic** `src/lib/reminders.ts`
**Schedule** `vercel.json` → `0 1 * * *` (01:00 UTC = 09:00 Singapore)

Authorisation (`authorized()`): `Authorization: Bearer <CRON_SECRET>` — which Vercel
Cron sends automatically — or `?secret=<CRON_SECRET>` for manual runs. **If
`CRON_SECRET` is unset the route is open**, deliberately, for local development.
`maxDuration = 60`, `dynamic = 'force-dynamic'`.

`runDailyReminders()` performs five sweeps in order and returns a count of each:

**1. Probation ending.** Active users with `confirmationDate: null` and a
`probationEndDate` **exactly 14 days away** (`daysUntil(...) === PROBATION_REMINDER_DAYS`)
→ email the first HR address, cc the rest. Prompts HR to enter a confirmation date,
which starts the confirmation-letter flow.

**2. Signature nudges.** `CONFIRMATION` letters in `PENDING_SIGNATURE` with an
assigned officer, where `lastReminderAt` is null or **≥ 2 days** ago → email the
officer, update `lastReminderAt`, audit `LETTER_REMINDER_SENT`. This one uses `>=`, so
it self-heals after a missed day.

**3. Delivery.** `CONFIRMATION` letters that are `SIGNED`, not yet `sentAt`, with
`dueDate <= today` → `sendLetterToEmployee()`.

**4. Overdue.** `CONFIRMATION` letters still in `PENDING_REVIEW` or
`PENDING_SIGNATURE` with `dueDate < today` → set `overdue: true` (once) and email HR
**every day** until resolved.

**5. Work passes.** `getWorkPassesForReminder()` → email HR per pass.

Sweeps 1 and 5 use **exact-day equality**, so a day the cron doesn't run is a
notification nobody receives. Sweeps 2, 3 and 4 use range comparisons and recover
automatically. Keep that distinction in mind if you add a sweep.

Every send goes through `sendHrReminder()`, which swallows failures — one bad address
can't abort the run.

---

# Part 3 — How the systems connect

## 3.1 The trigger map

Read this as "when the left thing happens, the right things happen automatically".

| Trigger | Consequence | Code path |
|---|---|---|
| Employee created | `JOINED` career event | `users.ts:createUser` → `db.careerEvent.create` |
| Employee created | Employment letter drafted into the HR queue | `createUser` → `letters.ts:generateEmploymentLetter` |
| Employee created | `probationEndDate` computed | `computeProbationEnd(startDate, probationMonths)` |
| Employee created | LMS unlock clock starts | `User.startDate` → `getLearningSeed().enrolledAt` |
| `position`/`department` edited | Career event appended | `users.ts:updateUser` diff |
| Status → TERMINATED | Full offboarding: reports + approvals reassigned, leave prorated, session ended | `offboarding.ts:offboardEmployee` |
| Status → TERMINATED | `terminatedAt` stamped + `TERMINATED` career event | `updateUser` |
| HR sets `confirmationDate` | `CONFIRMED` career event (replacing any previous one) | `users.ts:setConfirmationDate` |
| HR sets `confirmationDate` | Confirmation letter created/re-dated, `overdue` cleared | `setConfirmationDate` → `letters.ts:generateConfirmationLetter` |
| Officer signs a due confirmation letter | Sent to the employee immediately | `letters.ts:signLetter` → `sendLetterToEmployee` |
| Probation ends in 14 days | HR email | cron sweep 1 |
| Letter unsigned for 2 days | Officer nudge | cron sweep 2 |
| Confirmation letter due today | Delivery | cron sweep 3 |
| Work pass hits its lead-day threshold | HR email | cron sweep 5 → `workPass.ts:getWorkPassesForReminder` |
| Leave submitted | `LeaveBalance.pending` reserved | `leave.ts:submitLeaveRequest` transaction |
| Leave approved | `pending → used` | `leave.ts:approveLeave` transaction |
| Leave submitted with an attachment | File in `Documents/<name>/Leave Attachments` | `submitLeaveRequest` → `uploadFile` |
| Leave approved | Appears on the team calendar and Who's Out | `/api/calendar/leaves` queries `status: 'APPROVED'` |
| Public holiday added | Leave day counts change; timesheet PH detection changes | `workingDays.ts`, `timeEntry.ts:saveTimeEntry` |
| Blackout window created (hard) | Overlapping leave requests rejected | `blackouts.ts:findOverlappingBlackouts` |
| Time entry saved on a holiday | `isPublicHoliday: true` → 2×/3× pay | `saveTimeEntry` → `payroll.ts:computePayroll` |
| Time entry approved | Enters payroll and the XLSX export | `getMonthlyPayroll`, `/api/payroll/export-monthly` |
| Goals reach `minGoals` | Review `NOT_STARTED → GOALS_SET` | `performance.ts:upsertGoal` |
| First goal evaluated | Review `GOALS_SET → IN_EVALUATION` | `performance.ts:evaluateGoal` |
| Reward cycle → APPROVED | All DRAFT allocations approved + stamped | `rewards.ts:transitionRewardCycle` transaction |
| Reward cycle → PAID | All APPROVED allocations marked paid | same |
| LMS part completed | Debounced sync → `LearningLessonProgress` | `LearningApp.jsx` effect → `saveLearningProgress` |
| 3rd failed test attempt | `locked: true`, visible to admin as an escalation | reducer `failTest` → synced to `LearningTestProgress` |
| Admin uploads lesson material | Every learner sees it after `hydrateMaterials()` | `/api/learning/materials` POST |
| Document mass-pushed | One `FileBlob`, N `Document` rows, refCount = N | `documents.ts:uploadDocument` |
| Last reference to a blob released | Blob bytes deleted | `storage.release()` |
| Any of the above | An `AuditLog` row | `lib/audit.ts:createAuditLog` |

## 3.2 Walkthrough: a new hire, day 0 to month 3

**Day 0 — HR creates the record.** `/people/new` → `createUser()`. The row is written
with `mustChangePassword: true` and the temp password `changeme123`. Three things
happen behind the scenes: a `JOINED` career event, `probationEndDate = startDate + 3
months`, and an employment letter drafted into `/admin/letters` with status
`PENDING_REVIEW` (its PDF generated from the Google Doc template and dropped into
`Employees/<Name>/Letters`).

**Day 0 — HR processes the letter.** `/admin/letters/<id>` → HR picks an approving
officer and clicks approve (`approveLetterForSignature`) → status `PENDING_SIGNATURE`.
The officer opens the same page, draws a signature, and `signLetter()` regenerates the
PDF with their name merged in, stamps the signature onto the last page, and replaces
the stored file in place.

**Day 1 — First login.** The proxy sees `mustChangePassword` and forces
`/change-password`. After the change the session is recreated with the flag cleared and
they land on `/dashboard`. Rendering the dashboard calls `getLeaveBalances()`, which
**lazily creates their `LeaveBalance` rows for the year** — annual leave pro-rated from
their start date, maternity/paternity resolved from country and gender.

**Week 1 — Leave.** They can submit immediately, provided `reportingManagerId` is set.
Their manager sees it at `/approvals`.

**Week 4 — Lesson 1 unlocks.** `/learning` computes
`enrolledAt + (4-1)*7 days <= today`. They work through slides → PDF → video; each
completion debounces a sync into `LearningLessonProgress`. Test 1 unlocks when all
three parts are done: 40 questions from a 60-bank, 30 minutes, 75% to pass, 3 attempts
before lockout.

**Weeks 6 and 8** — Lessons 2 and 3, each also requiring the previous unit to be
complete. After Test 3 and the survey, the certificate unlocks and the Module lessons
tab appears.

**Week 10 (probation end − 14 days)** — the cron emails HR: *"Probation ending soon"*.

**Month 3** — see the next walkthrough.

Throughout, `/admin/learning` shows their progress matrix, `/people/<id>` shows their
profile and (to them) their Journey, and every action above has left an `AuditLog` row.

## 3.3 Walkthrough: probation to confirmation

1. **Cron sweep 1** fires exactly 14 days before `probationEndDate` (only if
   `confirmationDate` is still null) and emails HR.
2. **HR sets the confirmation date** on `/people/<id>` → `setConfirmationDate()`:
   - writes `User.confirmationDate`, audits `CONFIRMATION_DATE_SET`;
   - deletes any existing `CONFIRMED` career event and writes a fresh one dated to the
     confirmation date;
   - calls `generateConfirmationLetter(userId, date)`.
3. **The letter is created** with `type: 'CONFIRMATION'`, `status: 'PENDING_REVIEW'`,
   `dueDate = confirmationDate`, and a PDF merged from the confirmation template.
   (If a letter already existed, only the due date is synced and `overdue` cleared.)
4. **HR reviews** and assigns an approving officer → `PENDING_SIGNATURE`.
5. **Cron sweep 2** nudges the officer every 2 days until they sign.
6. **The officer signs.** If the due date has already passed, `signLetter` delivers
   immediately. Otherwise the letter waits at `SIGNED`.
7. **Cron sweep 3** delivers it on the due date: PDF attached, via Lark if configured
   else email, status → `SENT`, audit `LETTER_SENT` recording the channel.
8. **If it was never signed in time**, cron sweep 4 flags `overdue: true` and emails HR
   daily until it moves.

Optional parallel track: a `PROBATION`-template review cycle can record a formal
`probationDecision` of `CONFIRMED`/`EXTENDED`/`NOT_CONFIRMED`. **That decision does not
write `confirmationDate`** — step 2 is still manual.

## 3.4 Walkthrough: month-end payroll

1. Through the month, part-timers log hours on `/time`. Each save upserts one
   `TimeEntry` per day, auto-flagging public holidays from their country's calendar.
2. Each week they click submit → all that week's `DRAFT` rows become `SUBMITTED` and
   are routed to their reporting manager.
3. The manager approves at `/time/approvals`, singly or in bulk. Rejected entries go
   back to the employee with a reason and can be edited and resubmitted.
4. At month end an admin opens `/payroll` → `getMonthlyPayroll(year, monthIndex)`
   fetches every **APPROVED** entry in `monthBounds()`, groups by user, and runs
   `computePayroll` with that person's `normalDailyHours` (default 8) and `hourlyRate`
   (default 0).
5. The engine produces four hour buckets and four pay figures per person, plus totals.
   Currency comes from country (MY → MYR, else SGD).
6. `/api/payroll/export-monthly?month=YYYY-MM` renders the same data as a multi-sheet
   XLSX for finance. **Blocked today by the missing `xlsx` package (§4.3).**
7. If something was approved in error, an admin uses `unlockEntry()` to push it back to
   `DRAFT`, the employee fixes it, and it re-flows through approval.

## 3.5 What breaks what

The dependencies that aren't obvious from the folder structure:

- **`User.startDate`** feeds leave entitlement, probation dates, letter merge fields
  **and LMS lesson unlocks**. Editing it silently re-gates someone's course.
- **`User.reportingManagerId`** is the approval routing for both leave and timesheets.
  Clearing it makes the employee unable to submit leave at all ("no reporting manager
  assigned"). It also feeds the org chart and is snapshotted into performance reviews.
- **`User.country`** drives holiday lookups, blackout scope, leave day counts,
  timesheet holiday detection, payroll currency and calendar colour. Changing it
  changes historical calculations that re-run on read.
- **`User.gender`** silently changes maternity/paternity entitlement in
  `getOrCreateBalance` — but only for balance rows that don't exist yet, because the
  upsert never overwrites.
- **`PublicHoliday`** rows affect leave day counts and payroll multipliers. A wrong
  date is a money bug, not a cosmetic one.
- **`LeaveType.defaultEntitlement === 0`** means "unlimited" throughout the leave code.
  Setting an existing type's default to 0 disables its balance checks everywhere.
- **`AuditLog.details.targetUserId`** is queried by JSON path in `getLeaveAuditLogs`.
  Renaming that key silently empties the profile's audit tab.
- **`Document.s3Key` sharing** is what makes mass-push work and what makes deletion
  refcounted. Never assume one row equals one file.
- **The Prisma client is committed** in `src/generated/prisma`. A schema change without
  a regenerate-and-restart produces confusing errors.

---

# Part 4 — Working on this codebase

## 4.1 How to add a field to an employee

Worked example: adding `bankAccountLast4`.

1. `prisma/schema.prisma` — add the column to `model User`.
2. `npx prisma migrate dev --name add_bank_account_last4` — writes the migration and
   regenerates the client.
3. **Restart the dev server.**
4. `src/actions/users.ts` — add it to `CreateUserSchema` and `UpdateUserSchema`, to the
   `raw` objects in `createUser`/`updateUser`, and to the `db.user.create` /
   `db.user.update` data.
5. `src/components/people/AddEmployeeForm.tsx` and `EditEmployeeForm.tsx` — add the
   input.
6. `src/app/(dashboard)/people/[id]/page.tsx` — if it's a `Date` or `Decimal`, add it
   to the serialization block.
7. `src/components/people/EmployeeProfile.tsx` — display it.
8. If letters should merge it: add a key in `buildReplacements()`
   (`src/actions/letters.ts`) **and** a `{{placeholder}}` in the Google Doc template.
9. If it should be audited on change, add it to the `before`/`after` details in
   `updateUser`.

## 4.2 How to add a new server action

Follow the house pattern exactly — consistency is what makes this codebase navigable.

```ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { verifySession, requireRole } from '@/lib/dal'
import { createAuditLog } from '@/lib/audit'

export type ThingActionState = { success?: boolean; error?: string; errors?: Record<string, string[]> }

const schema = z.object({ /* ... */ })

export async function doThing(
  _state: ThingActionState,
  formData: FormData,
): Promise<ThingActionState> {
  try {
    const session = await requireRole(['ADMIN'])            // 1. authorise

    const raw = Object.fromEntries(formData.entries())
    const parsed = schema.safeParse(raw)                     // 2. validate
    if (!parsed.success) {
      return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    const current = await db.thing.findUniqueOrThrow({ where: { id: parsed.data.id } })
    if (current.status !== 'EXPECTED') {                     // 3. check the transition
      return { error: `Cannot do this to a ${current.status.toLowerCase()} thing.` }
    }

    await db.$transaction([ /* 4. write */ ])

    await createAuditLog({                                   // 5. audit
      userId: session.userId,
      action: 'THING_DONE',
      entityType: 'THING',
      entityId: current.id,
    })

    revalidatePath('/things')                                // 6. refresh
    return { success: true }
  } catch (err) {
    console.error('doThing error:', err)                     // 7. never leak internals
    return { error: 'Failed to do the thing.' }
  }
}
```

New `action` and `entityType` values need enum entries in `schema.prisma` and a
migration. Empty-string form fields are a recurring nuisance — the codebase's habit is
`if (raw.x === '') delete raw.x` before parsing (see `rewards.ts`, `workPass.ts`,
`blackouts.ts`).

Client side, either `useActionState(doThing, {})` for a form, or call it inside
`startTransition()` and toast the result (see `LetterWorkspace` for the second
pattern).

## 4.3 Traps that will bite you

**`xlsx` is imported but not installed.** Five routes do `import * as XLSX from 'xlsx'`
— `expenses/export-filtered`, `expenses/export-reimbursement`, `payroll/export-monthly`,
`performance/cycles/[id]/export`, `rewards/cycles/[id]/export` — but the package is in
neither `package.json` nor `node_modules`. **Every XLSX export is broken until someone
runs `npm install xlsx`.** This is the first thing to fix.

**The Expenses module is switched off** by four `const HIDDEN = true` flags (§2.13). The
actions and tables are still live. `/expenses` returning 404 is intentional.

**Prisma `Decimal` and `Date` must be serialized** before crossing into a client
component. `amount.toString()`, `date.toISOString()`. The error message when you forget
is not helpful.

**Dates compared against `@db.Date` columns must be UTC midnight.** Use the
`toDateOnly()` helper pattern (`new Date(\`${s}T00:00:00.000Z\`)`) that `timeEntry.ts`
and `blackouts.ts` use. Local-timezone dates drift a day on a UTC server.

**`redirect()` throws.** Never call it inside a `try/catch` that swallows errors — see
the comment in `login()`. Equally, `requireRole` redirects rather than returning an
error, which is why form actions do explicit `session.role !== 'ADMIN'` checks instead.

**Restart the dev server after `prisma migrate dev`.** The running process holds the
old client. On Windows, killing the terminal sometimes leaves an orphan holding port
3000 — kill it explicitly.

**The profile page computes leave `available` by hand** and ignores
`entitlementOverride` and carry-forward expiry, unlike `computeAvailable()` used
everywhere else (§2.1). Two screens can legitimately disagree today.

**A React footgun that already caused a real bug here:** passing a mutable ref's
`.current` into a state updater and then resetting the ref. The updater runs *after*
the handler, so it sees the emptied array. It was fixed in `SignaturePad`; grep for the
pattern before copying code out of any canvas/pointer component.

**Exact-day cron comparisons** (probation reminder, work-pass reminder) mean a missed
cron day is a lost notification (§2.19). The dashboards are the safety net.

**Sensitive fields.** `User.nric`, `User.passportNumber`, `WorkPass.finNumber`, and the
payslip/medical documents are confidential, internal-only data. Stored files are never
public — always go through `/api/files/[fileId]`, which is session-gated. Don't paste
real identifiers into logs, tickets, or third-party tools; the XLSX exports are the
main path by which real data leaves the system. Anything touching statutory
entitlements or the MY overtime multipliers needs qualified HR/legal review — what's in
`payroll.ts` and `leaveEntitlement.ts` is the current implementation, not advice.
