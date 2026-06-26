import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The app's .jsx files were originally loaded as separate <script> tags that all
// shared one global scope (no import/export). To keep that exact model — but
// compiled ahead of time instead of transpiled in the browser by Babel — we
// concatenate them, in the SAME order, into the single entry module below.
// Edit these source files in the project root; do NOT edit src/main.jsx.
const SOURCES = [
  "tweaks-panel.jsx",
  "i18n.jsx",
  "materials.jsx",
  "data.jsx",
  "icons.jsx",
  "quiz.jsx",
  "slides.jsx",
  "chrome.jsx",
  "dashboard.jsx",
  "lessonPlayer.jsx",
  "testflow.jsx",
  "app.jsx",
];

const norm = (p) => p.replace(/\\/g, "/");
const ENTRY = norm(path.resolve(__dirname, "src/main.jsx"));

// Replaces the placeholder entry module with React imports + all source files
// concatenated into one module scope. addWatchFile() makes editing any source
// re-run this transform (so `npm run dev` hot-reloads on every source change).
function ioraConcatPlugin() {
  return {
    name: "iora-concat-jsx",
    enforce: "pre",
    transform(_code, id) {
      if (norm(id.split("?")[0]) !== ENTRY) return null;
      const header =
        "import * as React from 'react';\n" +
        "import * as ReactDOM from 'react-dom/client';\n" +
        "window.React = React;\n" +
        "window.ReactDOM = ReactDOM;\n";
      const body = SOURCES.map((file) => {
        const abs = path.resolve(__dirname, file);
        this.addWatchFile(abs);
        return `\n/* ===== ${file} ===== */\n` + fs.readFileSync(abs, "utf8");
      }).join("\n");
      return { code: header + body, map: null };
    },
  };
}

export default defineConfig({
  plugins: [ioraConcatPlugin()],
  // Use the modern JSX runtime so JSX works without React having to be in scope.
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
});
