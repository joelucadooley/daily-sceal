// Bearnaí: the daily game. Yesterday's story with five Irish words taken out,
// the same for everyone, built each morning by scripts/game.js into
// data/game.json. Each gap shows its English; pick the Irish from four tiles
// and it drops into the story. Answers are kept on this device only.

import { useState, useEffect, useRef } from "react";
import { timeoutSignal } from "./helpers.js";
import { shareText, beforeGap, praise } from "./gameText.js";

const C = {
  navy: "#0d2137", border: "#e8e2d9", text: "#111111", muted: "#6b6460", faint: "#a8a29a",
  blue: "#2563eb", green: "#15803d", red: "#b91c1c", gold: "#e8951e",
};
const SANS = "system-ui, sans-serif";
const SERIF = "Georgia, serif";
const KEY = "ds-game";
// How long a result shows before the next gap: longer when wrong, to see the right word.
const PAUSE_RIGHT = 850;
const PAUSE_WRONG = 1500;

const CSS = `
.bn-slot { display: inline-block; padding: 0 .38em; margin: .12em 0; border-radius: 8px; line-height: 1.5; font-weight: 700;
  transition: background-color .25s, color .25s; }
.bn-future { color: ${C.faint}; background: #f2ede6; font-weight: 600; }
.bn-current { color: ${C.blue}; background: #eaf1fe; font-style: italic; font-weight: 600; animation: bnPulse 1.8s ease-in-out infinite; }
.bn-right { color: ${C.green}; background: #e5f5ea; animation: bnPop .38s ease; }
.bn-wrong { color: ${C.red}; background: #fdeaea; animation: bnPop .38s ease; }
@keyframes bnPulse { 0%, 100% { box-shadow: inset 0 0 0 2px ${C.blue}, 0 0 0 0 rgba(37,99,235,.28); }
  50% { box-shadow: inset 0 0 0 2px ${C.blue}, 0 0 0 6px rgba(37,99,235,0); } }
@keyframes bnPop { 0% { transform: scale(.82); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes bnIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.bn-tile { min-height: 58px; padding: 8px 10px; border-radius: 14px; border: 1.5px solid #e2dbd0; box-shadow: 0 3px 0 #e2dbd0;
  background: #fff; color: ${C.text}; -webkit-text-fill-color: ${C.text}; font: 700 1.02rem/1.25 ${SERIF}; cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: transform .08s, box-shadow .08s, background-color .2s, opacity .2s;
  animation: bnIn .25s ease both; }
.bn-tile:active:not([aria-disabled="true"]) { transform: translateY(3px); box-shadow: 0 0 0 #e2dbd0; }
.bn-tile.right { background: ${C.green}; border-color: ${C.green}; box-shadow: 0 3px 0 #0f5f2d; color: #fff; -webkit-text-fill-color: #fff; }
.bn-tile.wrong { background: ${C.red}; border-color: ${C.red}; box-shadow: 0 3px 0 #8c1515; color: #fff; -webkit-text-fill-color: #fff; }
.bn-tile.dim { opacity: .38; }
.bn-tile[aria-disabled="true"] { cursor: default; }
.bn-prompt { animation: bnIn .25s ease both; }
.bn-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bn-tile { min-width: 0; overflow-wrap: anywhere; }
@media (max-height: 520px) { .bn-prompt { margin-bottom: 6px !important; } .bn-tiles { gap: 8px; } .bn-tile { min-height: 42px; font-size: .9rem; } }
@media (max-height: 520px) and (min-width: 540px) { .bn-tiles { grid-template-columns: repeat(4, 1fr); } }
@media (prefers-reduced-motion: reduce) { .bn-slot, .bn-tile, .bn-prompt { animation: none !important; transition: none; } }
`;

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

/** The story to play in. Games built before the story was added get one sentence per gap. */
function storyOf(game) {
  if (Array.isArray(game.story) && game.story.length) return { paragraphs: game.story, headline: game.story.length > 1 };
  return { paragraphs: game.questions.map((q, i) => [q.before, i, q.after]), headline: false };
}

