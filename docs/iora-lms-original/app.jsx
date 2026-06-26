// app.jsx — state (reducer + localStorage), routing, toasts, tweaks, screenshot
// guard, App shell. Relies on globals from all prior files.

const { useReducer, useState, useEffect, useMemo, useCallback, useRef } = React;
const LS_KEY = "iora-lms-v3";

const LESSON_IDS = ["lesson1", "lesson2", "lesson3"];
const TEST_IDS = ["test1", "test2", "test3"];
const PART_KEYS = ["slides", "pdf", "video"];

const emptyLesson = () => ({ parts: {} });
const emptyTest = () => ({
  attempts: 0,
  passed: false,
  bestScore: 0,
  locked: false,
  completedAt: null,
});

function makeInitial() {
  return {
    lang: "en",
    theme: "light",
    userName: "Lewis Ball",
    simDate: null, // null = real device date; otherwise a timestamp (simulated "today")
    role: "user", // "user" | "admin" (tweaks panel toggle)
    progress: {
      lesson1: emptyLesson(),
      lesson2: emptyLesson(),
      lesson3: emptyLesson(),
    },
    tests: { test1: emptyTest(), test2: emptyTest(), test3: emptyTest() },
    survey: {
      done: false,
      ratings: { clarity: 0, pace: 0, usefulness: 0 },
      comment: "",
    },
    notifications: [
      {
        id: "u1",
        kind: "info",
        read: false,
        time: "just now",
        text: {
          en: "Lesson 1 is now available",
          zh: "课程 1 已开放",
          ms: "Pelajaran 1 kini tersedia",
        },
      },
    ],
    hrEvents: [
      {
        at: Date.now(),
        type: "enrolled",
        detail: "Auto-enrolled in onboarding journey",
      },
    ],
  };
}

function load() {
  try {
    const r = localStorage.getItem(LS_KEY);
    if (r) return { ...makeInitial(), ...JSON.parse(r) };
  } catch (e) {}
  return makeInitial();
}

const idxOfTest = (testId) => TEST_IDS.indexOf(testId) + 1;
const notif = (en, zh, ms, kind = "done") => ({
  id: kind + Date.now() + Math.random().toString(36).slice(2, 6),
  kind,
  read: false,
  time: "just now",
  text: { en, zh, ms },
});

