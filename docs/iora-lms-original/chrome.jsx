// chrome.jsx — TopNav, Sidebar, RabbitProgress, dropdowns, password modal, toasts.
// Relies on globals: Icon, useTr, useU, LANGS, UI.

const THEMES = [
  {
    id: "light",
    chrome: "#ffffff",
    bg: "#f1efe9",
    accent: "#1d1b18",
    labelKey: "themeLight",
  },
  {
    id: "dark",
    chrome: "#000000",
    bg: "#221e19",
    accent: "#9a7740",
    labelKey: "themeDark",
  },
  {
    id: "midnight",
    chrome: "#35332d",
    bg: "#ecebe6",
    accent: "#3f3d37",
    labelKey: "themeMidnight",
  },
  {
    id: "maroon",
    chrome: "#48282c",
    bg: "#f5ece9",
    accent: "#8a464d",
    labelKey: "themeMaroon",
  },
  {
    id: "lavender",
    chrome: "#4a3a29",
    bg: "#f4ecdf",
    accent: "#9c7038",
    labelKey: "themeLavender",
  },
  {
    id: "green",
    chrome: "#383d24",
    bg: "#eef0e4",
    accent: "#5f6a34",
    labelKey: "themeGreen",
  },
];

// ---------- Hopping-rabbit progress ----------
function RabbitProgress({ pct, unitsDone, totalUnits = 6 }) {
  const u = useU();
  const done = pct >= 100;
  const n = totalUnits;
  const stoneX = (i) => 6 + ((i + 1) / n) * 80; // milestone stones
  const rabbitX = 6 + (Math.min(pct, 100) / 100) * 80; // rabbit glides along
  return (
    <div className="rabbit-prog">
      <div className="rp-top">
        <span className="rp-pct">{Math.round(pct)}%</span>
        <span className="rp-cap">
          {done ? u("journeyComplete") : u("completed")}
        </span>
      </div>
      <div className="rp-field">
        <div className="rp-ground" />
        {Array.from({ length: n }, (_, i) => (
          <div
            key={i}
            className={"rp-stone" + (i < unitsDone ? " done" : "")}
            style={{ left: stoneX(i) + "%" }}
          >
            {i < unitsDone ? "✓" : i === n - 1 ? "🏁" : i + 1}
          </div>
        ))}
        <span className="rp-goal" role="img" aria-label="carrot">
          🥕
        </span>
        <div className="rp-rabbit" style={{ left: rabbitX + "%" }}>
          <span className="rp-bun" role="img" aria-label="rabbit">
            🐰
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({
  pct,
  unitsDone,
  totalUnits = 6,
  upcoming,
  journeyComplete,
  surveyDone,
  onDownloadCert,
}) {
  const tr = useTr();
  const u = useU();
  return (
    <aside className="sidebar">
      <div className="ring-block">
        <RabbitProgress pct={pct} unitsDone={unitsDone} totalUnits={totalUnits} />
      </div>

      <div className="side-card">
        <div className="side-card-h">{u("upcoming")}</div>
        {upcoming ? (
          <div className="upcoming-item">
            <Icon name="clock" size={18} />
            <div>
              <div className="up-title">{tr(upcoming.title)}</div>
              {upcoming.due && (
                <div className="up-date">
                  {u("dueOn")} {upcoming.due}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="up-empty">{u("nothingUpcoming")}</div>
        )}
      </div>

      {journeyComplete && (
        <div className="cert-block">
          <div className="cert-ready">
            <Icon name="award" size={20} />
            <span>{surveyDone ? u("certReady") : u("certNeedsSurvey")}</span>
          </div>
          <button className="btn btn-blue btn-block" onClick={onDownloadCert}>
            {surveyDone ? (
              <>
                <Icon name="download" size={18} /> {u("downloadCert")}
              </>
            ) : (
              <>
                <Icon name="award" size={18} /> {u("takeSurvey")}
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}

// ---------- generic dropdown ----------
function useClickOutside(ref, onClose, active) {
  React.useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("touchstart", h);
    };
  }, [active, onClose]);
}

// ---------- Top nav ----------
function TopNav({ state, dispatch, onNav }) {
  const tr = useTr();
  const u = useU();
  const [open, setOpen] = React.useState(null); // 'lang' | 'profile' | 'notif' | null
  const wrap = React.useRef(null);
  useClickOutside(wrap, () => setOpen(null), open !== null && open !== "chat");
  const lang = state.lang;
  const langObj = LANGS.find((l) => l.code === lang);
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <header className="topnav" ref={wrap}>
      <button className="brand" onClick={() => onNav({ screen: "dash" })}>
        <span className="brand-word">iORA</span>
        <span className="brand-sub">{u("brandSub")}</span>
      </button>

      <div className="nav-right">
        <button
          className={"nav-icon" + (open === "notif" ? " on" : "")}
          title={u("notifications")}
          onClick={() => setOpen(open === "notif" ? null : "notif")}
        >
          <Icon name="bell" size={22} />
          {unread > 0 && <span className="badge">{unread}</span>}
        </button>

        <button
          className="nav-user"
          onClick={() => setOpen(open === "profile" ? null : "profile")}
        >
          <span className="user-name">{state.userName}</span>
          <span className="avatar">
            <Icon name="user" size={20} />
          </span>
          <Icon name="chevronDown" size={16} />
        </button>

        <button
          className="lang-pill"
          onClick={() => setOpen(open === "lang" ? null : "lang")}
        >
          <Icon name="globe" size={16} />
          <span className="lang-label">{langObj.label}</span>
          <span className="lang-label-sm">{langObj.short}</span>
          <Icon name="chevronDown" size={15} />
        </button>

        {/* Language dropdown */}
        {open === "lang" && (
          <div className="dropdown dd-lang">
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={"dd-item" + (l.code === lang ? " active" : "")}
                onClick={() => {
                  dispatch({ type: "setLang", lang: l.code });
                  setOpen(null);
                }}
              >
                <span className="lang-short">{l.short}</span>
                {l.label}
                {l.code === lang && (
                  <Icon name="check" size={16} style={{ marginLeft: "auto" }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Notifications dropdown */}
        {open === "notif" && (
          <div className="dropdown dd-notif">
            <div className="dd-head">
              <span>{u("notifications")}</span>
              {unread > 0 && (
                <button
                  className="dd-link"
                  onClick={() => dispatch({ type: "readAllNotifs" })}
                >
                  {u("markAllRead")}
                </button>
              )}
            </div>
            <div className="notif-list">
              {state.notifications.length === 0 && (
                <div className="notif-empty">{u("noNotifs")}</div>
              )}
              {state.notifications.map((n) => (
                <div key={n.id} className={"notif" + (n.read ? "" : " unread")}>
                  <span className={"notif-dot " + n.kind}></span>
                  <div>
                    <div className="notif-text">{tr(n.text)}</div>
                    <div className="notif-time">{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Profile dropdown */}
        {open === "profile" && (
          <div className="dropdown dd-profile">
            <div className="profile-head">
              <span className="avatar lg">
                <Icon name="user" size={26} />
              </span>
              <div>
                <div className="pf-name">{state.userName}</div>
                <div className="pf-role">{u("role")}</div>
              </div>
            </div>
            <button
              className="dd-item"
              onClick={() => {
                setOpen(null);
              }}
            >
              <Icon name="user" size={18} /> {u("myProfile")}
            </button>
            <button
              className="dd-item"
              onClick={() => {
                setOpen(null);
                dispatch({ type: "openPw" });
              }}
            >
              <Icon name="key" size={18} /> {u("changePassword")}
            </button>
            <div className="dd-sep"></div>
            <div className="dd-section-label">{u("theme")}</div>
            <div className="theme-grid">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={
                    "theme-sw" + (state.theme === th.id ? " active" : "")
                  }
                  onClick={() => dispatch({ type: "setTheme", theme: th.id })}
                >
                  <span
                    className="theme-chip"
                    style={{ background: th.chrome }}
                  >
                    <span className="tc-bg" style={{ background: th.bg }} />
                    <i style={{ background: th.accent }} />
                  </span>
                  {u(th.labelKey)}
                </button>
              ))}
            </div>
            <div className="dd-sep"></div>
            <button
              className="dd-item danger"
              onClick={() => {
                setOpen(null);
                dispatch({ type: "logout" });
              }}
            >
              <Icon name="logout" size={18} /> {u("logOut")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------- Change password modal ----------
function PasswordModal({ open, onClose, onSaved }) {
  const u = useU();
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{u("changePassword")}</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="form">
          <label>
            {u("currentPw")}
            <input type="password" defaultValue="••••••••" />
          </label>
          <label>
            {u("newPw")}
            <input type="password" />
          </label>
          <label>
            {u("confirmPw")}
            <input type="password" />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {u("cancel")}
          </button>
          <button className="btn btn-blue" onClick={onSaved}>
            {u("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Toast stack ----------
function Toasts({ toasts }) {
  const tr = useTr();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind || "info")}>
          <Icon name={t.icon || "checkCircle"} size={20} />
          <span>{tr(t.text)}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  RabbitProgress,
  Sidebar,
  TopNav,
  PasswordModal,
  Toasts,
});
