// dashboard.jsx — onboarding dashboard: header + grid of the six journey tiles
// (Lesson 1, Test 1, Lesson 2, Test 2, Lesson 3, Test 3). The `journey` array is
// computed by the app from the progress/gating state.
// Relies on globals: Icon, useTr, useU.

function Thumb({ label, locked }) {
  return (
    <div className={"thumb" + (locked ? " locked" : "")}>
      <div className="thumb-stripes" />
      <span className="thumb-tag">{label}</span>
    </div>
  );
}

function JourneyCard({ node, onOpen }) {
  const u = useU();
  const tr = useTr();
  const { kind, index, item, locked, complete, pct, lockHint, lockedOut } = node;
  const isTest = kind === "test";
  const title = isTest ? `${u("test")} ${index}` : `${u("lesson")} ${index}`;
  const barColor = complete ? "var(--green)" : isTest ? "var(--blue)" : "var(--green)";
  return (
    <button
      className={
        "lcard" +
        (locked ? " is-locked" : "") +
        (complete ? " is-done" : "") +
        (isTest ? " is-test" : "")
      }
      onClick={() => !locked && onOpen(item)}
      disabled={locked}
      data-screen-label={"card-" + item.id}
    >
      <div className="lcard-thumb">
        <Thumb
          label={`${isTest ? "test" : "lesson"} ${index}`}
          locked={locked}
        />
        {locked && !complete && (
          <div className={"lock-badge" + (lockedOut ? " danger" : "")}>
            <Icon name="lock" size={15} />
            {lockHint && <span>{tr(lockHint)}</span>}
          </div>
        )}
        {complete && (
          <div className="done-badge">
            <Icon name="check" size={15} />
          </div>
        )}
      </div>
      <div className="lcard-foot">
        <div className="lcard-title">{title}</div>
        <div className="lcard-pct">{Math.round(pct)}%</div>
      </div>
      <div className="lcard-bar">
        <span style={{ width: pct + "%", background: barColor }} />
      </div>
    </button>
  );
}

function Dashboard({ journey, onOpen }) {
  const u = useU();
  return (
    <div className="dash">
      <div className="dash-head">
        <h1>{u("myCourses")}</h1>
      </div>
      <div className="card-grid">
        {journey.map((node) => (
          <JourneyCard key={node.key} node={node} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, JourneyCard });
