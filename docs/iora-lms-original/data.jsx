// data.jsx — iORA LMS course definitions.
// The journey is six tiles: Lesson 1 → Test 1 → Lesson 2 → Test 2 → Lesson 3 → Test 3.
// Lessons are learning-only (slides → PDF → video). Each Test is the assessment for
// its unit: a 60-question bank from materials/<lang>/<n>.csv, of which 40 are picked
// at random (in random order) per attempt.
//
// window.COURSES    = ordered list of the 3 lessons (parts filled in after hydration)
// window.TESTS      = ordered list of the 3 tests (question banks filled after hydration)
// window.hydrateMaterials() = async loader, awaited by app.jsx before first render.

const L = window.t3;

// ---- assessment rules ------------------------------------------------------
const PASS_MARK = 0.75;            // 30 / 40 questions
const TEST_TOTAL = 40;             // questions presented per attempt
const TEST_BANK_SIZE = 60;         // questions authored per bank
const TEST_DURATION_SEC = 30 * 60; // 30-minute timer
const MAX_TEST_ATTEMPTS = 3;       // locked out after the 3rd failed attempt
const UNLOCK_DELAY_DAYS = 14;      // 2 weeks before the next lesson opens

// ---- lesson metadata -------------------------------------------------------
// `mat` is the file stem used under materials/<lang>/ (e.g. 1.pptx, 1.pdf, 1.csv,
// and row "1" in videos.csv).
const LESSONS = [
  {
    id: "lesson1",
    index: 1,
    mat: 1,
    week: 4,
    unlock: "11/06/2026",
    due: "02/07/2026",
    title: L("New Employee Training", "新员工培训", "Latihan Pekerja Baharu"),
    summary: L(
      "Brand, service standards and your first week on the floor.",
      "品牌、服务标准以及您在卖场的第一周。",
      "Jenama, piawaian perkhidmatan dan minggu pertama anda.",
    ),
    pdfName: L(
      "New Employee Handbook.pdf",
      "新员工手册.pdf",
      "Buku Panduan Pekerja Baharu.pdf",
    ),
    videoTitle: L(
      "Welcome to the iORA family",
      "欢迎加入 iORA 大家庭",
      "Selamat datang ke keluarga iORA",
    ),
  },
  {
    id: "lesson2",
    index: 2,
    mat: 2,
    week: 6,
    unlock: "25/06/2026",
    due: "16/07/2026",
    title: L(
      "Fitting & Storeroom Training",
      "试衣间与仓库培训",
      "Latihan Bilik Mencuba & Stor",
    ),
    summary: L(
      "Fitting room service, stockroom organisation and replenishment.",
      "试衣间服务、仓库整理与补货。",
      "Perkhidmatan bilik mencuba, susunan stor dan penambahan stok.",
    ),
    pdfName: L(
      "Stockroom Operations Guide.pdf",
      "仓库运营指南.pdf",
      "Panduan Operasi Stor.pdf",
    ),
    videoTitle: L(
      "Behind the scenes: the stockroom",
      "幕后：仓库运作",
      "Di sebalik tabir: stor",
    ),
  },
  {
    id: "lesson3",
    index: 3,
    mat: 3,
    week: 8,
    unlock: "09/07/2026",
    due: "30/07/2026",
    title: L(
      "Cashier's Responsibility Training",
      "收银员职责培训",
      "Latihan Tanggungjawab Juruwang",
    ),
    summary: L(
      "The POS/SWAIN system, payments, refunds and end-of-day cash-up.",
      "POS/SWAIN 系统、付款、退款与日终结账。",
      "Sistem POS/SWAIN, pembayaran, bayaran balik dan tutup akaun.",
    ),
    pdfName: L(
      "Cashier & POS Manual.pdf",
      "收银与 POS 手册.pdf",
      "Manual Juruwang & POS.pdf",
    ),
    videoTitle: L(
      "Mastering the iORA till",
      "掌握 iORA 收银台",
      "Menguasai kaunter iORA",
    ),
  },
];