function reducer(s, a) {
  switch (a.type) {
    case "setLang":
      return { ...s, lang: a.lang };
    case "setSimDate":
      return { ...s, simDate: a.value };
    case "setTheme":
      return { ...s, theme: a.theme };
    case "setRole":
      return { ...s, role: a.role };
    case "readAllNotifs":
      return {
        ...s,
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
      };
    case "completePart": {
      const p = { ...s.progress };
      const parts = { ...p[a.lessonId].parts, [a.part]: true };
      p[a.lessonId] = { ...p[a.lessonId], parts };
      const idx = LESSON_IDS.indexOf(a.lessonId) + 1;
      const justFinished = PART_KEYS.every((k) => parts[k]);
      const extra = justFinished
        ? {
            notifications: [
              notif(
                `Lesson ${idx} completed`,
                `课程 ${idx} 已完成`,
                `Pelajaran ${idx} selesai`,
              ),
              ...s.notifications,
            ],
            hrEvents: [
              ...s.hrEvents,
              {
                at: Date.now(),
                type: "lesson_complete",
                detail: `Lesson ${idx} completed`,
              },
            ],
          }
        : {};
      return { ...s, progress: p, ...extra };
    }
    case "passTest": {
      const idx = idxOfTest(a.testId);
      const today = s.simDate || Date.now();
      const prev = s.tests[a.testId];
      const tests = {
        ...s.tests,
        [a.testId]: {
          attempts: (prev.attempts || 0) + 1,
          passed: true,
          bestScore: Math.max(prev.bestScore || 0, a.score),
          locked: false,
          completedAt: prev.completedAt || today,
        },
      };
      return {
        ...s,
        tests,
        notifications: [
          notif(
            `Test ${idx} passed`,
            `测验 ${idx} 已通过`,
            `Ujian ${idx} lulus`,
          ),
          ...s.notifications,
        ],
        hrEvents: [
          ...s.hrEvents,
          {
            at: Date.now(),
            type: "test_passed",
            detail: `Test ${idx} passed (${Math.round(a.score * 100)}%)`,
          },
        ],
      };
    }
    case "failTest": {
      const idx = idxOfTest(a.testId);
      const prev = s.tests[a.testId];
      const attempts = (prev.attempts || 0) + 1;
      const locked = attempts >= window.MAX_TEST_ATTEMPTS;
      const tests = {
        ...s.tests,
        [a.testId]: {
          ...prev,
          attempts,
          locked,
          bestScore: Math.max(prev.bestScore || 0, a.score),
        },
      };
      const hr = [
        ...s.hrEvents,
        {
          at: Date.now(),
          type: locked ? "retake_lockout" : "test_failed",
          detail: locked
            ? `Test ${idx}: ${attempts} failed attempts — locked, HR escalation`
            : `Test ${idx} failed attempt ${attempts}`,
        },
      ];
      const notes = locked
        ? [
            notif(
              `Test ${idx} locked after 3 attempts`,
              `测验 ${idx} 在 3 次尝试后已锁定`,
              `Ujian ${idx} dikunci selepas 3 percubaan`,
              "alert",
            ),
            ...s.notifications,
          ]
        : s.notifications;
      return { ...s, tests, hrEvents: hr, notifications: notes };
    }
    case "resetTestAttempts": {
      const idx = idxOfTest(a.testId);
      const prev = s.tests[a.testId];
      return {
        ...s,
        tests: { ...s.tests, [a.testId]: { ...prev, attempts: 0, locked: false } },
        hrEvents: [
          ...s.hrEvents,
          {
            at: Date.now(),
            type: "attempts_reset",
            detail: `Admin reset attempts for Test ${idx}`,
          },
        ],
      };
    }
    case "submitSurvey": {
      return {
        ...s,
        survey: { done: true, ratings: a.ratings, comment: a.comment || "" },
        hrEvents: [
          ...s.hrEvents,
          { at: Date.now(), type: "survey_submitted", detail: "Feedback survey submitted" },
        ],
      };
    }
    case "devCompleteAll": {
      const p = {};
      LESSON_IDS.forEach((id) => {
        p[id] = { parts: { slides: true, pdf: true, video: true } };
      });
      const t = {};
      const today = s.simDate || Date.now();
      TEST_IDS.forEach((id) => {
        t[id] = {
          attempts: 1,
          passed: true,
          bestScore: 1,
          locked: false,
          completedAt: today,
        };
      });
      return {
        ...s,
        progress: p,
        tests: t,
        survey: {
          done: true,
          ratings: { clarity: 5, pace: 5, usefulness: 5 },
          comment: "(demo auto-fill)",
        },
        hrEvents: [
          ...s.hrEvents,
          {
            at: Date.now(),
            type: "journey_complete",
            detail: "All lessons & tests auto-completed (demo)",
          },
        ],
      };
    }
    case "reset":
      return makeInitial();
    default:
      return s;
  }
}

// ---- static config (font) ----
const TWEAK_DEFAULTS = { font: "Public Sans" };

