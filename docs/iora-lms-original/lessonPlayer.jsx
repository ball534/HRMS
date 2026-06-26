// lessonPlayer.jsx — lesson player: slides → PDF → video, sequential unlock.
// Lessons are learning-only (the assessment lives in the matching Test). Always
// rendered with the stepper layout. Relies on globals: Icon, useTr, useU, SlideDeck.

const PART_META = [
  { key: "slides", icon: "slides", label: "slides" },
  { key: "pdf", icon: "file", label: "reading" },
  { key: "video", icon: "play", label: "video" },
];

// ---------- PDF ----------
function PdfView({ part, done, onComplete }) {
  const tr = useTr();
  const u = useU();
  const url = tr(part.url); // language-specific PDF URL
  // give the learner a moment with the document before enabling completion
  const [ready, setReady] = React.useState(done);
  React.useEffect(() => {
    if (done) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [url]);
  // Mobile/touch browsers (notably iOS Safari) render only the first page of a
  // PDF embedded in an <iframe> and won't scroll through the rest. On small
  // screens fall back to Google's viewer, which paginates the whole document.
  // (Google's viewer can't load data: URLs, so admin-uploaded PDFs use the raw src.)
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(max-width: 860px)").matches;
  const isData = /^data:/.test(url);
  const src =
    isMobile && !isData
      ? `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}`
      : `${url}#view=FitH`;
  return (
    <div className="part pdf-part">
      <div className="pdf-doc protect" style={{ padding: 0 }}>
        <iframe
          src={src}
          title={tr(part.name)}
          style={{
            width: "100%",
            height: "clamp(360px, 62vh, 560px)",
            border: 0,
            display: "block",
            background: "#fff",
          }}
        />
      </div>
      <div className="pdf-nav">
        <button
          className="btn btn-blue ml"
          disabled={!ready || done}
          onClick={onComplete}
        >
          {done ? (
            <>
              <Icon name="check" size={18} /> {u("partDone")}
            </>
          ) : (
            u("markRead")
          )}
        </button>
      </div>
    </div>
  );
}

// ---------- Video ----------
function VideoView({ part, done, onComplete }) {
  const tr = useTr();
  const u = useU();
  const [ready, setReady] = React.useState(done);
  React.useEffect(() => {
    if (done) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const videoId =
    typeof part.youtubeId === "string" ? part.youtubeId : tr(part.youtubeId);
  // pass the page origin so origin-sensitive videos play; enablejsapi for good measure
  const origin =
    typeof window !== "undefined" && window.location
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : "";
  const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&enablejsapi=1${origin}`;
  return (
    <div className="part video-part">
      <div className="video-frame protect">
        <iframe
          src={embedSrc}
          title={tr(part.title)}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="video-meta">
        <button
          className="btn btn-blue"
          style={{ marginLeft: "auto" }}
          disabled={!ready || done}
          onClick={onComplete}
        >
          {done ? (
            <>
              <Icon name="check" size={18} /> {u("partDone")}
            </>
          ) : ready ? (
            <>
              <Icon name="checkCircle" size={18} /> {u("finishWatching")}
            </>
          ) : (
            u("watchToContinue")
          )}
        </button>
      </div>
    </div>
  );
}

// ---------- part router ----------
function PartContent({ lesson, partIdx, prog, dispatch }) {
  const part = lesson.parts[partIdx];
  const key = PART_META[partIdx].key;
  const done = !!prog.parts[key];
  const complete = () =>
    dispatch({ type: "completePart", lessonId: lesson.id, part: key });

  if (part.type === "slides")
    return <SlideDeck deck={part.deck} done={done} onComplete={complete} />;
  if (part.type === "pdf")
    return <PdfView part={part} done={done} onComplete={complete} />;
  return <VideoView part={part} done={done} onComplete={complete} />;
}

// ---------- part nav helpers ----------
function partUnlocked(prog, idx) {
  if (idx === 0) return true;
  for (let k = 0; k < idx; k++) if (!prog.parts[PART_META[k].key]) return false;
  return true;
}

// ---------- main player (stepper) ----------
function LessonPlayer({ lesson, prog, dispatch, onExit, onLessonDone }) {
  const tr = useTr();
  const u = useU();
  const firstIncomplete = () => {
    for (let k = 0; k < PART_META.length; k++)
      if (!prog.parts[PART_META[k].key] && partUnlocked(prog, k)) return k;
    return PART_META.length - 1;
  };
  const [active, setActive] = React.useState(firstIncomplete());

  const meta = PART_META.map((m, i) => ({
    ...m,
    i,
    done: !!prog.parts[m.key],
    unlocked: partUnlocked(prog, i),
  }));
  const goTo = (i) => {
    if (meta[i].unlocked) setActive(i);
  };

  // auto-advance when a part newly completes; fire onLessonDone after the last one
  const prevDone = React.useRef(prog.parts);
  React.useEffect(() => {
    const justDone = PART_META.find(
      (m, i) => prog.parts[m.key] && !prevDone.current[m.key] && i === active,
    );
    prevDone.current = prog.parts;
    if (justDone) {
      if (active < PART_META.length - 1) {
        const t = setTimeout(() => setActive(active + 1), 550);
        return () => clearTimeout(t);
      }
      // last part complete → lesson done
      const allDone = PART_META.every((m) => prog.parts[m.key]);
      if (allDone && onLessonDone) {
        const t = setTimeout(onLessonDone, 650);
        return () => clearTimeout(t);
      }
    }
  }, [prog.parts]);

  const content = (
    <PartContent
      lesson={lesson}
      partIdx={active}
      prog={prog}
      dispatch={dispatch}
    />
  );

  const header = (
    <div className="player-head">
      <button className="btn btn-ghost back" onClick={onExit}>
        <Icon name="arrowLeft" size={18} /> {u("backToDash")}
      </button>
      <div className="player-titles">
        <span className="player-kicker">
          {u("lesson")} {lesson.index} · {u("week")}{" "}
          {tr({ en: lesson.week, zh: lesson.week, ms: lesson.week })}
          {u("weekSuffix")}
        </span>
        <h1>{tr(lesson.title)}</h1>
      </div>
    </div>
  );

  return (
    <div className="player player-stepper">
      {header}
      <div className="stepper-body">
        <div className="stepper-content">{content}</div>
        <nav className="step-rail">
          {meta.map((m) => (
            <button
              key={m.key}
              className={
                "rail-item" +
                (m.i === active ? " active" : "") +
                (m.done ? " done" : "") +
                (!m.unlocked ? " locked" : "")
              }
              disabled={!m.unlocked}
              onClick={() => goTo(m.i)}
            >
              <span className="rail-ic">
                {m.done ? (
                  <Icon name="check" size={16} />
                ) : !m.unlocked ? (
                  <Icon name="lock" size={14} />
                ) : (
                  <Icon name={m.icon} size={18} />
                )}
              </span>
              <span className="rail-txt">
                <b>{u(m.label)}</b>
                <small>
                  {m.done ? u("partDone") : !m.unlocked ? u("locked") : ""}
                </small>
              </span>
              {m.i < meta.length - 1 && <span className="rail-line" />}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

Object.assign(window, { LessonPlayer, partUnlocked, PART_META });
