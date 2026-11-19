// Bearnaí: the daily game. Five gaps from yesterday's story, the same for
// everyone, built each morning by scripts/game.js into data/game.json.
// Answers are kept on this device only, so a reload shows the same result.

import { useState, useEffect, useRef } from "react";
import { timeoutSignal } from "./helpers.js";
import { shareText, beforeGap } from "./gameText.js";

const C = {
  navy: "#0d2137", amber: "#e8951e", border: "#e8e2d9", text: "#111111",
  muted: "#6b6460", faint: "#a8a29a", blue: "#2563eb",
  green: "#15803d", greenLight: "#ecfdf3", red: "#b91c1c", redLight: "#fdecec",
};
const SANS = "system-ui, sans-serif";
const SERIF = "Georgia, serif";
const KEY = "ds-game";
// The fixed bar of tabs at the foot of the page, plus a little air.
const NAV_CLEARANCE = 84;

function loadPicks(date) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return s && s.date === date && Array.isArray(s.picks) ? s.picks : [];
  } catch {
    return [];
  }
}
function savePicks(date, picks) {
  try { localStorage.setItem(KEY, JSON.stringify({ date, picks })); } catch { /* private mode */ }
}

function copy(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch { /* fall through */ }
  return Promise.resolve(false);
}

const toTop = () => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); } };