const FONT_STACKS = {
  "Public Sans": "'Public Sans', system-ui, sans-serif",
  Figtree: "'Figtree', system-ui, sans-serif",
  Mulish: "'Mulish', system-ui, sans-serif",
  "system-ui": "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- screenshot guard (best-effort web deterrents) ----
function ScreenGuard() {
  const u = useU();
  const [hidden, setHidden] = useState(false);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    // Ignore blur caused by focusing an embedded iframe (video / slides / PDF) —
    // that's interaction with our own content, not the user leaving the page.
    const hide = () => {
      if (
        document.activeElement &&
        document.activeElement.tagName === "IFRAME"
      )
        return;
      setHidden(true);
    };
    const show = () => setHidden(false);
    const onVis = () => setHidden(document.hidden);
    const onCtx = (e) => {
      if (e.target.closest && e.target.closest(".cert-overlay")) return;
      e.preventDefault();
    };
    const onCopy = (e) => {
      if (e.target.closest && e.target.closest(".protect")) e.preventDefault();
    };
    const onKey = (e) => {
      const k = e.key || "";
      if (k === "PrintScreen") {
        try {
          navigator.clipboard && navigator.clipboard.writeText("");
        } catch (_) {}
        setFlash(true);
        setTimeout(() => setFlash(false), 700);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    window.addEventListener("contextmenu", onCtx);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("keyup", onKey);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      window.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <>
      {hidden && (
        <div className="screen-shield">
          <Icon name="lock" size={40} />
          <div className="ss-title">{u("shieldMsg")}</div>
          <div className="ss-sub">{u("shieldSub")}</div>
        </div>
      )}
      {flash && <div className="ss-flash" />}
    </>
  );
}

function App() {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState({ screen: "dash" });
  const [pwOpen, setPwOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [matVersion, setMatVersion] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {}
  }, [state]);

  const pushToast = useCallback((text, icon = "checkCircle", kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { id, text, icon, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3400);
  }, []);

  const dispatch = useCallback(
    (a) => {
      switch (a.type) {
        case "openPw":
          setPwOpen(true);
          return;
        case "logout":
          pushToast(
            { en: "Logged out (demo)", zh: "已退出（演示）", ms: "Log keluar (demo)" },
            "logout",
          );
          return;
        default:
          rawDispatch(a);
      }
    },
    [pushToast],
  );

  // ---- admin: file overrides ----
  const reloadMaterials = useCallback(() => {
    window
      .hydrateMaterials()
      .then(() => setMatVersion((v) => v + 1))
      .catch((e) => console.error("[materials] reload failed:", e));
  }, []);

  const onUpload = useCallback(
    (key, fileOrValue, kind) => {
      const done = () => {
        reloadMaterials();
        pushToast(window.UI.adminApplied, "checkCircle");
      };
      if (kind === "video") {
        window.IORA_OVERRIDES.set(key, fileOrValue);
        done();
      } else if (kind === "csv") {
        const reader = new FileReader();
        reader.onload = () => {
          window.IORA_OVERRIDES.set(key, String(reader.result));
          done();
        };
        reader.readAsText(fileOrValue);
      } else {
        // pdf / pptx → data URL
        const reader = new FileReader();
        reader.onload = () => {
          window.IORA_OVERRIDES.set(key, String(reader.result));
          done();
        };
        reader.readAsDataURL(fileOrValue);
      }
    },
    [reloadMaterials, pushToast],
  );

  const onRevert = useCallback(
    (key) => {
      window.IORA_OVERRIDES.remove(key);
      reloadMaterials();
      pushToast(window.UI.adminApplied, "refresh");
    },
    [reloadMaterials, pushToast],
  );

  // ---- derived: gating + journey ----
  const D = useMemo(() => {
    const parseDue = (str) => {
      const [d, m, y] = str.split("/").map(Number);
      return new Date(y, m - 1, d);
    };
    const today = state.simDate ? new Date(state.simDate) : new Date();

    const lessonComplete = (id) =>
      PART_KEYS.every((k) => state.progress[id].parts[k]);
    const lessonPct = (id) =>
      (PART_KEYS.filter((k) => state.progress[id].parts[k]).length /
        PART_KEYS.length) *
      100;

    const testOf = (n) => state.tests["test" + n];
    const lessonUnlockDate = (n) => {
      // lesson n (>=2) opens 2 weeks after test (n-1) is completed
      const prev = testOf(n - 1);
      if (!prev || !prev.passed || !prev.completedAt) return null;
      return new Date(prev.completedAt + window.UNLOCK_DELAY_DAYS * DAY_MS);
    };
    const lessonUnlocked = (n) => {
      if (n === 1) return true;
      const d = lessonUnlockDate(n);
      return !!d && today >= d;
    };
    const testUnlocked = (n) => lessonComplete("lesson" + n);
    const testPassed = (n) => testOf(n).passed;
    const testLocked = (n) => testOf(n).locked;

    const lessonsDone = LESSON_IDS.filter(lessonComplete).length;
    const testsDone = TEST_IDS.filter((id) => state.tests[id].passed).length;
    const unitsDone = lessonsDone + testsDone;
    const overall = (unitsDone / 6) * 100;
    const allTestsPassed = testsDone === 3;

    // build the 6-tile journey
    const fmt = (d) =>
      d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const journey = [];
    COURSES.forEach((c) => {
      const n = c.index;
      const complete = lessonComplete(c.id);
      const unlocked = lessonUnlocked(n);
      let lockHint = null;
      if (!unlocked) {
        const prevPassed = testOf(n - 1) && testOf(n - 1).passed;
        if (!prevPassed) {
          lockHint = window.t3(
            `Pass Test ${n - 1} first`,
            `请先通过测验 ${n - 1}`,
            `Lulus Ujian ${n - 1} dahulu`,
          );
        } else {
          const d = lessonUnlockDate(n);
          const ds = d ? fmt(d) : "";
          lockHint = window.t3(`Opens ${ds}`, `${ds} 开放`, `Buka ${ds}`);
        }
      }
      journey.push({
        key: c.id,
        kind: "lesson",
        index: n,
        item: c,
        title: c.title,
        complete,
        locked: !unlocked,
        pct: lessonPct(c.id),
        lockHint,
        lockedOut: false,
      });

      const test = TESTS[n - 1];
      const tUnlocked = testUnlocked(n);
      const tLocked = testLocked(n);
      const tPassed = testPassed(n);
      let tHint = null;
      if (tLocked) {
        tHint = window.t3("Locked", "已锁定", "Dikunci");
      } else if (!tUnlocked) {
        tHint = window.t3(
          `Finish Lesson ${n} first`,
          `请先完成课程 ${n}`,
          `Selesaikan Pelajaran ${n} dahulu`,
        );
      }
      journey.push({
        key: test.id,
        kind: "test",
        index: n,
        item: test,
        title: test.title,
        complete: tPassed,
        locked: tLocked || (!tUnlocked && !tPassed),
        pct: tPassed ? 100 : 0,
        lockHint: tHint,
        lockedOut: tLocked,
      });
    });

    // first actionable item → "upcoming"
    const upNode = journey.find((nd) => !nd.complete && !nd.locked);
    const upcoming = upNode
      ? {
          title: upNode.title,
          due: upNode.kind === "lesson" ? upNode.item.due : null,
        }
      : null;

    // next still-locked lesson that's waiting on a date (powers the sim tweak)
    let nextLockedDate = null;
    let nextLockedLabel = null;
    for (let n = 2; n <= 3; n++) {
      if (!lessonUnlocked(n)) {
        const d = lessonUnlockDate(n);
        if (d && today < d) {
          nextLockedDate = d;
          nextLockedLabel = "Lesson " + n;
          break;
        }
      }
    }

    return {
      today,
      parseDue,
      lessonComplete,
      lessonPct,
      lessonUnlocked,
      testUnlocked,
      journey,
      overall,
      unitsDone,
      allTestsPassed,
      upcoming,
      nextLockedDate,
      nextLockedLabel,
    };
  }, [state, matVersion]);

  const openItem = (item) => {
    if (TEST_IDS.includes(item.id)) setRoute({ screen: "test", testId: item.id });
    else setRoute({ screen: "lesson", lessonId: item.id });
  };
  const goDash = () => setRoute({ screen: "dash" });

  // cert is gated behind the feedback survey
  const onDownloadCert = () => {
    if (!D.allTestsPassed) return;
    if (!state.survey.done) {
      setRoute({ screen: "survey" });
      return;
    }
    setCertOpen(true);
  };

  // ---- tweak actions ----
  const fmtDate = (d) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const simLabel = state.simDate
    ? fmtDate(D.today) + " (sim)"
    : fmtDate(D.today) + " (live)";
  const advanceToNextUnlock = () => {
    if (!D.nextLockedDate) {
      pushToast(
        { en: "Nothing waiting on a date", zh: "没有等待日期的内容", ms: "Tiada menunggu tarikh" },
        "lock",
      );
      return;
    }
    rawDispatch({ type: "setSimDate", value: D.nextLockedDate.getTime() });
    pushToast(
      {
        en: `Date → ${fmtDate(D.nextLockedDate)} · ${D.nextLockedLabel} unlocked`,
        zh: `日期 → ${fmtDate(D.nextLockedDate)} · ${D.nextLockedLabel} 已解锁`,
        ms: `Tarikh → ${fmtDate(D.nextLockedDate)} · ${D.nextLockedLabel} dibuka`,
      },
      "lock",
    );
  };

  const rootStyle = { "--font": FONT_STACKS[t.font] || FONT_STACKS["Public Sans"] };

  let screen = null;
  if (route.screen === "dash") {
    screen = <Dashboard journey={D.journey} onOpen={openItem} />;
  } else if (route.screen === "lesson") {
    const lesson = COURSES.find((c) => c.id === route.lessonId);
    screen = (
      <LessonPlayer
        key={lesson.id + ":" + matVersion}
        lesson={lesson}
        prog={state.progress[lesson.id]}
        dispatch={dispatch}
        onExit={goDash}
        onLessonDone={() => setTimeout(goDash, 200)}
      />
    );
  } else if (route.screen === "test") {
    const test = TESTS.find((x) => x.id === route.testId);
    screen = (
      <TestScreen
        key={test.id + ":" + matVersion}
        test={test}
        state={state}
        dispatch={dispatch}
        onExit={goDash}
        onPassedUnit={() => setTimeout(goDash, 150)}
        onPassedFinal={() =>
          setRoute({ screen: state.survey.done ? "complete" : "survey" })
        }
      />
    );
  } else if (route.screen === "survey") {
    screen = (
      <SurveyScreen
        state={state}
        dispatch={dispatch}
        onDone={() => {
          pushToast(window.UI.surveyThanks, "checkCircle");
          setRoute({ screen: "complete" });
        }}
      />
    );
  } else if (route.screen === "complete") {
    screen = (
      <TestComplete
        state={state}
        surveyDone={state.survey.done}
        onCert={() => setCertOpen(true)}
        onSurvey={() => setRoute({ screen: "survey" })}
        onHome={goDash}
      />
    );
  } else if (route.screen === "admin") {
    screen = (
      <AdminConsole
        key={matVersion}
        state={state}
        dispatch={dispatch}
        onExit={goDash}
        onUpload={onUpload}
        onRevert={onRevert}
      />
    );
  }

  return (
    <LangCtx.Provider value={state.lang}>
      <div
        className={"app lang-" + state.lang}
        style={rootStyle}
        data-theme={state.theme}
        data-screen-label={"screen-" + route.screen}
      >
        <TopNav state={state} dispatch={dispatch} onNav={(r) => setRoute(r)} />
        <div className="app-body">
          <Sidebar
            pct={D.overall}
            unitsDone={D.unitsDone}
            totalUnits={6}
            upcoming={D.upcoming}
            journeyComplete={D.allTestsPassed}
            surveyDone={state.survey.done}
            onDownloadCert={onDownloadCert}
          />
          <main className="main">{screen}</main>
        </div>

        <PasswordModal
          open={pwOpen}
          onClose={() => setPwOpen(false)}
          onSaved={() => {
            setPwOpen(false);
            pushToast(window.UI.pwUpdated, "checkCircle");
          }}
        />
        {certOpen && <Certificate state={state} onClose={() => setCertOpen(false)} />}
        <Toasts toasts={toasts} />
        <ScreenGuard />

        <TweaksPanel>
          <TweakSection label="View" />
          <TweakRadio
            label="Mode"
            value={state.role}
            options={[
              { value: "user", label: "Learner" },
              { value: "admin", label: "Admin" },
            ]}
            onChange={(v) => {
              rawDispatch({ type: "setRole", role: v });
              setRoute({ screen: v === "admin" ? "admin" : "dash" });
            }}
          />
          {state.role === "admin" && (
            <TweakButton
              label="Open Admin Console"
              onClick={() => setRoute({ screen: "admin" })}
            />
          )}

          <TweakSection label="Progression" />
          <TweakRow label="Today" value={simLabel} />
          <TweakButton
            label={
              D.nextLockedLabel ? "Unlock " + D.nextLockedLabel : "No date wait pending"
            }
            onClick={advanceToNextUnlock}
          />
          <TweakButton
            label="Auto-complete everything"
            secondary
            onClick={() => {
              rawDispatch({ type: "devCompleteAll" });
              pushToast(
                {
                  en: "All lessons & tests completed",
                  zh: "所有课程与测验已完成",
                  ms: "Semua pelajaran & ujian selesai",
                },
                "checkCircle",
              );
            }}
          />
          <TweakButton
            label="Reset progress"
            secondary
            onClick={() => {
              rawDispatch({ type: "reset" });
              goDash();
              pushToast(
                {
                  en: "Progress reset",
                  zh: "进度已重置",
                  ms: "Kemajuan ditetapkan semula",
                },
                "checkCircle",
              );
            }}
          />
        </TweaksPanel>
      </div>
    </LangCtx.Provider>
  );
}

// ---- boot: load real materials before rendering the app ----
function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "#f5f4f0",
        color: "#5f5a52",
        fontFamily: "'Public Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 700,
          fontSize: 40,
          color: "#211e1a",
        }}
      >
        iORA
      </div>
      <div style={{ fontSize: 15 }}>Loading course materials…</div>
    </div>
  );
}

function Boot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window
      .hydrateMaterials()
      .catch((e) => console.error("[materials] hydration failed:", e))
      .finally(() => setReady(true));
  }, []);
  return ready ? <App /> : <LoadingScreen />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Boot />);
