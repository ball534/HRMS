// testflow.jsx — unit tests (timed, attempt-limited), feedback survey, journey
// complete screen, printable certificate, and the admin console.
// Relies on globals: Icon, useTr, useU, Quiz, MAT, COURSES, TESTS, IORA_OVERRIDES,
//   PASS_MARK, TEST_TOTAL, TEST_DURATION_SEC, MAX_TEST_ATTEMPTS.

// ---------- test stepper rail (shared "stepper theme") ----------
function TestRail({ phaseIdx }) {
  const u = useU();
  const steps = [
    { label: "testInstructions", icon: "file" },
    { label: "quiz", icon: "quiz" },
    { label: "seeResults", icon: "award" },
  ];
  return (
    <nav className="step-rail">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={
            "rail-item static" +
            (i === phaseIdx ? " active" : "") +
            (i < phaseIdx ? " done" : "") +
            (i > phaseIdx ? " locked" : "")
          }
        >
          <span className="rail-ic">
            {i < phaseIdx ? (
              <Icon name="check" size={16} />
            ) : (
              <Icon name={s.icon} size={18} />
            )}
          </span>
          <span className="rail-txt">
            <b>{u(s.label)}</b>
          </span>
          {i < steps.length - 1 && <span className="rail-line" />}
        </div>
      ))}
    </nav>
  );
}

