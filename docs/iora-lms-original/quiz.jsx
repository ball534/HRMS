// quiz.jsx — timed exam engine for the unit tests.
// Presents the (already-sampled) questions one at a time with prev/next navigation,
// a countdown timer, and a single submit. No per-question answer reveal — it's a test.
// Auto-submits when the timer reaches zero. Reports the result once via onSubmit.
// Relies on globals: Icon, useTr, useU.

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

function Quiz({ questions, durationSec, attemptNo, onSubmit }) {
  const tr = useTr();
  const u = useU();
  const total = questions.length;
  const [idx, setIdx] = React.useState(0);
  const [picks, setPicks] = React.useState(() => Array(total).fill(null));
  const [timeLeft, setTimeLeft] = React.useState(durationSec);

  const submittedRef = React.useRef(false);
  const picksRef = React.useRef(picks);
  picksRef.current = picks;

  const finalize = React.useCallback(
    (timedOut) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const p = picksRef.current;
      const correct = questions.reduce(
        (n, q, i) => n + (p[i] === q.answer ? 1 : 0),
        0,
      );
      const answered = p.filter((x) => x != null).length;
      onSubmit({ correct, total, answered, timedOut });
    },
    [questions, total, onSubmit],
  );

  // countdown driven by a fixed deadline so it doesn't drift across re-renders
  React.useEffect(() => {
    const end = Date.now() + durationSec * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) finalize(true);
    };
    tick();
    const h = setInterval(tick, 500);
    return () => clearInterval(h);
  }, [durationSec, finalize]);

  const q = questions[idx];
  const answeredCount = picks.filter((x) => x != null).length;
  const pick = (i) => {
    setPicks((prev) => {
      const next = prev.slice();
      next[idx] = i;
      return next;
    });
  };
  const low = timeLeft <= 5 * 60;

  return (
    <div className="quiz exam protect">
      <div className="quiz-top">
        <span className="quiz-step">
          {u("question")} {idx + 1}{" "}
          <span className="dim">
            {u("of")} {total}
          </span>
        </span>
        <div className="quiz-progress">
          <span style={{ width: ((idx + 1) / total) * 100 + "%" }} />
        </div>
        <span className={"quiz-timer" + (low ? " low" : "")}>
          <Icon name="clock" size={16} /> {fmtClock(timeLeft)}
        </span>
      </div>

      <h2 className="quiz-q">{tr(q.q)}</h2>
      <div className="quiz-opts">
        {q.options.map((opt, i) => {
          const cls = "opt" + (i === picks[idx] ? " picked" : "");
          return (
            <button key={i} className={cls} onClick={() => pick(i)}>
              <span className="opt-mark">{String.fromCharCode(65 + i)}</span>
              <span className="opt-text">{tr(opt)}</span>
              {i === picks[idx] && (
                <Icon name="check" size={18} style={{ marginLeft: "auto" }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="quiz-foot exam-foot">
        <button
          className="btn btn-ghost"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          <Icon name="arrowLeft" size={18} /> {u("prevQuestion")}
        </button>
        <span className="exam-count">
          {answeredCount}/{total} {u("answered")}
        </span>
        {idx + 1 < total ? (
          <button
            className="btn btn-blue"
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          >
            {u("nextQuestion")} <Icon name="arrowRight" size={18} />
          </button>
        ) : (
          <button className="btn btn-green" onClick={() => finalize(false)}>
            {u("submitTest")} <Icon name="check" size={18} />
          </button>
        )}
      </div>
      <div className="exam-hint">{u("reviewBeforeSubmit")}</div>
    </div>
  );
}

window.Quiz = Quiz;
window.fmtClock = fmtClock;