export default function GameView() {
  const [game, setGame] = useState(null);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState([]);
  const [index, setIndex] = useState(0);
  const [shared, setShared] = useState(null); // null, "copied" or "manual"

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/game.json`, { cache: "no-cache", signal: timeoutSignal(8000) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(g => {
        if (cancelled) return;
        if (!g?.questions?.length) return setFailed(true);
        const saved = loadPicks(g.date).slice(0, g.questions.length);
        setGame(g);
        setPicks(saved);
        // Back where they left off: the next unanswered question, or the score.
        setIndex(Math.min(saved.length, g.questions.length));
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) return <p style={{ fontFamily: SANS, color: C.muted, padding: "30px 0" }}>No game today. Try again later.</p>;
  if (!game) return <p style={{ fontFamily: SANS, color: C.faint, padding: "30px 0" }}>Loading…</p>;

  const qs = game.questions;
  const results = picks.map((p, i) => p === qs[i].irish);
  const done = picks.length >= qs.length && index >= qs.length;

  const pick = opt => {
    if (picks.length > index) return;
    const next = [...picks, opt];
    setPicks(next);
    savePicks(game.date, next);
  };

  const next = () => {
    setIndex(index + 1);
    toTop();
  };

  const share = async () => {
    const text = shareText(results);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    setShared((await copy(text)) ? "copied" : "manual");
  };

  return (
    <div style={{ padding: "24px 0 10px", maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ fontFamily: SERIF, fontSize: "1.7rem", lineHeight: 1.15, color: C.navy, margin: "0 0 4px" }}>Bearnaí</h2>
      <p style={{ fontFamily: SANS, fontSize: "0.88rem", color: C.muted, margin: "0 0 20px" }}>Did yesterday's words stick?</p>

      {!done && (
        <Question
          key={index}
          q={qs[Math.min(index, qs.length - 1)]}
          n={index + 1}
          total={qs.length}
          score={results.filter(Boolean).length}
          picked={picks[index]}
          onPick={pick}
          onNext={next}
          last={index + 1 === qs.length}
        />
      )}

      {done && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 700, color: C.navy }}>
            {results.filter(Boolean).length} out of {qs.length}
          </div>
          <div style={{ fontSize: "1.6rem", letterSpacing: "0.12em", margin: "8px 0 18px" }} aria-hidden="true">
            {results.map(r => (r ? "☘️" : "❌")).join("")}
          </div>
          <button type="button" onClick={share} style={btn(C.navy, "#fff")}>Share</button>
          <div aria-live="polite" style={{ fontFamily: SANS, fontSize: "0.85rem", color: C.green, minHeight: 22, marginTop: 8 }}>
            {shared === "copied" ? "Copied ✓" : ""}
          </div>
          {shared === "manual" && (
            <textarea readOnly value={shareText(results)} rows={3} onFocus={e => e.target.select()} aria-label="Score to copy"
              style={{ width: "100%", fontFamily: SANS, fontSize: "0.95rem", padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 10, resize: "none" }} />
          )}

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, textAlign: "left", marginTop: 6 }}>
            {qs.map((q, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 16px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <span aria-label={results[i] ? "right" : "wrong"} style={{ flex: "none" }}>{results[i] ? "☘️" : "❌"}</span>
                <span style={{ fontFamily: SERIF, fontWeight: 700, color: C.navy }}>{q.ga || q.irish}</span>
                <span style={{ fontFamily: SANS, fontSize: "0.9rem", color: C.muted }}>{q.en || q.english}</span>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: SANS, fontSize: "0.82rem", color: C.faint, margin: "16px 0 0", lineHeight: 1.5 }}>
            From {game.source === "post" ? "yesterday's story" : "yesterday's news"}: {game.link
              ? <a href={game.link} target="_blank" rel="noopener noreferrer" style={{ color: C.muted }}>{game.title}</a>
              : game.title}
          </p>
        </div>
      )}
    </div>
  );
}

function Question({ q, n, total, score, picked, onPick, onNext, last }) {
  const answered = picked != null;
  const nextRef = useRef(null);
  const before = beforeGap(q.before, answered ? q.irish : null).replace(/\s+$/, "");
  const after = q.after.replace(/^\s+/, "");
  const lead = before && !/[(“‘"'\[]$/.test(before) ? " " : "";
  const tail = after && !/^[.,;:!?)'"’”\]]/.test(after) ? " " : "";

  // Once answered, bring Next into view above the tab bar.
  useEffect(() => {
    if (!answered || !nextRef.current) return;
    const r = nextRef.current.getBoundingClientRect();
    const room = window.innerHeight - NAV_CLEARANCE;
    if (r.bottom > room) {
      try { window.scrollBy({ top: r.bottom - room, behavior: "smooth" }); } catch { window.scrollBy(0, r.bottom - room); }
    }
  }, [answered]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: "0.8rem", color: C.muted, marginBottom: 10 }}>
        <span>{n} of {total}</span><span>{score} right</span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
        <p style={{ fontFamily: SERIF, fontSize: "1.08rem", lineHeight: 1.8, color: C.text, margin: "0 0 10px" }}>
          {before}{lead}
          {answered
            ? <strong style={{ color: C.green }}>{q.irish}</strong>
            : <span aria-label="blank" style={{ display: "inline-block", minWidth: "4.5em", borderBottom: `2px solid ${C.blue}`, transform: "translateY(-0.2em)" }}>&nbsp;</span>}
          {tail}{after}
        </p>
        <div style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: C.amber }}>💡 {q.english}</div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {q.options.map(opt => {
          const right = answered && opt === q.irish;
          const wrong = answered && opt === picked && opt !== q.irish;
          return (
            <button key={opt} type="button" onClick={() => onPick(opt)} aria-disabled={answered}
              aria-label={right ? `${opt}, right answer` : wrong ? `${opt}, your answer` : opt}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left",
                minHeight: 50, padding: "12px 14px", borderRadius: 8, border: `1px solid ${right ? "#bbe5c8" : wrong ? "#f3c4c4" : C.border}`,
                cursor: answered ? "default" : "pointer", background: right ? C.greenLight : wrong ? C.redLight : "#fff",
                color: C.text, WebkitTextFillColor: C.text, fontFamily: SERIF, fontWeight: 700, fontSize: "1.05rem",
                WebkitTapHighlightColor: "transparent",
              }}>
              <span>{opt}</span>
              {(right || wrong) && (
                <span aria-hidden="true" style={{
                  flex: "none", width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: right ? C.green : C.red, color: "#fff", WebkitTextFillColor: "#fff", fontFamily: SANS, fontSize: 13, fontWeight: 800,
                }}>{right ? "✓" : "✕"}</span>
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <button ref={nextRef} type="button" onClick={onNext} style={{ ...btn(C.navy, "#fff"), marginTop: 16 }}>
          {last ? "See score" : "Next"}
        </button>
      )}
    </div>
  );
}

const btn = (bg, fg) => ({
  display: "block", width: "100%", minHeight: 50, borderRadius: 10, border: "none",
  background: bg, color: fg, WebkitTextFillColor: fg, fontFamily: SANS, fontWeight: 700, fontSize: "1rem", cursor: "pointer",
});