// ---------- result screen ----------
function ResultView({ result, passNeeded, locked, isFinal, onContinue, onRetry, onExit }) {
  const u = useU();
  const passed = result.correct >= passNeeded;
  return (
    <div className="quiz-result">
      <div className={"result-ring " + (passed ? "pass" : "fail")}>
        <Icon name={passed ? "checkCircle" : "alert"} size={48} />
      </div>
      <h2>{passed ? u("passed") : u("failed")}</h2>
      <div className="result-score">
        {u("yourScore")}: <b>{result.correct}/{result.total}</b>
        <span className="result-meta">
          ({u("passMark")} {passNeeded}/{result.total})
        </span>
      </div>
      {result.timedOut && !passed && (
        <p className="result-msg">{u("timeUpMsg")}</p>
      )}
      <p className="result-msg">{passed ? u("passedMsg") : u("failedMsg")}</p>
      {!passed && locked && (
        <div className="hr-flag">
          <Icon name="alert" size={18} /> {u("lockedOutMsg")}
        </div>
      )}
      <div className="result-actions">
        {passed ? (
          <button className="btn btn-green" onClick={onContinue}>
            {isFinal ? u("surveyTitle") : u("backToDash")}{" "}
            <Icon name="arrowRight" size={18} />
          </button>
        ) : locked ? (
          <button className="btn btn-ghost" onClick={onExit}>
            {u("backToDash")}
          </button>
        ) : (
          <button className="btn btn-blue" onClick={onRetry}>
            <Icon name="refresh" size={18} /> {u("tryAgain")}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- test screen (intro → exam → result) ----------
function TestScreen({ test, state, dispatch, onExit, onPassedUnit, onPassedFinal }) {
  const tr = useTr();
  const u = useU();
  const ts = state.tests[test.id] || { attempts: 0, passed: false, locked: false };
  const isFinal = test.index === TESTS.length;
  const passNeeded = Math.ceil(PASS_MARK * TEST_TOTAL);

  const [phase, setPhase] = React.useState("intro"); // intro | exam | result
  const [examQs, setExamQs] = React.useState(null);
  const [result, setResult] = React.useState(null);

  const phaseIdx = phase === "intro" ? 0 : phase === "exam" ? 1 : 2;
  const attemptsLeft = Math.max(0, MAX_TEST_ATTEMPTS - ts.attempts);

  const begin = () => {
    setExamQs(MAT.sampleQuestions(test.bank, TEST_TOTAL));
    setResult(null);
    setPhase("exam");
  };

  const handleSubmit = (res) => {
    const passed = res.correct >= passNeeded;
    const score = res.total ? res.correct / res.total : 0;
    if (passed) dispatch({ type: "passTest", testId: test.id, score });
    else dispatch({ type: "failTest", testId: test.id, score });
    setResult(res);
    setPhase("result");
  };

  const header = (
    <div className="player-head">
      <button className="btn btn-ghost back" onClick={onExit}>
        <Icon name="arrowLeft" size={18} /> {u("backToDash")}
      </button>
      <div className="player-titles">
        <span className="player-kicker">
          {u("test")} {test.index}
        </span>
        <h1>{tr(test.title)}</h1>
      </div>
    </div>
  );

  let body;
  if (phase === "intro") {
    if (ts.locked) {
      body = (
        <div className="quiz-result">
          <div className="result-ring fail">
            <Icon name="lock" size={44} />
          </div>
          <h2>{u("lockedOut")}</h2>
          <p className="result-msg">{u("lockedOutMsg")}</p>
          <div className="result-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              {u("backToDash")}
            </button>
          </div>
        </div>
      );
    } else if (ts.passed) {
      body = (
        <div className="quiz-result">
          <div className="result-ring pass">
            <Icon name="checkCircle" size={44} />
          </div>
          <h2>{u("alreadyPassed")}</h2>
          <p className="result-msg">{u("alreadyPassedMsg")}</p>
          <div className="result-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              {u("backToDash")}
            </button>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="test-intro">
          <div className="ti-icon">
            <Icon name="quiz" size={40} />
          </div>
          <h2>{u("testInstructions")}</h2>
          <p className="ti-body">{u("testIntro")}</p>
          <div className="ti-facts">
            <div className="ti-fact">
              <Icon name="quiz" size={18} />
              <span>{u("questionsPicked")}</span>
            </div>
            <div className="ti-fact">
              <Icon name="clock" size={18} />
              <span>{TEST_DURATION_SEC / 60} min</span>
            </div>
            <div className="ti-fact">
              <Icon name="checkCircle" size={18} />
              <span>
                {u("passMark")}: {passNeeded}/{TEST_TOTAL}
              </span>
            </div>
            <div className="ti-fact">
              <Icon name="refresh" size={18} />
              <span>
                {u("attemptsLeft")}: {attemptsLeft}
              </span>
            </div>
          </div>
          <button className="btn btn-blue lg" onClick={begin}>
            {u("beginTest")} <Icon name="arrowRight" size={18} />
          </button>
        </div>
      );
    }
  } else if (phase === "exam") {
    body = (
      <Quiz
        questions={examQs}
        durationSec={TEST_DURATION_SEC}
        attemptNo={ts.attempts + 1}
        onSubmit={handleSubmit}
      />
    );
  } else {
    body = (
      <ResultView
        result={result}
        passNeeded={passNeeded}
        locked={ts.locked}
        isFinal={isFinal}
        onContinue={() => (isFinal ? onPassedFinal() : onPassedUnit())}
        onRetry={() => setPhase("intro")}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="player player-stepper test-screen">
      {header}
      <div className="stepper-body">
        <div className="stepper-content">
          <div className="part">{body}</div>
        </div>
        <TestRail phaseIdx={phaseIdx} />
      </div>
    </div>
  );
}

// ---------- feedback survey ----------
function StarRow({ value, onChange }) {
  const u = useU();
  return (
    <div className="srv-scale">
      <span className="srv-end">{u("rateLow")}</span>
      <div className="srv-dots">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={"srv-dot" + (n <= value ? " on" : "")}
            aria-label={String(n)}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="srv-end">{u("rateHigh")}</span>
    </div>
  );
}

function SurveyScreen({ state, dispatch, onDone }) {
  const u = useU();
  const init = (state.survey && state.survey.ratings) || {};
  const [ratings, setRatings] = React.useState({
    clarity: init.clarity || 0,
    pace: init.pace || 0,
    usefulness: init.usefulness || 0,
  });
  const [comment, setComment] = React.useState(
    (state.survey && state.survey.comment) || "",
  );
  const [err, setErr] = React.useState(false);
  const set = (k, v) => setRatings((r) => ({ ...r, [k]: v }));
  const submit = () => {
    if (!ratings.clarity || !ratings.pace || !ratings.usefulness) {
      setErr(true);
      return;
    }
    dispatch({ type: "submitSurvey", ratings, comment });
    onDone();
  };
  const Q = ({ k, label }) => (
    <div className="srv-q">
      <div className="srv-label">{u(label)}</div>
      <StarRow value={ratings[k]} onChange={(v) => set(k, v)} />
    </div>
  );
  return (
    <div className="survey-screen">
      <div className="survey-card">
        <div className="ti-icon">
          <Icon name="award" size={36} />
        </div>
        <h1>{u("surveyTitle")}</h1>
        <p className="ti-body">{u("surveyIntro")}</p>
        <Q k="clarity" label="surveyClarity" />
        <Q k="pace" label="surveyPace" />
        <Q k="usefulness" label="surveyUseful" />
        <div className="srv-q">
          <div className="srv-label">{u("surveyComment")}</div>
          <textarea
            className="srv-text"
            rows={4}
            value={comment}
            placeholder={u("surveyCommentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        {err && <div className="srv-err">{u("surveyRequired")}</div>}
        <button className="btn btn-blue lg btn-block" onClick={submit}>
          {u("surveySubmit")} <Icon name="arrowRight" size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------- journey complete ----------
function TestComplete({ state, surveyDone, onCert, onSurvey, onHome }) {
  const u = useU();
  return (
    <div className="complete-screen">
      <div className="complete-card">
        <div className="complete-burst">
          <Icon name="award" size={56} />
        </div>
        <h1>{u("congrats")}</h1>
        <p className="complete-body">{u("congratsBody")}</p>
        <div className="sync-badge">
          <Icon name="checkCircle" size={18} /> {u("syncedToHr")}
        </div>
        <div className="complete-actions">
          <button className="btn btn-ghost" onClick={onHome}>
            {u("backHome")}
          </button>
          {surveyDone ? (
            <button className="btn btn-blue lg" onClick={onCert}>
              <Icon name="download" size={20} /> {u("downloadCert")}
            </button>
          ) : (
            <button className="btn btn-blue lg" onClick={onSurvey}>
              <Icon name="award" size={20} /> {u("takeSurvey")}
            </button>
          )}
        </div>
        {!surveyDone && (
          <div className="cert-gate-note">
            <Icon name="alert" size={16} /> {u("certNeedsSurvey")}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- certificate ----------
function Certificate({ state, onClose }) {
  const u = useU();
  const today = new Date().toLocaleDateString(
    state.lang === "zh" ? "zh-CN" : state.lang === "ms" ? "ms-MY" : "en-GB",
    { year: "numeric", month: "long", day: "numeric" },
  );
  return (
    <div className="cert-overlay">
      <div className="cert-toolbar no-print">
        <button className="btn btn-ghost" onClick={onClose}>
          <Icon name="x" size={18} /> {u("cancel")}
        </button>
        <button className="btn btn-blue" onClick={() => window.print()}>
          <Icon name="download" size={18} /> {u("print")}
        </button>
      </div>
      <div className="cert-sheet">
        <div className="cert-border">
          <div className="cert-brand">iORA</div>
          <div className="cert-h">{u("certTitle")}</div>
          <div className="cert-line">{u("certPresented")}</div>
          <div className="cert-name">{state.userName}</div>
          <div className="cert-line">{u("certHasDone")}</div>
          <div className="cert-prog">{u("certProgram")}</div>
          <div className="cert-seal">
            <Icon name="award" size={40} />
          </div>
          <div className="cert-foot">
            <div className="cert-foot-col">
              <div className="cert-val">{today}</div>
              <div className="cert-cap">{u("certDate")}</div>
            </div>
            <div className="cert-foot-col">
              <div className="cert-sig">John Doe</div>
              <div className="cert-cap">{u("certSign")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- admin console ----------
function FileRow({ labelKey, ovKey, accept, kind, onUpload, onRevert }) {
  const u = useU();
  const overrides = IORA_OVERRIDES.getAll();
  const has = overrides[ovKey] != null;
  const fileRef = React.useRef(null);
  const [url, setUrl] = React.useState(kind === "video" && has ? overrides[ovKey] : "");

  return (
    <div className="adm-file">
      <div className="adm-file-main">
        <div className="adm-file-name">{u(labelKey)}</div>
        <div className={"adm-file-tag" + (has ? " custom" : "")}>
          {has ? u("adminCustom") : u("adminDefault")}
        </div>
      </div>
      <div className="adm-file-actions">
        {kind === "video" ? (
          <>
            <input
              className="adm-input"
              type="text"
              placeholder="https://youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="btn btn-blue sm"
              disabled={!url.trim()}
              onClick={() => onUpload(ovKey, url.trim(), kind)}
            >
              {u("adminSave")}
            </button>
          </>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) onUpload(ovKey, f, kind);
                e.target.value = "";
              }}
            />
            <button
              className="btn btn-ghost sm"
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              <Icon name="download" size={16} />{" "}
              {has ? u("adminReplace") : u("adminUpload")}
            </button>
          </>
        )}
        {has && (
          <button className="btn btn-ghost sm" onClick={() => onRevert(ovKey)}>
            {u("adminRevert")}
          </button>
        )}
      </div>
    </div>
  );
}

function AdminConsole({ state, dispatch, onExit, onUpload, onRevert }) {
  const u = useU();
  const tr = useTr();
  const tests = state.tests || {};
  const statusOf = (t) =>
    t.locked
      ? u("lockedLabel")
      : t.passed
        ? u("passedLabel")
        : t.attempts > 0
          ? u("inProgress")
          : u("notStarted");
  const survey = state.survey || {};

  return (
    <div className="admin-console">
      <div className="player-head">
        <button className="btn btn-ghost back" onClick={onExit}>
          <Icon name="arrowLeft" size={18} /> {u("backToDash")}
        </button>
        <div className="player-titles">
          <span className="player-kicker">{u("adminAsAdmin")}</span>
          <h1>{u("adminConsole")}</h1>
        </div>
      </div>

      {/* files */}
      <section className="adm-section">
        <h2 className="adm-h">{u("adminFiles")}</h2>
        <p className="adm-hint">{u("adminFilesHint")}</p>
        {COURSES.map((c) => (
          <div key={c.id} className="adm-unit">
            <div className="adm-unit-h">
              {u("adminUnit")} {c.index} — {tr(c.title)}
            </div>
            <FileRow labelKey="adminSlides" ovKey={`pptx:${c.mat}`} accept=".pptx" kind="file" onUpload={onUpload} onRevert={onRevert} />
            <FileRow labelKey="adminPdf" ovKey={`pdf:${c.mat}`} accept=".pdf" kind="file" onUpload={onUpload} onRevert={onRevert} />
            <FileRow labelKey="adminVideo" ovKey={`video:${c.mat}`} accept="" kind="video" onUpload={onUpload} onRevert={onRevert} />
            <FileRow labelKey="adminBank" ovKey={`csv:${c.mat}`} accept=".csv" kind="csv" onUpload={onUpload} onRevert={onRevert} />
          </div>
        ))}
      </section>

      {/* attempts / lockouts */}
      <section className="adm-section">
        <h2 className="adm-h">{u("adminAttempts")}</h2>
        <div className="adm-table">
          {TESTS.map((t) => {
            const ts = tests[t.id] || { attempts: 0, passed: false, locked: false };
            return (
              <div key={t.id} className="adm-trow">
                <div className="adm-tcell name">{tr(t.title)}</div>
                <div className="adm-tcell">
                  {u("attempts")}: {ts.attempts}/{MAX_TEST_ATTEMPTS}
                </div>
                <div className={"adm-tcell status" + (ts.locked ? " locked" : ts.passed ? " ok" : "")}>
                  {statusOf(ts)}
                </div>
                <div className="adm-tcell">
                  <button
                    className="btn btn-ghost sm"
                    disabled={ts.attempts === 0 && !ts.locked}
                    onClick={() => dispatch({ type: "resetTestAttempts", testId: t.id })}
                  >
                    <Icon name="refresh" size={15} /> {u("adminResetAttempts")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* survey responses */}
      <section className="adm-section">
        <h2 className="adm-h">{u("adminSurveyResponses")}</h2>
        {survey.done ? (
          <div className="adm-survey">
            <div className="adm-srow">
              <span>{u("surveyClarity")}</span>
              <b>{survey.ratings.clarity}/5</b>
            </div>
            <div className="adm-srow">
              <span>{u("surveyPace")}</span>
              <b>{survey.ratings.pace}/5</b>
            </div>
            <div className="adm-srow">
              <span>{u("surveyUseful")}</span>
              <b>{survey.ratings.usefulness}/5</b>
            </div>
            {survey.comment && (
              <div className="adm-comment">“{survey.comment}”</div>
            )}
          </div>
        ) : (
          <p className="adm-hint">{u("adminNoSurvey")}</p>
        )}
      </section>
    </div>
  );
}

Object.assign(window, {
  TestScreen,
  SurveyScreen,
  TestComplete,
  Certificate,
  AdminConsole,
});
