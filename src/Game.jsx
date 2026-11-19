// Bearnaí: the daily game. Five gaps from yesterday's story, the same for
// everyone, built each morning by scripts/game.js into data/game.json.
// Answers are kept on this device only, so a reload shows the same result.

import { useState, useEffect } from "react";
import { timeoutSignal } from "./helpers.js";
import { shareText, beforeGap } from "./gameText.js";

const C = {
  navy: "#0d2137", amber: "#e8951e", border: "#e8e2d9", text: "#111111",
  muted: "#6b6460", faint: "#a8a29a", blue: "#2563eb",
  green: "#15803d", greenLight: "#ecfdf3", red: "#b91c1c", redLight: "#fdecec",
};
const SANS = "system-ui, sans-serif";
const KEY = "ds-game";

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

export default function GameView() {
  const [game, setGame] = useState(null);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState([]);
  const [index, setIndex] = useState(0);
  const [shared, setShared] = useState("");

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
        // Back where they left off: on an answered question, or the next one.
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
    setShared((await copy(text)) ? "Copied ✓" : "");
  };

  return (
    <div style={{ padding: "26px 0 10px", maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.7rem", color: C.navy, margin: "0 0 4px" }}>Daily gap fill</h2>
      <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: C.muted, margin: "0 0 22px" }}>Did yesterday's words stick?</p>

      {!done && (
        <Question
          q={qs[Math.min(index, qs.length - 1)]}
          n={index + 1}
          total={qs.length}
          score={results.slice(0, index).filter(Boolean).length}
          picked={picks[index]}
          onPick={pick}
          onNext={() => setIndex(index + 1)}
          last={index + 1 === qs.length}
        />
      )}

      {done && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "2rem", fontWeight: 700, color: C.navy }}>
            {results.filter(Boolean).length} out of {qs.length}
          </div>
          <div style={{ fontSize: "1.6rem", letterSpacing: "0.12em", margin: "10px 0 18px" }} aria-hidden="true">
            {results.map(r => (r ? "☘️" : "❌")).join("")}
          </div>
          <button type="button" onClick={share} style={btn(C.navy, "#fff")}>Share</button>
          <div aria-live="polite" style={{ fontFamily: SANS, fontSize: "0.85rem", color: C.green, minHeight: 22, marginTop: 8 }}>{shared}</div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, textAlign: "left", marginTop: 14 }}>
            {qs.map((q, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 16px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <span aria-label={results[i] ? "right" : "wrong"}>{results[i] ? "☘️" : "❌"}</span>
                <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, color: C.navy }}>{q.irish}</span>
                <span style={{ fontFamily: SANS, fontSize: "0.9rem", color: C.muted }}>{q.english}</span>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: SANS, fontSize: "0.82rem", color: C.faint, marginTop: 16 }}>
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
  const tight = /^[.,;:!?)'"’”]/.test(q.after);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: "0.8rem", color: C.muted, marginBottom: 10 }}>
        <span>{n} of {total}</span><span>{score} right</span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <p style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", lineHeight: 1.9, color: C.text, margin: "0 0 12px" }}>
          {beforeGap(q.before, answered ? q.irish : null)}
          <strong style={{ color: answered ? C.green : C.blue }}>{answered ? q.irish : "______"}</strong>
          {tight ? "" : q.after.startsWith(" ") ? "" : " "}{q.after}
        </p>
        <div style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 600, color: C.amber }}>💡 {q.english}</div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {q.options.map(opt => {
          const right = answered && opt === q.irish;
          const wrong = answered && opt === picked && opt !== q.irish;
          return (
            <button key={opt} type="button" onClick={() => onPick(opt)} disabled={answered}
              aria-label={right ? `${opt}, right answer` : wrong ? `${opt}, your answer` : opt}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
                padding: 14, borderRadius: 8, border: `1px solid ${C.border}`, cursor: answered ? "default" : "pointer",
                background: right ? C.greenLight : wrong ? C.redLight : "#fff", color: C.text,
                fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "1.05rem", opacity: 1,
              }}>
              <span>{opt}</span>
              <span aria-hidden="true">{right ? "✓" : wrong ? "✗" : ""}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <button type="button" onClick={onNext} style={{ ...btn(C.navy, "#fff"), marginTop: 18 }}>
          {last ? "See score" : "Next"}
        </button>
      )}
    </div>
  );
}

const btn = (bg, fg) => ({
  display: "block", width: "100%", minHeight: 50, borderRadius: 10, border: "none",
  background: bg, color: fg, fontFamily: SANS, fontWeight: 700, fontSize: "1rem", cursor: "pointer",
});
