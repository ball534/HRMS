# iORA — HRMS + Learning Hub (combined)

A single Next.js application that combines **InsideHR** (an HR management system)
with the **iORA Learning Hub** (an onboarding LMS). The LMS is integrated *into*
the HRMS: it shares the same login/session, the same database, and is reached
from a **Learning** tab in the HR sidebar — no separate app, no second login.

Previously these were two separate codebases (`HRMS/` and `iORALMS/`). They are
now one codebase at the repository root. The original standalone LMS source is
kept for reference under `docs/iora-lms-original/` but is **not** used at runtime.

---

## Quick start

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- PostgreSQL 17 running locally (service `postgresql-x64-17`, port 5432)

### Setup
```bash
npm install                 # install dependencies

# .env is already created for local dev (see below). If starting fresh:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/iora_combine
#   SESSION_SECRET=<random 32-byte base64>

npx prisma migrate deploy   # create all tables
npx prisma generate         # generate the typed Prisma client
npm run db:seed             # holidays, leave types, default admin
npm run db:seed-test        # the two test accounts below

npm run dev                 # http://localhost:3000
```

> The PowerPoint slide viewer uses Microsoft's Office Online viewer, which can
> only render `.pptx` files reachable on the **public internet**. On `localhost`
> the slide frame shows an error; the rest of the lesson (PDF, video, quiz)
> works. This was true of the original LMS too.

---

## Test accounts

Created by `npm run db:seed-test` (both have `mustChangePassword = false`, so they
log straight in):

| Role        | Email                | Password      | Sees                                            |
| ----------- | -------------------- | ------------- | ----------------------------------------------- |
| **Admin**   | `admin@iora.test`    | `Admin@123`   | Everything + **Learning** + **Learning Progress** |
| **Learner** | `learner@iora.test`  | `Learner@123` | HR tabs + **Learning**                          |

`npm run db:seed` also creates a default admin `jin@company.com` / `changeme123`
(forces a password change on first login).

### What to test
1. Log in as the **learner** → click **Learning** in the HR sidebar → you're in
   the Learning Hub with no second login. Work through Lesson 1 (slides → reading
   → video) and Test 1; progress saves to the database.
2. In the Hub, open the profile menu (top right) → **My Profile** → it takes you
   back into HRMS without re-logging in. (There is no "change password" in the
   Hub — HRMS owns that.)
3. Log in as the **admin** → **Learning Progress** (Admin section) shows a table
   of every employee's lesson/test status, and a content-authoring panel
   (Create Lesson / upload are scaffolded; "Download quiz template" works).

---

## How the integration works

- **Single login (SSO).** HRMS issues a `session` JWT cookie (`src/lib/session.ts`).
  The Learning Hub lives at `/learning` inside the *same* app, so the cookie
  authenticates it automatically — clicking **Learning** never asks for a second
  login, and **My Profile** in the Hub links back to `/people/{id}` the same way.
- **Progress sync.** The Hub no longer uses browser `localStorage`. It is seeded
  from the database on load and syncs progress back via server actions
  (`src/actions/learning.ts`). The HRMS database is the single source of truth.
- **Admin overview.** `/admin/learning` reads the synced progress and renders a
  per-employee table, plus a (scaffolded) authoring section for the future.

---

## Project structure

