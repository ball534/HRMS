# iORA — HRMS + Learning Hub

A single Next.js application combining **InsideHR** (an HR management system) with the
**iORA Learning Hub** (an onboarding LMS). The LMS is integrated *into* the HRMS: same
login/session, same database, reached from the **Learning** tab in the sidebar — no
separate app, no second login.

## What's inside

**HRMS**

- **People** — employee records (Employee ID, NRIC, passport, company), org chart,
  redesigned profile page (hero header + Overview / Leave / Work Passes tabs)
- **My Journey** — a LinkedIn-style career timeline every employee sees on their own
  profile (joined → role changes → confirmed → today), auto-recorded from HR actions
- **Letters** — employment letters auto-drafted on hire, confirmation letters triggered
  by setting a confirmation date; HR review queue → approving officer signs on a
  draw-to-sign pad → PDF stored in the employee's Drive folder
- **Probation & confirmation** — probation end auto-computed, 2-week HR reminder,
  every-2-day signing nudges, overdue flagging, daily cron sweep
- **Work passes** — EP / S Pass / Work Permit tracking with per-type reminder windows
  (4 months for EP & S Pass, 2 months for WP), bucketed admin dashboard
- Leave, expenses, timesheets, performance reviews, payroll, rewards, documents,
  holidays (SG + MY), blackout windows

**LMS** (Learning tab)

- Fixed 3-lesson / 3-test onboarding journey (slides → PDF → video per lesson)
- 30-min test timer, 40 questions sampled from a 60-question bank, 30/40 pass mark,
  lockout after 3 failed attempts (HR notified), compulsory feedback survey gating the
  certificate, screenshot deterrents
- Admin **Learning Progress** page with every employee's lesson/test status

**Stack:** Next.js (App Router) · React · Prisma + PostgreSQL · Tailwind/shadcn ·
JWT session cookie (jose) · Google Drive/Docs (letters & documents) · Resend (email) ·
Lark (scaffold)

---

## Install & run locally (exact steps)

These are the exact steps used to set up the current demo machine. Nothing needs admin
rights and no system services are installed.

### 0. Prerequisites

