// materials.jsx — loads the REAL course materials from /materials/{en,ch,ms}/
// and builds the multilingual content the LMS consumes. This replaces the old
// hardcoded placeholder data so the app stops "hallucinating" its own content.
//
// Folder layout (per language):
//   N.pptx   slide deck for lesson N
//   N.pdf    reading for lesson N
//   N.csv    MCQ bank for lesson N   (header: question,a,b,c,d — column 'a' is correct)
//   test.csv MCQ bank for the final test
//   videos.csv  rows of  lessonNumber,youtubeURL
//
// Exposes window.MAT (helpers used by data.jsx / players). data.jsx defines
// window.hydrateMaterials() which calls these; app.jsx awaits it before render.

const LANG_DIR = { en: "en", zh: "ch", ms: "ms" }; // UI lang code -> materials folder
const MAT_BASE = "materials";
const LANGS3 = ["en", "zh", "ms"];

// Absolute URL for a material file. Absolute (not relative) so it works inside
// the Office Online viewer, <iframe> and <a download> regardless of route.
const matUrl = (lang, file) =>
  new URL(`${MAT_BASE}/${LANG_DIR[lang]}/${file}`, window.location.href).href;

// {en,zh,ms} map of URLs for the same file in each language folder.
const langUrls = (file) => ({
  en: matUrl("en", file),
  zh: matUrl("zh", file),
  ms: matUrl("ms", file),
});

// {en,zh,ms} map that points all three languages at the same URL (used for
// admin-uploaded overrides, which are language-agnostic).
const sameUrlAllLangs = (url) => ({ en: url, zh: url, ms: url });
const sameIdAllLangs = (id) => ({ en: id, zh: id, ms: id });

// Microsoft Office Online embed URL for a (publicly reachable) .pptx.
const officeEmbed = (pptxUrl) =>
  "https://view.officeapps.live.com/op/embed.aspx?src=" +
  encodeURIComponent(pptxUrl);

// ---- CSV parsing (RFC-4180-ish: handles quoted fields, commas & quotes inside) ----
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    inQ = false;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // drop blank rows
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// Fetch a CSV file from all three language folders -> {en:rows|null, zh, ms}.
async function fetchCSVAllLangs(file) {
  const out = {};
  await Promise.all(
    LANGS3.map(async (lng) => {
      try {
        out[lng] = parseCSV(await fetchText(matUrl(lng, file)));
      } catch (e) {
        console.warn(`[materials] could not load ${LANG_DIR[lng]}/${file}:`, e.message);
        out[lng] = null;
      }
    }),
  );
  return out;
}

// ---- seeded RNG so the option shuffle is identical across languages ----
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Deterministic permutation of [0..n-1] from an integer seed (Fisher–Yates).
function permutation(n, seed) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed >>> 0);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build a multilingual MCQ bank from {en,zh,ms} parsed CSVs.
// CSV: header row [question,a,b,c,d...]; column 'a' (data index 1) is the answer.
// Options are shuffled with a per-row seed shared by every language, so the three
// translations stay aligned and the resolved `answer` index is correct.
function buildMCQ(csvByLang, fileSeed) {
  const base = csvByLang.en || csvByLang.zh || csvByLang.ms;
  if (!base || base.length < 2) return [];
  const dataOf = (lng) => {
    const rows = csvByLang[lng] || base;
    return rows.length >= 2 ? rows.slice(1) : base.slice(1);
  };
  const data = { en: dataOf("en"), zh: dataOf("zh"), ms: dataOf("ms") };
  const baseData = base.slice(1);
  const nOpts = Math.max(0, base[0].length - 1); // columns after the question

  return baseData.map((_, r) => {
    const cell = (lng, col) => {
      const rrow = data[lng][r] || baseData[r];
      return rrow && rrow[col] != null ? String(rrow[col]).trim() : "";
    };
    const perm = permutation(nOpts, fileSeed * 1009 + r);
    const q = { en: cell("en", 0), zh: cell("zh", 0), ms: cell("ms", 0) };
    const options = perm.map((origCol) => ({
      en: cell("en", origCol + 1),
      zh: cell("zh", origCol + 1),
      ms: cell("ms", origCol + 1),
    }));
    const answer = perm.indexOf(0); // original column 'a' (index 0) is correct
    return { q, options, answer };
  });
}

// ---- videos.csv -> per-language YouTube id for a given lesson number ----
function youtubeId(url) {
  if (!url) return "";
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : String(url).trim();
}
function buildVideoMap(csvByLang, lessonNo) {
  const pick = (lng) => {
    const rows = csvByLang[lng] || csvByLang.en;
    if (!rows) return "";
    const row = rows.find((r) => String(r[0]).trim() === String(lessonNo));
    return row ? youtubeId(row[1]) : "";
  };
  const en = pick("en");
  return { en, zh: pick("zh") || en, ms: pick("ms") || en };
}

// Randomly pick `n` questions from a bank, in random order (Fisher–Yates).
// Used at the start of each test attempt so 40 of the 60 banked questions are
// presented in a fresh order every time.
function sampleQuestions(bank, n) {
  const arr = bank.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(n, arr.length));
}

window.MAT = {
  LANG_DIR,
  matUrl,
  langUrls,
  sameUrlAllLangs,
  sameIdAllLangs,
  officeEmbed,
  parseCSV,
  fetchCSVAllLangs,
  buildMCQ,
  buildVideoMap,
  youtubeId,
  sampleQuestions,
};

// ---- admin file overrides (front-end only) ---------------------------------
// Uploaded replacement files are kept in localStorage as a map keyed by
// "<type>:<lessonNo>" — e.g. "csv:1", "pdf:2", "pptx:3", "video:1". CSV values
// are raw text; pdf/pptx are data: URLs; video is a YouTube URL/id. hydrateMaterials()
// reads these and prefers them over the bundled files.
const OV_KEY = "iora-overrides-v1";
window.IORA_OVERRIDES = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(OV_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  },
  set(key, value) {
    const all = this.getAll();
    all[key] = value;
    localStorage.setItem(OV_KEY, JSON.stringify(all));
  },
  remove(key) {
    const all = this.getAll();
    delete all[key];
    localStorage.setItem(OV_KEY, JSON.stringify(all));
  },
};