```
├── prisma/                       Database schema, migrations, seeds
│   ├── schema.prisma             All models (User, Leave, …, Learning* models)
│   ├── migrations/               SQL migrations (…_add_learning is the LMS one)
│   ├── seed.ts                   Base seed: holidays, leave types, default admin
│   └── seed-test.ts              The admin + learner test accounts
│
├── public/
│   └── materials/{en,ch,ms}/     Course files: N.pptx, N.pdf, N.csv, videos.csv
│
├── src/
│   ├── app/                      Next.js App Router
│   │   ├── (auth)/               Login, forgot/reset/change password
│   │   ├── (dashboard)/          HRMS app (shares the sidebar chrome)
│   │   │   ├── dashboard, people, leave, expenses, performance, payroll, …
│   │   │   └── admin/learning/   ★ Admin "Learning Progress" page
│   │   ├── (learning)/           ★ The Learning Hub (full-page, its own layout)
│   │   │   ├── layout.tsx        Auth gate (verifySession) only
│   │   │   └── learning/page.tsx Seeds the Hub + wires save/logout/profile
│   │   ├── api/                  Route handlers (file uploads, exports, …)
│   │   └── layout.tsx            Root layout (fonts, Toaster)
│   │
│   ├── actions/                  Server actions ('use server')
│   │   ├── auth.ts               login / logout / password reset
│   │   ├── learning.ts           ★ getLearningSeed / saveLearningProgress /
│   │   │                            getAllLearningProgress (admin)
│   │   └── leave.ts, expense.ts, performance.ts, rewards.ts, …  (HR features)
│   │
│   ├── components/
│   │   ├── layout/Sidebar.tsx    ★ Nav — "Learning" (HR) + "Learning Progress" (Admin)
│   │   ├── learning/LearningApp.jsx  ★ The ported LMS (one client bundle)
│   │   ├── admin/LearningAuthoringScaffold.tsx  ★ Create Lesson / quiz template
│   │   └── ui/                   shadcn/ui primitives (Table, Card, Badge, …)
│   │
│   ├── lib/
│   │   ├── session.ts            JWT session cookie (jose)
│   │   ├── dal.ts                verifySession / requireRole (auth helpers)
│   │   ├── db.ts                 Prisma client singleton
│   │   ├── google-drive.ts       Drive storage for documents/uploads
│   │   └── …                     audit, email, payroll, leave helpers
│   │
│   ├── generated/prisma/         Generated Prisma client (do not edit)
│   ├── hooks/, types/            Shared hooks and types
│
├── docs/
│   ├── iora-lms-original/        Original standalone LMS source (reference only)
│   ├── decks/, screenshots/      HR docs assets
│
├── .env                          Local secrets (git-ignored)
├── next.config.ts, tsconfig.json, package.json
```

★ = files added or changed for the HRMS ↔ LMS integration.

### The ported Learning Hub (`src/components/learning/LearningApp.jsx`)

The original LMS was authored as separate global-scope `.jsx` files concatenated
at build time. They were mechanically ported into **one** `'use client'` ES
module here. Key differences from the standalone version:

- Identity (name/role) comes from the **HRMS session**, not a hardcoded user.
- Progress is **seeded from / synced to** the backend, not `localStorage`.
- The dev "tweaks" panel and the **change-password** modal were removed.
- **My Profile** navigates back into the HRMS profile page.

Course content is still driven by the files in `public/materials/<lang>/` — the
fixed 3-lesson / 3-test journey. The quiz CSV format is `question,a,b,c,d` where
column **`a` is the correct answer** (the app shuffles options at runtime).

### Learning data model (`prisma/schema.prisma`)

| Model                      | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `LearningLessonProgress`   | Per-lesson part completion (slides / pdf / video)         |
| `LearningTestProgress`     | Per-test attempts, best score, pass/fail, lockout         |
| `LearningSurvey`           | One feedback survey per learner (gates the certificate)   |

---

## npm scripts

| Script                | Does                                                    |
| --------------------- | ------------------------------------------------------- |
| `npm run dev`         | Start the dev server (http://localhost:3000)            |
| `npm run build`       | `prisma migrate deploy && prisma generate && next build`|
| `npm run start`       | Start the production server                             |
| `npm run db:seed`     | Seed holidays, leave types, default admin               |
| `npm run db:seed-test`| Seed the `admin@iora.test` / `learner@iora.test` users  |

---

## Notes

- `.env` is git-ignored; only `.env.example` is committed.
- The local Postgres is not reachable from a cloud host — deploying needs a
  cloud Postgres (`DATABASE_URL`) and the same env vars.
- Authoring (Create Lesson / content upload) is intentionally a **scaffold** for
  a future phase; it is expected to store content in Google Drive, which HRMS
  already integrates for documents.