// ---- test metadata ---------------------------------------------------------
// Test N is the assessment for Lesson N and draws from materials/<lang>/<N>.csv.
const TEST_DEFS = LESSONS.map((les) => ({
  id: "test" + les.index,
  index: les.index,
  mat: les.mat,
  lessonId: les.id,
  title: L(
    "Test " + les.index,
    "测验 " + les.index,
    "Ujian " + les.index,
  ),
  summary: L(
    `Assessment for Unit ${les.index}. ${TEST_TOTAL} questions · ${TEST_DURATION_SEC / 60} minutes · pass ${Math.round(PASS_MARK * TEST_TOTAL)}/${TEST_TOTAL}.`,
    `单元 ${les.index} 评估。${TEST_TOTAL} 题 · ${TEST_DURATION_SEC / 60} 分钟 · 及格 ${Math.round(PASS_MARK * TEST_TOTAL)}/${TEST_TOTAL}。`,
    `Penilaian Unit ${les.index}. ${TEST_TOTAL} soalan · ${TEST_DURATION_SEC / 60} minit · lulus ${Math.round(PASS_MARK * TEST_TOTAL)}/${TEST_TOTAL}.`,
  ),
}));

// Exposed immediately with empty content; hydrateMaterials() fills them in.
const COURSES = LESSONS.map((m) => ({ ...m, parts: [] }));
const TESTS = TEST_DEFS.map((m) => ({ ...m, bank: [] }));

// ---- runtime hydration from /materials -------------------------------------
window.hydrateMaterials = async function hydrateMaterials() {
  const M = window.MAT;
  const ov = window.IORA_OVERRIDES ? window.IORA_OVERRIDES.getAll() : {};

  // videos.csv lives once per language folder; load all up front.
  const videos = await M.fetchCSVAllLangs("videos.csv");

  await Promise.all(
    COURSES.map(async (course) => {
      // slides / pdf urls (admin overrides win, applied to all languages)
      const slideUrls = ov[`pptx:${course.mat}`]
        ? M.sameUrlAllLangs(ov[`pptx:${course.mat}`])
        : M.langUrls(`${course.mat}.pptx`);
      const pdfUrls = ov[`pdf:${course.mat}`]
        ? M.sameUrlAllLangs(ov[`pdf:${course.mat}`])
        : M.langUrls(`${course.mat}.pdf`);
      // video: override is a single URL/id applied to all languages
      const videoMap = ov[`video:${course.mat}`]
        ? M.sameIdAllLangs(M.youtubeId(ov[`video:${course.mat}`]))
        : M.buildVideoMap(videos, course.mat);
      course.parts = [
        { type: "slides", deck: slideUrls },
        { type: "pdf", name: course.pdfName, url: pdfUrls },
        { type: "video", youtubeId: videoMap, title: course.videoTitle },
      ];
    }),
  );

  await Promise.all(
    TESTS.map(async (test) => {
      let csvByLang;
      if (ov[`csv:${test.mat}`]) {
        // a single uploaded CSV applies to every language
        const rows = M.parseCSV(ov[`csv:${test.mat}`]);
        csvByLang = { en: rows, zh: rows, ms: rows };
      } else {
        csvByLang = await M.fetchCSVAllLangs(`${test.mat}.csv`);
      }
      test.bank = M.buildMCQ(csvByLang, 900 + test.mat);
    }),
  );
};

window.COURSES = COURSES;
window.TESTS = TESTS;
window.PASS_MARK = PASS_MARK;
window.TEST_TOTAL = TEST_TOTAL;
window.TEST_BANK_SIZE = TEST_BANK_SIZE;
window.TEST_DURATION_SEC = TEST_DURATION_SEC;
window.MAX_TEST_ATTEMPTS = MAX_TEST_ATTEMPTS;
window.UNLOCK_DELAY_DAYS = UNLOCK_DELAY_DAYS;
