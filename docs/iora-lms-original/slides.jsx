// slides.jsx — slide viewer. Embeds the lesson's real .pptx deck via the
// Microsoft Office Online viewer; learner clicks Continue to complete the part.
// Exports: window.SlideDeck.  Relies on: Icon, useTr, useU, window.MAT.

const { useState: _useState, useEffect: _useEffect } = React;

function SlideDeck({ deck, done, onComplete }) {
  const tr = useTr();
  const u = useU();
  const pptxUrl = tr(deck); // language-specific .pptx URL
  const embedUrl = window.MAT.officeEmbed(pptxUrl);
  const deckName = u("slidesDeck");

  // allow completion once the learner has had a moment with the deck
  const [ready, setReady] = _useState(done);
  _useEffect(() => {
    if (done) {
      setReady(true);
      return;
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [pptxUrl]);

  return (
    <div className="part slides-part">
      {/* real deck via the Office Online viewer (16:9 frame) */}
      <div className="video-frame">
        <iframe
          src={embedUrl}
          title={deckName}
          frameBorder="0"
          allowFullScreen
        />
      </div>

      <div className="slide-nav">
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
          ) : (
            <>
              {u("continueTo")} <Icon name="chevronRight" size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

window.SlideDeck = SlideDeck;
