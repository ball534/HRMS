# iORA Learning Hub (LMS)

A lightweight, multilingual onboarding learning-management app for iORA retail
staff. New employees work through a date-gated journey of three lessons and a
final test; each lesson combines slides, a PDF reading, a video, and a quiz.
Passing the final test unlocks a printable e-certificate.

Available in **English, 中文 (Chinese), and Bahasa Melayu**, with six visual
themes, and fully responsive for both laptop and mobile.

## Highlights

- **Onboarding journey** — 3 lessons + 1 final test, unlocked by date.
- **Four-part lessons** — slides (PowerPoint via the Office Online viewer) →
  PDF reading → YouTube video → multiple-choice quiz, unlocked in sequence.
- **Quizzes** — 80% pass mark, per-question feedback, retries; three or more
  failed attempts raises a (simulated) HR escalation.
- **Progress tracking** — an animated "hopping rabbit" progress bar plus an
  upcoming-deadline card; all progress is saved to the browser's localStorage.
- **E-certificate** — generated on completion, printable / saveable as PDF.
- **Trilingual** — every screen and all course material exist in EN / ZH / MS.
- **Theming** — six brand themes (Ivory, Noir, Stone, Rosewood, Camel, Olive).
- **Responsive** — laptop and mobile layouts from a single codebase.

## Tech stack

A **React 18** app compiled ahead of time with **[Vite](https://vitejs.dev)**
(the JSX is bundled and minified at build time — the browser receives plain JS,
not a Babel compiler). Plain CSS in a single `<style>` block in `index.html`
drives the theming via CSS custom properties.

The source is still authored as the same set of separate `.jsx` files sharing
one scope (no `import`/`export`). At build time `vite.config.js` concatenates
them — in the order listed in `SOURCES` — into the single entry module
`src/main.jsx`, then Vite compiles and bundles everything (including React).

## Prerequisites

[Node.js](https://nodejs.org) 18 or newer (includes `npm`). Check with:

```bash
node -v
npm -v
```

## Getting started

```bash
npm install      # once, to download dependencies into node_modules/
npm run dev      # start the dev server with hot-reload → http://localhost:5173
```

Edit any `.jsx` file in the project root and the browser updates automatically.

> **Note:** the slide viewer uses Microsoft's Office Online viewer, which can
> only render `.pptx` files reachable on the **public internet**. On
> `localhost` the slide frame shows an error; it works once deployed.

### Build & preview

```bash
npm run build    # compile to the dist/ folder (this is what gets deployed)
npm run preview  # serve the built dist/ locally to check it → http://localhost:4173
```

## Deployment (Vercel)

Push to GitHub and import the repo at [vercel.com](https://vercel.com). Vercel
auto-detects Vite (config is also pinned in `vercel.json`):

- **Build command:** `npm run build`
- **Output directory:** `dist`

Every push to the main branch redeploys automatically. To deploy from your
machine instead: `npm i -g vercel && vercel`.

## Project structure

```
index.html        HTML shell: <style> block (all CSS) + the single module entry
src/main.jsx      Build entry — its contents are generated from the files below
vite.config.js    Build config + the plugin that concatenates the .jsx sources
app.jsx           App shell: state (reducer + localStorage), routing, toasts, tweaks
data.jsx          Course definitions + runtime hydration of materials
materials.jsx     Loads/parses the real course files; builds multilingual content
i18n.jsx          UI string dictionary (EN / ZH / MS) + language list
icons.jsx         Language context helpers (useTr/useU) + SVG icon set
chrome.jsx        Top nav, sidebar, progress bar, dropdowns, password modal, toasts
dashboard.jsx     The journey dashboard (grid of lesson/test cards)
lessonPlayer.jsx  Lesson player: slides → PDF → video → quiz (3 layout variants)
slides.jsx        Slide-deck viewer (Office Online embed)
quiz.jsx          Reusable MCQ engine + results screen
testflow.jsx      Final test, completion screen, and printable e-certificate
tweaks-panel.jsx  Reusable dev "tweaks" panel (layout/progression controls)
public/materials/ Course content, one folder per language: en/, ch/, ms/
```

The `.jsx` sources are concatenated in dependency order (helpers and data
first, then UI components, then `app.jsx` last) — that order lives in the
`SOURCES` array in `vite.config.js`. Anything in `public/` is copied to the
site root as-is at build time, which is why the materials are served at
`/materials/...`.

## Course materials

All learning content lives under `public/materials/<lang>/` (`en`, `ch`, `ms`) and is
loaded at runtime — nothing is hardcoded in the app. Each language folder
contains the same set of files:

| File          | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `1.pptx` …    | Slide deck for lesson _N_                                       |
| `1.pdf` …     | PDF reading for lesson _N_                                      |
| `1.csv` …     | Quiz question bank for lesson _N_                               |
| `test.csv`    | Question bank for the final test                               |
| `videos.csv`  | Rows of `lessonNumber,youtubeURL`                              |

**Quiz CSV format** — header `question,a,b,c,d`, where column **`a` is always
the correct answer**. The app shuffles the options at runtime (with a shared
seed so the three languages stay aligned), so the correct answer is not always
shown in position A.

To update content, replace the files in each language folder — no code changes
are needed.

## Configuration

A few constants live in the code rather than a config file:

- **Schedule & lesson metadata** (unlock/due dates, titles, week numbers) —
  `data.jsx` (`LESSONS` and `FINAL_TEST`).
- **Pass mark** — `PASS_MARK` in `data.jsx` (default `0.8` = 80%).
- **UI strings** — `i18n.jsx`.

## Developer tweaks panel

A floating panel (bottom-right) provides demo controls without touching code:

- **Simulate date** — jump "today" forward to unlock the next lesson/test, so
  the date-gated flow can be demonstrated without waiting.
- **Auto-complete / reset progression** — fast-forward or clear all progress.
- **Lesson layout** — switch between three player layouts: _Classic_ (tabbed),
  _Stepper_ (side rail), and _Focused_ (distraction-free).

## Data & persistence

There is no backend. All learner state (language, theme, progress, quiz
attempts, notifications) is stored in the browser under the `localStorage` key
`iora-lms-v2`. Clearing site data resets the app to a fresh state.
