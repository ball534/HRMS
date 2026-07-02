# Changes Made — HRMS Letters, Probation & Work Passes

This document covers the work done against `HRMS Changes.md`, split into two parts:

1. **[What was built](#part-1--what-was-built)** — every change/addition, by area.
2. **[Decisions & open questions](#part-2--decisions--alternatives-for-the-meeting)** — the
   questions I asked, what I went with (some were best-guesses), and **alternative
   directions** to take into your meeting with your boss.

> ⚠️ Status: this is implemented and the production build passes. Letters won't render
> real PDFs until a few infra items are provided (Google Doc templates, Docs API scope,
> email key) — see [Before go-live](#before-go-live). The flow is fully usable without them
> (it just records the letter without a PDF).

---

## Part 1 — What was built

### A. Employee data (new fields)
Added to the employee record (`User`): **Employee ID** (`employeeNumber`, unique, manual),
**NRIC**, **Passport No.**, **Passport Exp. Date**, and **Company**.

- The *Add Employee* form and the *Edit Employee* modal now collect all of these.
- `Company` was added because the doc asks work passes to "pull company name from employee
  data", but no company field existed before. (See [Decision 9](#9-company-field-added).)

### B. Employment-letter workflow
Implements: *employee details added → auto-generate letter → HR reviews → approving officer
signs → PDF saved in employee folder → rejected folders archived.*

- **Auto-draft on hire.** Saving a new employee auto-creates an *employment letter* in
  `PENDING_REVIEW` and (when configured) generates the PDF from a **Google Doc template**
  with `{{merge}}` fields, stored in the employee's Drive folder.
- **HR review.** New **Letters** queue (`/admin/letters`) lists everything awaiting review,
  signature, or delivery. HR opens a letter, previews the PDF inline, and either **approves
  it (choosing the approving officer)** or **rejects it**.
- **Signing.** The chosen approving officer opens the letter and signs on a **draw-to-sign
  pad** (pen, undo, clear, confirm). The signature is stamped onto the PDF and the final
  signed PDF is stored in Drive.
- **Folder archiving.** When an employee becomes **Rejected** (offer declined) or
  **Terminated** (resigned/fired), their Drive folder is moved to an `Archived/` area, out
  of the normal tree. (See [Decision 7](#7-what-rejected--archive-means).)

### C. Probation & confirmation
Implements the probation/confirmation section of the doc.

- **Probation end auto-computed** from `Start Date + Probation (months)` (default 3).
- **Confirmation date** is entered manually on the employee profile and can be changed.
- Setting it kicks off the **confirmation letter** through the *same* pipeline as the
  employment letter (HR review → officer/boss signs → delivered).
- **Reminders** (via the daily job):
  - 2 weeks before probation end (if no confirmation date set yet) → HR.
  - Every 2 days nudge to the signer until the confirmation letter is signed.
  - On/after the confirmation date, once signed → letter is **sent** to the employee.
  - If the date passes unsigned → letter flagged **overdue** + HR notified.

### D. Work-pass tracking (extended existing module)
The work-pass module already existed; it was extended to match the doc.

- **New fields:** Work Permit No., FIN, Application Date, Approval Date (Monthly Levy, Issue
  Date, Expiry Date already existed).
- **Pulled from employee:** Passport No., Passport Exp. Date, and Company are shown read-only
  on the work-pass panel, sourced from the employee profile.
- **Reminder thresholds changed** to the doc's rules: **4 months** before expiry for
  Employment Pass & S Pass, **2 months** for Work Permit (others default to 3 months). The
  admin dashboard now buckets passes as **Expired / Due-for-review / OK** using these
  per-type windows instead of the old fixed 30/60/90 days.

### E. Notifications & scheduling (new infrastructure)
- **Notification facade** (`src/lib/notifications.ts`) — one place the app sends from.
  Reminders go by **email** (Resend); letter delivery tries **Lark**, falling back to email.
- **Lark adapter** (`src/lib/lark.ts`) — **a draft/scaffold only**, as requested. It stubs
  sends (logs them) until Lark credentials exist, with the real call path sketched in
  `TODO`s (token exchange, user lookup, message/file send).
- **Daily cron** (`/api/cron/daily`, wired in `vercel.json` for 09:00 SGT) runs all the
  reminder/overdue/delivery checks. Token-protected via `CRON_SECRET`.

### F. Files added / changed

**Added**
- `src/lib/google-docs.ts` — template copy → merge → export PDF → stamp signature.
- `src/lib/lark.ts` — Lark adapter (draft).
- `src/lib/notifications.ts` — email/Lark facade.
- `src/lib/reminders.ts` — the daily reminder sweep logic.
- `src/actions/letters.ts` — generate / review / sign / reject / send letters.
- `src/components/letters/SignaturePad.tsx` — draw-to-sign canvas.
- `src/components/letters/LetterWorkspace.tsx` — review/sign UI.
- `src/app/(dashboard)/admin/letters/page.tsx` + `[id]/page.tsx` — queue + detail.
- `src/app/api/cron/daily/route.ts` — cron endpoint.
- `prisma/migrations/20260627120000_add_letters_employee_data_probation/` — DB migration.

**Changed**
- `prisma/schema.prisma` — new `EmploymentLetter` model; `LetterType`/`LetterStatus` enums;
  `User` fields (identity + probation + `folderArchivedAt`); `REJECTED` user status;
  `WorkPass` fields; new audit actions.
- `src/lib/google-drive.ts` — Docs scope, employee-folder helpers, archive, file download/update.
- `src/lib/email.ts` — generic `sendEmail` with attachments.
- `src/actions/users.ts` — new fields, probation compute, auto-letter, confirmation date, archiving.
- `src/actions/workPass.ts` — new fields + per-type reminder windows + cron helper.
- `src/components/people/AddEmployeeForm.tsx`, `EditEmployeeForm.tsx`, `EmployeeProfile.tsx`,
  `WorkPassManager.tsx`, `src/components/layout/Sidebar.tsx`.
- `src/app/(dashboard)/people/[id]/page.tsx`, `src/app/(dashboard)/admin/work-passes/page.tsx`.
- `vercel.json`, `.env.example`, `package.json` (added `pdf-lib`).

### Before go-live
These need to be provided/decided before letters work end-to-end:
1. **Google Doc letter templates** (one for employment, one for confirmation) with `{{merge}}`
   placeholders → put their IDs in `GOOGLE_DOCS_EMPLOYMENT_TEMPLATE_ID` /
   `GOOGLE_DOCS_CONFIRMATION_TEMPLATE_ID`. (Available merge fields: `firstName`, `lastName`,
   `fullName`, `employeeNumber`, `nric`, `passportNumber`, `position`, `department`, `company`,
   `country`, `email`, `startDate`, `probationEndDate`, `confirmationDate`, `today`,
   `approvingOfficerName`.)
2. **Enable the Google Docs API scope** for the service account (domain-wide delegation).
3. **`RESEND_API_KEY`** + a verified sender domain for real emails.
4. **`CRON_SECRET`** set in the deploy env (Vercel sends it automatically to the cron).
5. Lark credentials *later*, when you want to switch delivery off email.

### G. Employee profile redesign + Career "Journey" (added 3 Jul 2026)

- **Profile page redesign** (`src/components/people/EmployeeProfile.tsx`): the flat stack of
  cards/tables was replaced with a **hero header** (larger avatar, status + plain-language
  probation pill, key-facts strip with icons: email, phone, start date + tenure, country,
  Employee ID, company, employment type, manager) and **tabs**: *Overview* / *My Journey*
  (own profile) / *Leave & Time Off* (admin) / *Work Passes* (admin — the work-pass manager
  moved into a tab via a slot from `people/[id]/page.tsx`).
- **Career Journey** (`src/components/people/CareerJourney.tsx`): a LinkedIn-style
  flow-chart timeline an employee sees on their **own** profile — nodes for *Joined*,
  *position/department changes*, *Confirmed*, *probation end* (derived, dashed when
  upcoming) and a *today* node, with duration chips on the connectors plus a summary strip
  (tenure, roles held, milestones).
- **Data**: new `CareerEvent` model + `CareerEventType` enum (`prisma/schema.prisma`),
  migration `20260703000000_add_career_events` (backfills a JOINED event per existing user
  from `startDate`, and a CONFIRMED event where a confirmation date exists). Events are
  auto-recorded in `src/actions/users.ts`: JOINED on create; POSITION_CHANGE /
  DEPARTMENT_CHANGE / TERMINATED on update; CONFIRMED kept in sync in
  `setConfirmationDate`.
- **Navigation**: sidebar now has a **My Profile** link (`src/components/layout/Sidebar.tsx`)
  so employees can reach their own profile/journey directly.

---

## Part 2 — Decisions & alternatives (for the meeting)

For each item: **what the doc implied → what I built → other directions worth discussing.**
Items marked 🟡 are ones I wasn't fully sure about / made a best guess on — good candidates to
raise with your boss.

### 1. How letters are generated
- **Built:** Google Doc **template** with `{{merge}}` fields → copied, filled, exported to PDF,
  saved to Drive. HR can edit the wording themselves without touching code.
- **Why:** best reuse of the existing Google Workspace/Drive integration.
- **Alternatives:**
  - **HTML → PDF (headless Chrome)** — fully self-contained, devs control layout exactly, but
    heavier to run and HR can't edit wording.
  - **react-pdf (code-defined layout)** — pure JS, no browser, but only developers can change
    the template.
  - **Word/`.docx` templating (docxtemplater)** — if HR prefers Word over Google Docs.
  - **Third-party doc service (PandaDoc, Documint, etc.)** — most features (versions, audit),
    but a paid external dependency.
- **Talking point:** *"I went with editable Google Doc templates so HR owns the wording. Would
  you prefer the layout locked down in code, or Word templates instead?"*

### 2. What "sign" means 🟡
- **Built:** an in-app **draw-to-sign pad** (you noted you'd prefer drawing over uploading an
  image). The drawing is stamped onto the PDF.
- **Note / limitation:** the signature is currently placed at a **fixed spot** (bottom-left of
  the last page). If templates vary, we may want a configurable signature anchor.
- **Alternatives:**
  - **Upload / pre-saved signature image** — officer uploads once, reused each time.
  - **Typed name rendered in a signature font** — simplest, least "real".
  - **External e-signature (DocuSign / SignNow)** — legally strongest, audit trail, but paid +
    external, and changes the flow (employee/officer signs outside the app).
  - **Certificate-based digital signature** — cryptographically verifiable PDF signature.
- **Talking points:** *"Is a drawn signature legally sufficient for these letters, or do we
  need something like DocuSign?"* and *"Should the signature position be fixed or configurable
  per template?"*

### 3. Notification channel (Lark) 🟡
- **Built:** **email now (Resend), with a Lark adapter scaffold** behind the same interface —
  you asked for "a rough draft/infrastructure, not full deployment." Letters try Lark, fall
  back to email; reminders are email.
- **Alternatives:**
  - **Email only** — drop Lark entirely.
  - **Full Lark now** — finish the integration (needs app credentials + an employee→Lark-user
    mapping).
  - **Slack / MS Teams / WhatsApp / SMS** — other channels if the team doesn't live in Lark.
  - **In-app notification centre** — notifications inside the HRMS instead of (or with) external.
- **Decisions still needed for full Lark:** Do we have a Lark custom app + API credentials? How
  do we map an employee to their Lark user (by email)? Should *reminders* also move to Lark, or
  stay on email?
- **Talking point:** *"I stubbed Lark so we can flip it on later. Before I finish it — do we
  have Lark API access, and do you want reminders on Lark too or just the letters?"*

### 4. Who the approving officer / boss is
- **Built:** HR **picks the approving officer per letter** from a dropdown.
- **Alternatives:**
  - **Auto = reporting manager** (no manual pick).
  - **Fixed approving-officer role/setting** — one designated signer for all letters.
  - **Multi-level approval chain** — e.g. manager → HR head → director.
- **Talking point:** *"Per-letter selection is the most flexible. Should it instead default to
  the reporting manager, or always be one fixed approver?"*

### 5. When the employment letter is created
- **Built:** **auto-generated the moment a new employee is saved** (lands in the review queue).
- **Alternatives:**
  - **Manual "Generate letter" button** — avoids drafts for records created for other reasons
    (migrations, contractors).
  - **Auto only for certain employment types** (e.g. full Employees, not Contractors/Part-time).
- **Talking point:** *"Every new hire auto-creates a draft letter. Do contractors/part-timers
  need one too, or only full employees?"*

### 6. How Employee ID is assigned
- **Built:** **manual entry** (unique; validated against duplicates).
- **Alternatives:**
  - **Auto-generated** (e.g. `IORA-0001`).
  - **Auto with manual override.**
  - **Synced from an external HR/payroll system.**
- **Talking point:** *"I made Employee ID a manual field assuming you already have a numbering
  scheme. Want the system to auto-generate them instead?"*

### 7. What "rejected → archive" means 🟡
- **Built (from your clarification):** when an employee **rejects their contract, resigns, or
  is fired**, their folder (credentials + documents + letters) is **moved to `Archived/`** and
  taken out of the normal Drive tree. Triggered by setting status to **Rejected** or
  **Terminated**.
- **Open sub-questions for the meeting:**
  - "Inaccessible through normal channels" — I implemented this as **moving the folder** to an
    Archived area. Should it instead be **permission-locked** (only admins can open), or
    **fully deleted** after a retention period?
  - Should archiving also **disable their login** automatically?
  - Should there be a **retention/purge policy** (e.g. delete archived folders after N years)?
- **Talking point:** *"Rejected/terminated employees' folders get moved to an Archived area.
  Is 'move + hide' enough, or do we need stricter access locking and a deletion timeline?"*

### 8. Scheduler / how reminders run 🟡
- **Built (you said "whichever you recommend"):** **Vercel Cron**, one **daily** job at ~09:00
  SGT that processes probation reminders, the every-2-day nudges, due/overdue letters, and
  work-pass reminders.
- **Trade-off:** daily granularity. "Every 2 days" is handled by tracking the last-reminder
  date; a one-shot work-pass reminder fires on the exact threshold day (if a day is missed —
  e.g. deploy down — that single reminder is skipped).
- **Alternatives:**
  - **External scheduler** (cron-job.org, GitHub Actions) hitting the same endpoint — needed if
    we don't deploy to Vercel.
  - **More frequent runs** (e.g. hourly) for tighter timing.
  - **Per-record reminder tracking for work passes** (extra field) so missed days are caught up
    instead of skipped.
- **Talking point:** *"Reminders run once a day on Vercel Cron. Is daily fine, and are we
  definitely deploying on Vercel?"*

### 9. Company field added
- Not in the doc, but the doc says work passes should "pull company name from employee data"
  and there was **no company field**. I added `Company` to the employee record.
- **For discussion:** does iORA have **multiple legal entities**? If company should come from a
  fixed list (not free text), we can make it a dropdown.

### 10. Smaller defaults I chose (flag any to revisit)
- **Probation period** is a per-employee field defaulting to **3 months** (the doc's example);
  editable per person.
- **NRIC** lives on the employee; **FIN** lives on the work pass (matches the doc's grouping) —
  locals use NRIC, foreigners use FIN.
- **Signature image** is stored in the database as a data URL alongside the stamped PDF.
- **Audit logging** — every letter action (generated/reviewed/signed/rejected/sent/reminded)
  and folder archiving is written to the existing audit log.

---

## Appendix — Quick local test
1. Create a new employee (`/people/new`) → an employment letter appears in **Letters**
   (`/admin/letters`) as *Pending review* (no PDF locally unless Drive is configured).
2. Open it as HR → choose an approving officer → **Approve for signature**.
3. Log in as that officer → open the letter → **Sign** on the pad.
4. On an employee profile, set a **Confirmation Date** → a confirmation letter is created and
   runs through the same review/sign flow.
5. Hit `/api/cron/daily?secret=<CRON_SECRET>` (or with no secret set) to run the reminder
   sweep manually and see the JSON summary.
