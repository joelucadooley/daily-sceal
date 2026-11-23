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
  const start = Number(fnv1a64(key) % BigInt(pool.length));
  // A grim word gives way to the next one, so every other day keeps its word.
  for (let i = 0; i < pool.length; i++) {
    const w = pool[(start + i) % pool.length];
    if (!isGrimWord(w.en)) return w;
  }
  return pool[start];
}

// The same list as Sensitive.word in the iPhone app (Shared/Story.swift) and
// the Android app (Model.kt): change all three together.
const GRIM = /\b(murder\w*|manslaughter|homicide\w*|kill(s|ed|er|ers|ing|ings)?|rap(e|es|ed|ist|ists)|sexual\w*|sex (offen\w*|abuse\w*|attack\w*|crime\w*|assault\w*)|abus(e|es|ed|er|ers|ive)|paedophil\w*|pedophil\w*|child porn\w*|grooming|stab(s|bed|bing|bings)?|shot dead|shootings?|gunm[ae]n|assault\w*|massacre\w*|genocide|atrocit\w*|suicid\w*|self-harm|dead|deadly|deaths?|die(s|d)?|dying|fatal\w*|corpses?|human remains|inquests?|funerals?|terror\w*|bomb\w*|hostages?|wars?|missiles?|air ?strikes?|kidnap\w*|abduct\w*|traffick\w*|violen(t|ce)|harass\w*|arson|drown\w*|cancer\w*|victims?|prison\w*|jailed|sentenced|convicted|jury|trial told|court hears|missing (woman|man|girl|boy|teen\w*|child|person)|epstein|nikita hand|guilty|crash(es|ed)?|collisions?|seriously injured|injured in|hijack\w*|attackers?|(man|woman|boy|girl|teen\w*|child)['’]s body|bod(y|ies) (found|discovered|recovered))\b/i;
function isGrimWord(english) {
  return ["attack", "disease"].includes(english.toLowerCase()) || GRIM.test(english);
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

// ---- Story addresses ----
//
// Every story has an address: dailysceal.com/#2026-11-22/3/25
//   2026-11-22  the day's file (today.json, or archive/2026-11-22.json)
//   3           the story's place in that file, counting from 1. This is the
//               file's own order, not the order the home page shows. The
//               morning run writes it once and Add a story adds to the end,
//               so a number never moves. Rerunning the morning run would
//               renumber that day.
//   25          the level: 10, 25 or 50. Optional; without it the story opens
//               at the reader's own level.

export const ADDRESS_LEVELS = [10, 25, 50];

/** "#2026-11-22/3/25" for a day, a number from 1 and an optional level. */
export function storyAddress(day, n, level) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || !Number.isInteger(n) || n < 1) return "";
  return `#${day}/${n}${ADDRESS_LEVELS.includes(level) ? `/${level}` : ""}`;
}

/** { day, n, level } from "#2026-11-22/3/25" (level null when left out), or null. */
export function parseStoryAddress(hash) {
  const m = /^#?(\d{4})-(\d{2})-(\d{2})\/(\d{1,3})(?:\/(\d{1,3}))?\/?$/.exec(String(hash || "").trim());
  if (!m) return null;
  const [, y, mo, d, num, lv] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  const n = Number(num);
  if (n < 1) return null;
  const level = lv != null && ADDRESS_LEVELS.includes(Number(lv)) ? Number(lv) : null;
  return { day: `${y}-${mo}-${d}`, n, level };
}

/** Each story of a day's file with its address parts (addrDay, addrN). */
export function withAddresses(stories, day) {
  return (Array.isArray(stories) ? stories : []).map((s, i) => ({ ...s, addrDay: day, addrN: i + 1 }));
}

/** Story n (from 1) of a day's file, with its address parts, or null. */
export function storyAt(dayData, n) {
  const list = dayData && Array.isArray(dayData.stories) ? dayData.stories : [];
  const s = list[n - 1];
  return s && typeof s === "object" && s.title ? { ...s, addrDay: dayData.date, addrN: n } : null;
}

// The reader's own level on this device, so a story opens where they left
// it. Only the three open levels; private windows can block storage.
const LEVEL_KEY = "ds-level";
export function rememberedLevel(storage = globalThis.localStorage) {
  try {
    const v = Number(storage && storage.getItem(LEVEL_KEY));
    return ADDRESS_LEVELS.includes(v) ? v : null;
  } catch {
    return null;
  }
}
export function rememberLevel(level, storage = globalThis.localStorage) {
  if (!ADDRESS_LEVELS.includes(level)) return;
  try { storage && storage.setItem(LEVEL_KEY, String(level)); } catch {}
}
