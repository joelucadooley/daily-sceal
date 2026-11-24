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
// that day. The morning run fixes the word for yesterday, today and tomorrow
// in focail.json (`days`), so adding words to the dictionary never changes a
// word already shown; the site and the apps use that word when the day is
// there. Otherwise, as before: the same pool, order and FNV-1a hash of the
// local date as Focail.focal(for:) in the apps, so every place agrees.
export function focalFor(focail, date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const fixed = focail?.days?.[key];
  if (fixed && typeof fixed.ga === "string" && typeof fixed.en === "string") return fixed;
  return focalForKey(focail, key);
}

/** The word worked out from the list alone, for a "YYYY-MM-DD" day. */
export function focalForKey(focail, key) {
  const pool = (focail?.words || [])
    .filter(w => w && typeof w.en === "string" && typeof w.ga === "string")
    .filter(w => !w.en.includes(" ") && [...w.ga].length <= 18 && w.en.length >= 3)
    .sort((a, b) => (a.en < b.en ? -1 : a.en > b.en ? 1 : 0));
  if (!pool.length) return null;
  const start = Number(fnv1a64(key) % BigInt(pool.length));
  // A grim word gives way to the next one, so every other day keeps its word.
  for (let i = 0; i < pool.length; i++) {
    const w = pool[(start + i) % pool.length];
    if (!isGrimWord(w.en)) return w;
  }
  return pool[start];
}

/**
 * The fixed words for focail.json: yesterday, today and tomorrow around
 * `day` (the run's date). A day already fixed keeps its word. A new entry
 * for today or yesterday uses the list that was live until now (`before`),
 * which is what readers have seen; tomorrow uses the new list (`after`).
 */
export function fixedDays(before, after, day) {
  const shift = n => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const ok = w => w && typeof w.ga === "string" && typeof w.en === "string";
  const out = {};
  for (const n of [-1, 0, 1]) {
    const key = shift(n);
    const kept = before?.days?.[key];
    const list = n < 1 && before?.words?.length ? before : after;
    const w = ok(kept) ? kept : focalForKey(list, key);
    if (w) out[key] = { ga: w.ga, en: w.en };
  }
  return out;
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

// ---- Page addresses ----
//
// Every page has an address:
//   dailysceal.com                  Inniu (#inniu works too)
//   #eire #sport #domhan #eile      the news tabs
//   #bearnai                        the game
//   #faoi                           Faoi
//   #story/2026-11-22/3/25          a story
// Written without fadas, which turn into %C3%A9 when a link is copied;
// typed with them (#éire, #spórt) they still work.
//
// In a story address:
//   2026-11-22  the day's file (today.json, or archive/2026-11-22.json)
//   3           the story's place in that file, counting from 1. This is the
//               file's own order, not the order the home page shows. The
//               morning run writes it once and Add a story adds to the end,
//               so a number never moves. Rerunning the morning run would
//               renumber that day.
//   25          the level: 10, 25 or 50. Optional; without it the story opens
//               at the reader's own level.

export const ADDRESS_LEVELS = [10, 25, 50];

/** "#story/2026-11-22/3/25" for a day, a number from 1 and an optional level. */
export function storyAddress(day, n, level) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || !Number.isInteger(n) || n < 1) return "";
  return `#story/${day}/${n}${ADDRESS_LEVELS.includes(level) ? `/${level}` : ""}`;
}

/** { day, n, level } from "#story/2026-11-22/3/25" (level null when left out), or null. */
export function parseStoryAddress(hash) {
  const m = /^#?story\/(\d{4})-(\d{2})-(\d{2})\/(\d{1,3})(?:\/(\d{1,3}))?\/?$/i.exec(String(hash || "").trim());
  if (!m) return null;
  const [, y, mo, d, num, lv] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  const n = Number(num);
  if (n < 1) return null;
  const level = lv != null && ADDRESS_LEVELS.includes(Number(lv)) ? Number(lv) : null;
  return { day: `${y}-${mo}-${d}`, n, level };
}