- [Node.js](https://nodejs.org) 18+ (`node -v`)
- ~600 MB free disk for the portable database + dependencies

### 1. Install dependencies

```bash
cd HRMS
npm install
```

### 2. Set up a portable PostgreSQL (one-time)

A self-contained Postgres lives in `..\.localdb` (a sibling of this repo — it is *not*
part of the git tree). To recreate it from scratch:

```powershell
# from the iORA folder (the parent of HRMS)
mkdir .localdb; cd .localdb

# download + extract the official binaries zip (~290 MB, no installer)
curl -L -o pg.zip "https://get.enterprisedb.com/postgresql/postgresql-16.6-1-windows-x64-binaries.zip"
tar -xf pg.zip                      # extracts to .\pgsql

# initialise a data directory and start on port 5455 (avoids clashing with any real Postgres)
.\pgsql\bin\initdb -D data -U postgres -A trust -E UTF8
.\pgsql\bin\pg_ctl -D data -l pg.log -o "-p 5455" start
.\pgsql\bin\createdb -h localhost -p 5455 -U postgres hrms
```

> Already set up? Skip this — `demo-start.cmd` (step 6) starts the existing database
> automatically.

### 3. Create `.env`

In the `HRMS` folder:

```env
DATABASE_URL=postgresql://postgres@localhost:5455/hrms
SESSION_SECRET=any-random-string-at-least-32-characters-long
```

Everything else in `.env.example` (Google Drive/Docs, Resend, Lark, CRON_SECRET) can be
left unset locally — the app stubs them gracefully (letters flow end-to-end without PDF
rendering; reminders are logged instead of emailed).

### 4. Create the schema and base data

```bash
npx prisma migrate deploy   # all tables
npx prisma generate         # typed Prisma client
npm run db:seed             # SG/MY holidays, leave types, admin jin@company.com
```

### 5. Seed the demo company (recommended)

```bash
npm run db:seed-demo
```

Creates a presentation-ready fake company of 14 employees covering every feature story
(see [Demo data](#demo-data--logins)). Safe to re-run any time — it wipes and recreates
all `@iora.demo` users, and every date is relative to *today* so the demo never goes
stale.

### 6. Run it

```bash
npm run dev                 # http://localhost:3000
```

or just double-click **`demo-start.cmd`** — it starts the portable Postgres if it isn't
running, then the dev server.

To stop the database later: `..\.localdb\pgsql\bin\pg_ctl -D ..\.localdb\data stop`

---

## Demo data & logins

All demo passwords are **`changeme123`** (no forced password change).

| Login | Role | Use it to show |
| --- | --- | --- |
| `jin@company.com` | Admin / HR | Dashboards, Letters queue, Work Passes, People, own **My Journey** |
| `sara@iora.demo` | Boss / approving officer | Open a pending letter and **sign it** on the pad |
| `weiling@iora.demo` | Employee (Store Manager) | Richest **My Journey** (4 roles / 4 years) + mid-way LMS progress |
| `grace@iora.demo` | HR user | HR-role view |

The seeded company covers one of each story:

- **Letters queue** (`/admin/letters`): Daniel Koh *pending review* (new hire, 2 weeks
  in) · Aisyah Rahman *awaiting signature* (2-day nudges active) · Kumar Raj *overdue*
  (due date passed unsigned) · Marcus Ong *sent* · Wei Ling *signed*
- **Work passes** (`/admin/work-passes`): one **expired** (MY WP), one WP due in ~5
  weeks (2-month window), one EP due in ~3 months (4-month window), one S Pass safely
  outside all windows
- **Probation**: Priya Nair's probation ends in ~10 days with no confirmation date →
  the 2-week HR reminder story
- **Leavers**: Tommy Teo (terminated) and Olivia Wong (rejected) → archived folders
- **LMS** (`/admin/learning`): Marcus completed everything incl. survey (cert ready) ·
  Wei Ling mid-journey · Daniel just started · Thi Hoa Nguyen **locked out** after 3
  failed attempts
- Leave balances and requests (approved / pending / rejected) for all active staff

**Trigger the daily reminder sweep manually** (probation notices, signing nudges,
overdue flags, work-pass reminders) by opening:

```
http://localhost:3000/api/cron/daily
```

It returns a JSON summary of what it did. In production this runs automatically at
09:00 SGT via Vercel Cron (`vercel.json`).

> The PowerPoint slide viewer uses Microsoft's Office Online viewer, which can only
> render `.pptx` files reachable on the public internet. On `localhost` the slide frame
> shows an error; the rest of the lesson (PDF, video, quiz) works.

---

## npm scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` | `prisma migrate deploy && prisma generate && next build` |
| `npm run start` | Start the production server |
| `npm run db:seed` | Base seed: holidays, leave types, `jin@company.com` admin |
| `npm run db:seed-demo` | The full fake company above (idempotent, relative dates) |
| `npm run db:seed-test` | Minimal pair: `admin@iora.test` / `learner@iora.test` |

---

## Optional integrations (for full production features)

Without these the app still runs; the related step is stubbed or falls back.

| Env vars | Enables |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_IMPERSONATE_EMAIL` | Document storage + employee Drive folders + folder archiving |
| `GOOGLE_DOCS_EMPLOYMENT_TEMPLATE_ID`, `GOOGLE_DOCS_CONFIRMATION_TEMPLATE_ID` | Real letter PDFs, generated from editable Google Doc templates with `{{merge}}` fields (requires the Docs API scope on the service account) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Real reminder emails + letter delivery fallback |
| `LARK_APP_ID`, `LARK_APP_SECRET` | Letter delivery via Lark (adapter is currently a scaffold — sends fall back to email) |
| `CRON_SECRET` | Protects `/api/cron/daily` (Vercel sends it automatically) |

## Deploying to Vercel

1. Provision a cloud Postgres (Neon / Railway / Vercel Postgres) and set
   `DATABASE_URL` + `SESSION_SECRET` (plus any integrations above) in the Vercel
   project env.
2. Push the repo — the build runs `prisma migrate deploy` automatically, and
   `vercel.json` schedules the daily cron.
3. Seed once against the cloud DB: `npm run db:seed` (and `db:seed-demo` if you want
   the fake company there too).

---

## Project structure

```
├── prisma/
│   ├── schema.prisma             All models (User, Leave, WorkPass, EmploymentLetter,
│   │                             CareerEvent, Learning*, …)
│   ├── migrations/               SQL migrations
│   ├── seed.ts                   Base seed  ·  seed-demo.ts  Demo company  ·  seed-test.ts
│
├── public/materials/{en,ch,ms}/  LMS course files: N.pptx, N.pdf, N.csv, videos.csv
│                                 (quiz CSV: question,a,b,c,d — column `a` is correct;
│                                 options are shuffled at runtime)
│
├── src/
│   ├── app/
│   │   ├── (auth)/               Login, forgot/reset/change password
│   │   ├── (dashboard)/          HRMS: dashboard, people, leave, time, performance,
│   │   │                         payroll, rewards, documents, admin/… (letters,
│   │   │                         work-passes, learning, leave, blackouts)
│   │   ├── (learning)/           The Learning Hub (full-page, own layout)
│   │   └── api/                  Route handlers incl. api/cron/daily
│   │
│   ├── actions/                  Server actions: users, letters, workPass, learning,
│   │                             leave, expenses, …
│   ├── components/
│   │   ├── people/               EmployeeProfile (hero + tabs), CareerJourney,
│   │   │                         WorkPassManager, forms, org chart
│   │   ├── letters/              LetterWorkspace, SignaturePad
│   │   ├── learning/LearningApp.jsx   The ported LMS (one client bundle)
│   │   └── ui/                   shadcn/ui primitives
│   │
│   ├── lib/                      session, dal (auth), db, google-drive, google-docs,
│   │                             notifications, lark (scaffold), reminders, email, audit
│   └── generated/prisma/         Generated Prisma client (do not edit)
│
├── demo-start.cmd                One-click: start portable Postgres + dev server
├── .env                          Local secrets (git-ignored; see .env.example)
└── vercel.json                   Daily cron schedule (09:00 SGT)
```

## Notes

- `.env` is git-ignored; only `.env.example` is committed.
- The portable database in `..\.localdb` is local-only — deploying needs a cloud
  Postgres and the same env vars.
- LMS content authoring (Create Lesson / upload) is intentionally a scaffold for a
  future phase; in-app admin file overrides currently persist to the browser only.
- Full change history and design decisions: `Changes made.md`.