export default function GameView({ onStories }) {
  const [game, setGame] = useState(null);
  const [failed, setFailed] = useState(false);
  const [picks, setPicks] = useState([]);
  const [index, setIndex] = useState(0);
  const [shared, setShared] = useState(null); // null, "copied" or "manual"
  const [navH, setNavH] = useState(64);
  const [trayH, setTrayH] = useState(170);
  const trayRef = useRef(null);
  const resultRef = useRef(null);
  const moved = useRef(false);

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
        setIndex(saved.length); // back where they left off
        moved.current = saved.length > 0; // and scrolled to it
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  // The tray of tiles sits just above the fixed tab bar.
  useEffect(() => {
    const nav = document.querySelector("nav");
    if (nav) setNavH(nav.offsetHeight);
  }, [game]);

  const qs = game ? game.questions : [];
  const answered = picks.length > index;

  // The tiles are fixed above the tab bar; the page leaves room under the story for them.
  useEffect(() => {
    const el = trayRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTrayH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [game, index >= qs.length]);

  // After a pick, a short pause on the result, then on to the next gap.
  useEffect(() => {
    if (!game || !answered || index >= qs.length) return;
    const right = picks[index] === qs[index].irish;
    const t = setTimeout(() => { moved.current = true; setIndex(index + 1); }, right ? PAUSE_RIGHT : PAUSE_WRONG);
    return () => clearTimeout(t);
  }, [game, answered, index, picks, qs]);

  // Keep the current gap in view above the tiles; show the score when it's done.
  useEffect(() => {
    if (!moved.current) return;
    const bump = by => { try { window.scrollBy({ top: by, behavior: "smooth" }); } catch { window.scrollBy(0, by); } };
    if (index >= qs.length) {
      const r = resultRef.current && resultRef.current.getBoundingClientRect();
      if (r && r.top > window.innerHeight * 0.45) bump(r.top - window.innerHeight * 0.3);
      return;
    }
    const slot = document.querySelector(`[data-slot="${index}"]`);
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    const room = window.innerHeight - navH - (trayRef.current ? trayRef.current.offsetHeight : 160) - 16;
    if (r.bottom > room) bump(r.bottom - room + 24);
    else if (r.top < 70) bump(r.top - 90);
  }, [index, navH, qs.length]);

  if (failed) return <p style={{ fontFamily: SANS, color: C.muted, padding: "30px 0" }}>No game today. Try again later.</p>;
  if (!game) return <p style={{ fontFamily: SANS, color: C.faint, padding: "30px 0" }}>Loading…</p>;

  const results = picks.map((p, i) => p === qs[i].irish);
  const done = index >= qs.length;
  const { paragraphs, headline } = storyOf(game);
  const q = qs[Math.min(index, qs.length - 1)];

  const pick = opt => {
    if (answered || done) return;
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
    setShared((await copy(text)) ? "copied" : "manual");
  };

  const slotState = i => (i < picks.length ? (results[i] ? "right" : "wrong") : i === index ? "current" : "future");

  return (
    <div style={{ padding: "22px 0 12px", maxWidth: 560, margin: "0 auto" }}>
      <style>{CSS}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ fontFamily: SERIF, fontSize: "1.7rem", lineHeight: 1.15, color: C.navy, margin: 0 }}>Bearnaí</h2>
        <div style={{ display: "flex", gap: 7 }} role="img" aria-label={`${results.filter(Boolean).length} right of ${qs.length}`}>
          {qs.map((_, i) => {
            const s = slotState(i);
            return <span key={i} style={{
              width: 11, height: 11, borderRadius: "50%", boxSizing: "border-box", transition: "background-color .25s",
              background: s === "right" ? C.green : s === "wrong" ? C.red : s === "current" ? "#fff" : C.border,
              border: s === "current" ? `2px solid ${C.blue}` : "none",
            }} />;
          })}
        </div>
      </div>
      <p style={{ fontFamily: SANS, fontSize: "0.88rem", color: C.muted, margin: "4px 0 16px" }}>Did yesterday's words stick?</p>

      <article style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 18px 16px" }}>
        {paragraphs.map((para, pi) => {
          const head = headline && pi === 0;
          return (
            <p key={pi} style={head
              ? { fontFamily: SERIF, fontWeight: 700, fontSize: "1.28rem", lineHeight: 1.45, color: C.navy, margin: "0 0 12px" }
              : { fontFamily: SERIF, fontSize: "1.06rem", lineHeight: 1.9, color: C.text, margin: pi < paragraphs.length - 1 ? "0 0 12px" : 0 }}>
              {para.map((piece, i) => {
                if (typeof piece === "number") {
                  const s = slotState(piece);
                  const g = qs[piece];
                  return (
                    <span key={i} data-slot={piece} className={`bn-slot bn-${s}`}>
                      {s === "right" || s === "wrong" ? g.irish : g.english}
                    </span>
                  );
                }
                // "a" or "an" before a filled gap agrees with the Irish word.
                const nextGap = para[i + 1];
                const text = typeof nextGap === "number" && nextGap < picks.length ? beforeGap(piece, qs[nextGap].irish) : piece;
                return <span key={i}>{text}</span>;
              })}
            </p>
          );
        })}
      </article>

      <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {answered && !done ? (results[index] ? "Right" : `Not quite: ${q.irish}`) : ""}
      </div>

      {/* Room under the story so its end can scroll up above the tiles. */}
      {!done && <div style={{ height: trayH }} />}

      {!done && (
        <div ref={trayRef} style={{
          position: "fixed", left: 0, right: 0, bottom: navH, zIndex: 5, padding: "10px 16px 14px",
          background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <p key={`p${index}`} className="bn-prompt" style={{ fontFamily: SANS, fontSize: "0.9rem", color: C.muted, textAlign: "center", margin: "0 0 10px" }}>
            Pick the Irish for <strong style={{ color: C.blue }}>{q.en || q.english}</strong>
          </p>
          <div key={index} className="bn-tiles">
            {q.options.map((opt, k) => {
              const right = answered && opt === q.irish;
              const wrong = answered && opt === picks[index] && opt !== q.irish;
              return (
                <button key={opt} type="button" onClick={() => pick(opt)} aria-disabled={answered}
                  className={`bn-tile${right ? " right" : wrong ? " wrong" : answered ? " dim" : ""}`}
                  style={{ animationDelay: `${k * 35}ms` }}>
                  {opt}
                </button>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {done && (
        <div ref={resultRef} style={{ textAlign: "center", marginTop: 22 }}>
          <div style={{ fontFamily: SERIF, fontSize: "1.45rem", fontWeight: 700, color: C.gold }}>
            {praise(results.filter(Boolean).length, qs.length)}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 700, color: C.navy }}>
            {results.filter(Boolean).length} out of {qs.length}
          </div>
          <div style={{ fontSize: "1.6rem", letterSpacing: "0.12em", margin: "6px 0 16px" }} aria-hidden="true">
            {results.map(r => (r ? "☘️" : "❌")).join("")}
          </div>
          <button type="button" onClick={share} style={{
            display: "block", width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: C.navy,
            color: "#fff", WebkitTextFillColor: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: "1rem", cursor: "pointer",
          }}>Share</button>
          <div aria-live="polite" style={{ fontFamily: SANS, fontSize: "0.85rem", color: C.green, minHeight: 22, marginTop: 8 }}>
            {shared === "copied" ? "Copied ✓" : ""}
          </div>
          {onStories && (
            <p style={{ fontFamily: SANS, fontSize: "0.85rem", color: C.muted, margin: "0 0 18px" }}>
              Tomorrow's words are in{" "}
              <button type="button" onClick={onStories} style={{
                background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", WebkitTextFillColor: C.muted,
                textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer",
              }}>today's stories</button>.
            </p>
          )}
          {shared === "manual" && (
            <textarea readOnly value={shareText(results)} rows={3} onFocus={e => e.target.select()} aria-label="Score to copy"
              style={{ width: "100%", fontFamily: SANS, fontSize: "0.95rem", padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 10, resize: "none", boxSizing: "border-box" }} />
          )}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, textAlign: "left", background: "#fff" }}>
            {qs.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "12px 16px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <span aria-label={results[i] ? "right" : "wrong"} style={{ flex: "none" }}>{results[i] ? "☘️" : "❌"}</span>
                <span style={{ fontFamily: SERIF, fontWeight: 700, color: C.navy }}>{g.ga || g.irish}</span>
                <span style={{ fontFamily: SANS, fontSize: "0.9rem", color: C.muted }}>{g.en || g.english}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
