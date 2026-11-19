// The daily game: five gaps from yesterday's story, the same for everyone.
//
// Yesterday's checked Instagram post comes first (the studio's public /game
// address). With no checked post, or a sad story, it uses yesterday's first
// story that has enough hand-checked words. Writes public/data/game.json.
//
//   node scripts/game.js                 today's game
//   GAME_DATE=2026-11-20 node scripts/game.js

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "public", "data");
const STUDIO = "https://studio.dailysceal.com/game";

export const QUESTIONS = 5;
const WINDOW = 12;

// The same sad-story filter as the apps' gap fill (Shared/Story.swift).
const SAD_CATEGORIES = new Set(["Cúirt", "Coireacht"]);
const SAD = /\b(murder\w*|manslaughter|homicide\w*|kill(s|ed|er|ers|ing|ings)?|rap(e|es|ed|ist|ists)|sexual\w*|sex (offen\w*|abuse\w*|attack\w*|crime\w*|assault\w*)|abus(e|es|ed|er|ers|ive)|paedophil\w*|pedophil\w*|child porn\w*|grooming|stab(s|bed|bing|bings)?|shot dead|shootings?|gunm[ae]n|assault\w*|massacre\w*|genocide|atrocit\w*|suicid\w*|self-harm|dead|deadly|deaths?|die(s|d)?|dying|fatal\w*|corpses?|human remains|inquests?|funerals?|terror\w*|bomb\w*|hostages?|wars?|missiles?|air ?strikes?|kidnap\w*|abduct\w*|traffick\w*|violen(t|ce)|harass\w*|arson|drown\w*|cancer\w*|victims?|prison\w*|jailed|sentenced|convicted|jury|trial told|court hears|missing (woman|man|girl|boy|teen\w*|child|person)|epstein|nikita hand|guilty|crash(es|ed)?|collisions?|seriously injured|injured in|hijack\w*|attackers?|(man|woman|boy|girl|teen\w*|child)['’]s body|bod(y|ies) (found|discovered|recovered))\b/i;
const sadWord = en => ["attack", "disease"].includes(en.toLowerCase()) || SAD.test(en);

const MARKER = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
const plain = s => s.replace(MARKER, "$2");

export function dublinDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(d);
}
export function addDays(key, n) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A small seeded random, so the game is the same wherever it is built. */
export function seeded(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rnd) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export function isSad(story) {
  if (SAD_CATEGORIES.has(story.categoryIr)) return true;
  return SAD.test([story.title, story.headline, plain(story.text || "")].join(" "));
}

const sentences = text => text.split(/(?<=[.!?]["'’”)]?)\s+(?=[A-Z"'‘“(\d\[])/).map(s => s.trim()).filter(Boolean);

/** Every marker in the headline and story, with the sentence it sits in. */
function markersIn(headline, text) {
  const out = [];
  [headline, ...sentences(text)].filter(Boolean).forEach((sentence, si) => {
    for (const m of sentence.matchAll(MARKER)) out.push({ irish: m[1].trim(), english: m[2].trim(), sentence, si, at: m.index });
  });
  return out;
}

/** The sentence around one marker, every other marker in English, cut to a dozen words either side. */
export function split(sentence, at) {
  const before = plain(sentence.slice(0, at));
  const rest = sentence.slice(at).replace(/^\[\[[^\]]*\]\]/, "");
  const after = plain(rest);
  const b = before.split(" ").filter(Boolean);
  const a = after.split(" ").filter(Boolean);
  return {
    before: b.length > WINDOW ? "… " + b.slice(-WINDOW).join(" ") + " " : before,
    after: a.length > WINDOW ? (after.startsWith(" ") ? " " : "") + a.slice(0, WINDOW).join(" ") + " …" : after,
  };
}

/** Five words spread through the story: one per sentence first, in story order. */
export function choose(markers, n = QUESTIONS) {
  const seen = new Set(), unique = [];
  for (const m of markers) {
    const k = m.irish.toLowerCase();
    if (!seen.has(k) && !seen.has(m.english.toLowerCase())) { seen.add(k); seen.add(m.english.toLowerCase()); unique.push(m); }
  }
  const picked = [], used = new Set();
  for (const m of unique) if (picked.length < n && !used.has(m.si)) { picked.push(m); used.add(m.si); }
  for (const m of unique) if (picked.length < n && !picked.includes(m)) picked.push(m);
  return picked.sort((x, y) => x.si - y.si || x.at - y.at);
}

/** Three other real Irish words, close in length, so the answer doesn't stand out. */
export function wrongOptions(answer, pool, rnd) {
  const words = n => n.trim().split(/\s+/).length;
  const fit = pool
    .filter(w => w.ga.toLowerCase() !== answer.irish.toLowerCase() && w.en.toLowerCase() !== answer.english.toLowerCase())
    .map(w => ({ w, d: Math.abs(w.ga.length - answer.irish.length) + 4 * Math.abs(words(w.ga) - words(answer.irish)) + rnd() * 3 }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 30);
  const out = [];
  for (const { w } of shuffle(fit, rnd)) {
    if (out.length < 3 && !out.some(o => o.toLowerCase() === w.ga.toLowerCase())) out.push(w.ga);
  }
  return out;
}

const OPENER = /^[\s"'‘“(…]*$/;

/**
 * The word as a word list shows it. A capital that is only there because the
 * word starts the sentence comes off ("Gamers" → "gamers"), unless the
 * dictionary has it with a capital or it is a name ("Sinn Féin").
 */
export function listed(m, pool) {
  if (!OPENER.test(plain(m.sentence.slice(0, m.at)))) return { ga: m.irish, en: m.english };
  const fix = (s, key) => {
    const known = pool.find(w => w[key].toLowerCase() === s.toLowerCase());
    if (known) return known[key];
    const [first, ...rest] = s.split(" ");
    if (!/^\p{Lu}\p{Ll}/u.test(first) || rest.some(w => /^\p{Lu}/u.test(w))) return s;
    return first.charAt(0).toLowerCase() + s.slice(1);
  };
  return { ga: fix(m.irish, "ga"), en: fix(m.english, "en") };
}

/** The game from one story, or null when it has too few usable words. */
export function buildGame({ date, from, source, story, usable, pool }) {
  const markers = markersIn(story.headline, story.text).filter(usable);
  const picked = choose(markers);
  if (picked.length < QUESTIONS) return null;
  const rnd = seeded(date);
  // Another question's answer is never a wrong option: it would give it away.
  const answers = new Set(picked.map(m => m.irish.toLowerCase()));
  const others = pool.filter(w => !answers.has(w.ga.toLowerCase()));
  const questions = picked.map(m => {
    const wrong = wrongOptions(m, others, rnd);
    // Every option takes the answer's capital, so a capital can't give it away.
    const cap = /^\p{Lu}/u.test(m.irish);
    const wrongCased = wrong.map(w => (cap ? w.charAt(0).toUpperCase() + w.slice(1) : w));
    return { ...split(m.sentence, m.at), irish: m.irish, english: m.english, ...listed(m, pool), options: shuffle([...wrongCased, m.irish], rnd) };
  });
  if (questions.some(q => q.options.length !== 4)) return null;
  return { v: 1, date, from, source, title: story.title, link: story.link, questions };
}

const readJson = p => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

async function checkedPost(from) {
  try {
    const r = await fetch(`${STUDIO}?date=${from}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.post && typeof j.post.text === "string" ? j.post : null;
  } catch {
    return null;
  }
}

export async function makeGame(date = dublinDate(), { fetchPost = checkedPost, dataDir = DATA } = {}) {
  const from = addDays(date, -1);
  const focail = readJson(join(dataDir, "focail.json")) || { words: [] };
  const places = readJson(join(dataDir, "places.json")) || {};
  const placeNames = new Set([...Object.keys(places), ...Object.values(places)].map(s => String(s).toLowerCase()));
  const checked = new Set(focail.words.map(w => `${w.ga}|${w.en}`.toLowerCase()));
  const pool = focail.words.filter(w => !placeNames.has(w.ga.toLowerCase()) && !placeNames.has(w.en.toLowerCase()) && !sadWord(w.en));
  const plainWord = m => !placeNames.has(m.irish.toLowerCase()) && !placeNames.has(m.english.toLowerCase())
    && !sadWord(m.english) && m.english.split(" ").length <= 3
    // One or two Irish words: a long phrase stands out among the options.
    && m.irish.split(/\s+/).length <= 2;

  // 1. Yesterday's checked post: Joe's Irish, so any of its words will do.
  const post = await fetchPost(from);
  if (post && !isSad(post)) {
    const game = buildGame({ date, from, source: "post", story: post, usable: plainWord, pool });
    if (game) return game;
  }

  // 2. Yesterday's stories: only words from the checked dictionary.
  const day = readJson(join(dataDir, "archive", `${from}.json`)) || readJson(join(dataDir, "today.json"));
  const verified = m => plainWord(m) && checked.has(`${m.irish}|${m.english}`.toLowerCase());
  for (const s of (day && day.stories) || []) {
    for (const pct of ["25", "50"]) {
      const story = { title: s.title, link: s.link, categoryIr: s.categoryIr, headline: "", text: (s.levels && s.levels[pct]) || "" };
      if (!story.text || isSad(story)) continue;
      const game = buildGame({ date, from, source: "auto", story, usable: verified, pool });
      if (game) return game;
    }
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const game = await makeGame(process.env.GAME_DATE || dublinDate());
  if (!game) {
    console.log("No game today: nothing usable, game.json left as it was");
  } else {
    writeFileSync(join(DATA, "game.json"), JSON.stringify(game, null, 2) + "\n");
    console.log(`Game for ${game.date} from ${game.source === "post" ? "the checked post" : "yesterday's stories"}: ${game.title}`);
    for (const q of game.questions) console.log(`  ${q.irish} (${q.english})  [${q.options.join(", ")}]`);
  }
}
