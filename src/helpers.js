// Small helpers App.jsx uses, kept apart from React so the tests can run them
// in Node (scripts/test/pipeline.mjs).

// A [[irish|english]] marker. Neither half may hold a bracket or a |.
export const MARKER_RE = /\[\[([^|[\]]+)\|([^[\]]+)\]\]/g;

// Makes an "a" or "an" sitting directly before a marker agree with the Irish
// word that will be shown there: "an" before a vowel, "a" before a consonant.
// The source text is written for the English word ("an e-scooter"), which
// reads wrongly once the marker shows Irish ("an scútar").
export function fixArticle(before, irish) {
  const m = before.match(/(^|[\s("“‘'’[–—-])(an?)(\s+)$/i);
  if (!m) return before;
  // A capital A that is not opening a sentence is a letter, not the article:
  // "Group A", "Plan A", "Category A".
  if (m[2] === "A" && !/(^|[.!?:"“‘'(]\s*)A\s+$/.test(before)) return before;
  const vowel = /^[aeiouáéíóú]/i.test(irish.trim());
  let art = vowel ? "an" : "a";
  if (m[2][0] !== m[2][0].toLowerCase()) art = art[0].toUpperCase() + art.slice(1);
  return before.slice(0, before.length - m[2].length - m[3].length) + art + m[3];
}

export function parseText(text) {
  const parts = [], re = new RegExp(MARKER_RE.source, "g");
  const src = String(text || "");
  let last = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push({ t: "en", v: fixArticle(src.slice(last, m.index), m[1]) });
    parts.push({ t: "ir", irish: m[1], english: m[2] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ t: "en", v: src.slice(last) });
  return parts;
}

// Focal an lae: the same word the app, its widget and the noon reminder show
// that day. Same pool, same order and the same FNV-1a hash of the local date
// as Focail.focal(for:) in the iOS app, so every place agrees.
export function focalFor(focail, date = new Date()) {
  const pool = (focail?.words || [])
    .filter(w => w && typeof w.en === "string" && typeof w.ga === "string")
    .filter(w => !w.en.includes(" ") && [...w.ga].length <= 18 && w.en.length >= 3)
    .sort((a, b) => (a.en < b.en ? -1 : a.en > b.en ? 1 : 0));
  if (!pool.length) return null;
  const pad = n => String(n).padStart(2, "0");
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return pool[Number(fnv1a64(key) % BigInt(pool.length))];
}

export function fnv1a64(text) {
  let h = 14695981039346656037n;
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b);
    h = (h * 1099511628211n) & 0xFFFFFFFFFFFFFFFFn;
  }
  return h;
}

// fetch's signal for a time limit. AbortSignal.timeout is missing on iPhones
// before iOS 16, where calling it threw and the site showed no stories.
export function timeoutSignal(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController === "undefined") return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