/**
 * Which page an address names: { view: "feed", tab, day? }, { view: "game" },
 * { view: "about" }, { view: "export" } or { view: "story", story }.
 * `tabs` are the news tab ids. An earlier day's news is #day/2026-11-21, or
 * #day/2026-11-21/sport for one of its tabs. Anything else is Inniu.
 */
export function routeFor(hash, tabs = []) {
  let h = String(hash || "").trim().replace(/^#/, "");
  try { h = decodeURIComponent(h); } catch {}
  // Story links were #2026-11-23/3/25 for their first day live (23 November
  // 2026); those still open their story.
  const story = parseStoryAddress(h) || (/^\d{4}-\d{2}-\d{2}\//.test(h) ? parseStoryAddress(`story/${h}`) : null);
  if (story) return { view: "story", story };
  const key = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\/+$/, "");
  if (key === "bearnai") return { view: "game" };
  if (key === "faoi") return { view: "about" };
  if (key === "export") return { view: "export" };
  const day = /^day\/(\d{4}-\d{2}-\d{2})(?:\/([a-z]+))?$/.exec(key);
  if (day && parseStoryAddress(`story/${day[1]}/1`)) {
    return { view: "feed", tab: day[2] && tabs.includes(day[2]) ? day[2] : "inniu", day: day[1] };
  }
  if (tabs.includes(key)) return { view: "feed", tab: key };
  return { view: "feed", tab: "inniu" };
}

/** The address of a page other than a story; "" for today's Inniu. */
export function addressFor({ view, tab, day } = {}) {
  if (view === "game") return "#bearnai";
  if (view === "about") return "#faoi";
  if (view === "feed" && day) return `#day/${day}${tab && tab !== "inniu" ? `/${tab}` : ""}`;
  if (view === "feed" && tab && tab !== "inniu") return `#${tab}`;
  return "";
}

// ---- Earlier days ----

const shiftDay = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The week to choose from: `today` ("YYYY-MM-DD") and the six days before, newest first. */
export function recentDays(today, n = 7) {
  return Array.from({ length: n }, (_, i) => shiftDay(today, -i));
}

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// As DayKey.irishLabel in the apps.
const WEEKDAYS_GA = ["Dé Domhnaigh", "Dé Luain", "Dé Máirt", "Dé Céadaoin", "Déardaoin", "Dé hAoine", "Dé Sathairn"];

/** "Today", "Yesterday" or "Sat 21 Nov", as the apps' day menu. */
export function dayLabel(key, today) {
  if (key === today) return "Today";
  if (today && key === shiftDay(today, -1)) return "Yesterday";
  const d = new Date(`${key}T12:00:00Z`);
  return `${WEEKDAYS_EN[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]}`;
}

/** The first tab's name for a day: Inniu, Inné, or the Irish weekday, as in the apps. */
export function dayTabLabel(key, today) {
  if (!key || key === today) return "Inniu";
  // Today's date not known yet (the page opened at an earlier day): the weekday.
  if (today && key === shiftDay(today, -1)) return "Inné";
  return WEEKDAYS_GA[new Date(`${key}T12:00:00Z`).getUTCDay()];
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

// ---- World regions ----
//
// RTÉ tags many world stories just "World", which the site shows as Domhan.
// The headline (then the opening of the story) usually names where it is,
// as App.jsx does with counties for Éire. Each entry is a label RTÉ's own
// tags already use (scripts/categories.js), with the words that place a
// story there. People who turn up everywhere (Trump, Putin) are left out,
// as is Russia; Britain and world bodies keep a story under Domhan.
export const REGIONS = [
  // Britain stays Domhan, as RTÉ files it: named first, it keeps the label.
  [null, /\b(uk|britain|british|london|england|scotland|scottish|wales|welsh|starmer|westminster|downing street)\b/i],
  // So do the world's own bodies: the UN, NATO, the Pope, summits.
  [null, /\b(united nations|pope|vatican)\b/i],
  [null, /\b(UN|UNGA|NATO|G7|G20|COP\d+)\b/],
  ["An Úcráin", /\b(ukraine|ukrainian|ukrainians|kyiv|kiev|zelensky|zelenskyy|kharkiv|odesa|odessa|donbas|donetsk|crimea|zaporizhzhia)\b/i],
  ["An Meánoirthear", /\b(israel|israeli|israelis|gaza|gazan|palestinian|palestinians|west bank|hamas|hezbollah|lebanon|lebanese|iran|iranian|tehran|syria|syrian|iraq|iraqi|yemen|houthi|houthis|saudi|netanyahu|jerusalem|tel aviv|qatar|middle east)\b/i],
  ["An Áise", /\b(china|chinese|beijing|japan|japanese|north korea|south korea|korean|pyongyang|seoul|kim jong|taiwan|india|pakistan|afghanistan|taliban|vietnam|thailand|philippines|indonesia|myanmar|hong kong|bangladesh)\b/i],
  ["An Afraic", /\b(africa|african|nigeria|kenya|sudan|ethiopia|somalia|congo|libya|uganda|ghana|zimbabwe|mali|rwanda)\b/i],
  ["An Eoraip", /\b(europe|european|brussels|france|french|paris|germany|german|berlin|spain|spanish|madrid|italy|italian|rome|poland|polish|netherlands|dutch|belgium|belgian|greece|greek|portugal|sweden|swedish|denmark|danish|norway|norwegian|finland|austria|hungary|hungarian|czech|romania|macron|merz)\b/i],
  ["Meiriceá", /\b(united states|american|americans|washington|white house|pentagon|congress|senate|new york|california|texas|florida|chicago|canada|canadian|mexico|mexican|brazil|venezuela|argentina|colombia)\b/i],
  ["Meiriceá", /\b(los angeles|hollywood|hawaii|alaska|miami|boston|seattle|san francisco|las vegas|minnesota|ohio|virginia|maine|alabama|mississippi)\b/i],
  // "US" and "LA" only in capitals: "us" and "la" are words.
  ["Meiriceá", /\b(USA?|LA)\b/],
];

/**
 * The region a world story is about, or null: the region named first in the
 * headline, else in the opening 200 characters of the story.
 */
export function regionIn(title, summary = "") {
  for (const text of [String(title || ""), String(summary || "").slice(0, 200)]) {
    let best = null;
    for (const [label, re] of REGIONS) {
      const m = re.exec(text);
      if (m && (!best || m.index < best.index)) best = { label, index: m.index };
    }
    // Britain or a world body named first (label null): Domhan, without
    // reading further.
    if (best) return best.label;
  }
  return null;
}

// ---- Desktop rows ----

/**
 * Lay a tab's groups out in grid rows of `cols` columns, so small groups sit
 * side by side instead of each leaving blank columns. A group as wide as the
 * grid takes whole rows; smaller ones share a row, each in the first row
 * with room. Gaps left at the end of a row are offered to `more(group, n)`,
 * which may return up to n older stories to add to that group.
 *
 *   groups  [{ label, items, mixed? }]
 *   returns [{ blocks: [{ group, span }] }], groups copied with any added items
 */
export function packGroups(groups, cols, more = () => []) {
  const rows = [];
  for (const g0 of groups) {
    const g = { ...g0, items: [...g0.items] };
    if (g.items.length >= cols) {
      rows.push({ wide: true, blocks: [{ group: g, span: cols }] });
      continue;
    }
    const used = r => r.blocks.reduce((n, b) => n + b.span, 0);
    const row = rows.find(r => !r.wide && used(r) + g.items.length <= cols);
    if (row) row.blocks.push({ group: g, span: g.items.length });
    else rows.push({ wide: false, blocks: [{ group: g, span: g.items.length }] });
  }
  for (const row of rows) {
    if (row.wide) {
      const g = row.blocks[0].group;
      const free = (cols - (g.items.length % cols)) % cols;
      if (free) g.items.push(...more(g, free).slice(0, free));
      continue;
    }
    let free = cols - row.blocks.reduce((n, b) => n + b.span, 0);
    // The last group in the row first: its blank cells are the ones beside it.
    for (let i = row.blocks.length - 1; i >= 0 && free > 0; i--) {
      const b = row.blocks[i];
      const got = more(b.group, free).slice(0, free);
      b.group.items.push(...got);
      b.span += got.length;
      free -= got.length;
    }
  }
  return rows.map(({ blocks }) => ({ blocks }));
}
