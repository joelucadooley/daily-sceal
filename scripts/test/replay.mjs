// Archive replay: runs every archived story through the frozen baseline
// (scripts/test/baseline.js) and through scripts/lib, with MyMemory faked,
// and compares levels, summaryLevels and titleIr.
//
//   node scripts/test/replay.mjs                 compare, exit 1 on any difference
//   node scripts/test/replay.mjs --from 2026-10-01
//   node scripts/test/replay.mjs --archive <dir>
//
// No network: fetch is replaced before anything else runs, MyMemory answers
// come from a table built from the archive's own markers, and any other URL
// throws so a stray call fails the run.
import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

// ---- Network off ----

const MYMEMORY_HOST = "api.mymemory.translated.net";
let respond = null;            // (word) -> { status, text } | throws; set per mode
const net = { calls: 0, blocked: [] };

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname !== MYMEMORY_HOST || url.pathname !== "/get" || !respond) {
    net.blocked.push(String(input));
    throw new Error(`Network blocked in tests: ${url.origin}${url.pathname}`);
  }
  net.calls++;
  const { status, text } = respond(url.searchParams.get("q"));
  return {
    ok: true,
    json: async () => ({ responseStatus: status, responseData: { translatedText: text } }),
  };
};

const baseline = await import("./baseline.js");
const { loadDict } = await import("../lib/dict.js");
const words = await import("../lib/words.js");
const { createMyMemory } = await import("../lib/mymemory.js");
const { firstSentences, stripMarkers } = await import("../summary.js");

// ---- Options ----

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ARCHIVE = opt("--archive", fileURLToPath(new URL("../../public/data/archive/", import.meta.url)));
const FROM = opt("--from", "2026-09-11");
const TABLE_FROM = "2026-06-01";
const LEVELS = [10, 25, 50];

// ---- Archive ----

const dayFiles = readdirSync(ARCHIVE).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const readDay = f => JSON.parse(readFileSync(`${ARCHIVE}/${f}`, "utf-8"));

// MyMemory stand-in: every [[irish|english]] marker at levels 10/25/50 (75
// and 100 glosses are misaligned), english lowercased -> its most frequent
// Irish. Ties go to the alphabetically first Irish so the table is stable.
const MARKER = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
const counts = new Map();
for (const f of dayFiles.filter(f => f.slice(0, 10) >= TABLE_FROM)) {
  for (const s of readDay(f).stories || []) {
    for (const block of [s.levels, s.summaryLevels]) {
      for (const pct of LEVELS) {
        const text = block?.[pct];
        if (typeof text !== "string") continue;
        for (const m of text.matchAll(MARKER)) {
          const en = m[2].toLowerCase();
          if (!counts.has(en)) counts.set(en, new Map());
          const c = counts.get(en);
          c.set(m[1], (c.get(m[1]) || 0) + 1);
        }
      }
    }
  }
}
const TABLE = new Map();
for (const [en, c] of counts) {
  const best = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
  TABLE.set(en, best);
}

// Stories: unique by link, first appearance wins.
const stories = [];
const seen = new Set();
const replayFiles = dayFiles.filter(f => f.slice(0, 10) >= FROM);
for (const f of replayFiles) {
  for (const s of readDay(f).stories || []) {
    if (!s.link || seen.has(s.link)) continue;
    seen.add(s.link);
    stories.push({ day: f.slice(0, 10), story: s });
  }
}

// The exact inputs processStory used: `summary` was overwritten with baseText.
const inputsOf = s => {
  const text = s.summary || "";
  return { text, rss: s.rssSummary || firstSentences(stripMarkers(text)), title: s.title || "" };
};

// ---- MyMemory answers per mode ----

const unknownWords = new Set();
function tableAnswer(q) {
  const hit = TABLE.get(q.toLowerCase());
  if (hit === undefined) {
    unknownWords.add(q.toLowerCase());
    return { status: 200, text: q };          // rejected by isGoodTranslation, as live junk would be
  }
  return { status: 200, text: hit };
}

// Stable per word, so both sides see the same answer whatever order they ask in.
const bucket = q => createHash("sha1").update(q.toLowerCase()).digest()[0] % 20;

// Exercises every branch after the lookup: odd capitals, stray punctuation,
// junk notes, hyphen fragments, quota status and thrown errors.
function noisyAnswer(q) {
  const base = tableAnswer(q);
  switch (bucket(q)) {
    case 0: return { status: 200, text: base.text.toUpperCase() };
    case 1: return { status: 200, text: ` ${base.text}.` };
    case 2: return { status: 200, text: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" };
    case 3: return { status: 429, text: "" };
    case 4: throw new Error("socket hang up");
    case 5: return { status: 200, text: `${base.text}-` };
    case 6: return { status: 200, text: undefined };
    default: return base;
  }
}

function outageAnswer() {
  throw new Error("fetch failed");
}

// ---- Runs ----

const noSleep = async () => {};
baseline.setSleep(noSleep);

async function runBaseline() {
  baseline.clearCache();
  const out = [];
  for (const { story } of stories) {
    const { text, rss, title } = inputsOf(story);
    const levels = {}, summaryLevels = {};
    for (const pct of LEVELS) {
      try { levels[pct] = await baseline.buildLevel(text, pct); } catch { levels[pct] = text; }
    }
    for (const pct of LEVELS) {
      try { summaryLevels[pct] = await baseline.buildLevel(rss, pct); } catch { summaryLevels[pct] = rss; }
    }
    out.push({ levels, summaryLevels, titleIr: baseline.markHeadline(title) });
  }
  return out;
}

async function runLib(breakerLimit) {
  const dict = loadDict();
  const mm = createMyMemory({ sleep: noSleep, breakerLimit });
  const deps = { dict, lookup: mm.lookup, onRejected: w => mm.noteRejected(w) };
  const out = [];
  for (const { story } of stories) {
    const { text, rss, title } = inputsOf(story);
    const levels = {}, summaryLevels = {};
    for (const pct of LEVELS) {
      try { levels[pct] = await words.buildLevel(text, pct, deps); } catch { levels[pct] = text; }
    }
    for (const pct of LEVELS) {
      try { summaryLevels[pct] = await words.buildLevel(rss, pct, deps); } catch { summaryLevels[pct] = rss; }
    }
    out.push({ levels, summaryLevels, titleIr: words.markHeadline(title, dict) });
  }
  return { out, mm };
}

const digest = out => createHash("sha256").update(JSON.stringify(out)).digest("hex").slice(0, 16);

function compare(before, after) {
  const diffs = [];
  before.forEach((b, i) => {
    const a = after[i];
    for (const field of ["levels", "summaryLevels"]) {
      for (const pct of LEVELS) {
        if (b[field][pct] !== a[field][pct]) diffs.push({ i, where: `${field}[${pct}]`, b: b[field][pct], a: a[field][pct] });
      }
    }
    if (b.titleIr !== a.titleIr) diffs.push({ i, where: "titleIr", b: b.titleIr, a: a.titleIr });
  });
  return diffs;
}

let failed = false;
const fail = msg => { failed = true; console.log(`FAIL ${msg}`); };

if (!Object.keys(baseline.OVERRIDES).length) fail("baseline loaded no overrides");
if (!stories.length) fail(`no stories found in ${ARCHIVE} from ${FROM}`);

console.log(`Archive ${replayFiles[0]?.slice(0, 10)} to ${replayFiles.at(-1)?.slice(0, 10)}: ${replayFiles.length} days, ${stories.length} unique stories`);
console.log(`MyMemory table: ${TABLE.size} words from markers since ${TABLE_FROM}`);
console.log("");

async function mode(name, answer, breakerLimit, check) {
  respond = answer;
  net.calls = 0;
  const before = await runBaseline();
  const beforeCalls = net.calls;
  net.calls = 0;
  const { out: after, mm } = await runLib(breakerLimit);
  const afterCalls = net.calls;
  const diffs = compare(before, after);
  const compared = stories.length * (LEVELS.length * 2 + 1);
  const same = diffs.length === 0;
  console.log(`${name}: ${compared - diffs.length}/${compared} identical, ` +
    `sha ${digest(before)} vs ${digest(after)}, calls ${beforeCalls} vs ${afterCalls}`);
  console.log(`  ${mm.summary()}`);
  if (!same) {
    fail(`${name}: ${diffs.length} differences`);
    for (const d of diffs.slice(0, 5)) {
      const { day, story } = stories[d.i];
      console.log(`  ${day} ${story.id} ${d.where}\n    before: ${d.b}\n    after:  ${d.a}`);
    }
  }
  if (check) check({ before, after, beforeCalls, afterCalls, mm });
  return { before, after };
}

// 1. Archive answers, live breaker setting.
const { before } = await mode("archive table", tableAnswer, undefined, ({ mm }) => {
  if (mm.breakerOpen) fail("breaker opened with no errors");
});
console.log(`  words with no archive Irish (would need a live lookup): ${unknownWords.size}`);

// How close the baseline gets to what was actually published (information
// only: overrides changed on 09-17 and 10-01, and the table is a stand-in).
let published = 0, reproduced = 0;
stories.forEach(({ story }, i) => {
  for (const field of ["levels", "summaryLevels"]) {
    for (const pct of LEVELS) {
      if (typeof story[field]?.[pct] !== "string") continue;
      published++;
      if (story[field][pct] === before[i][field][pct]) reproduced++;
    }
  }
});
console.log(`  baseline reproduces ${reproduced}/${published} published texts exactly`);

// 2. Noisy answers: casing, punctuation, junk, quota status, thrown errors.
// The breaker is off here because errors are not cached and repeat, which
// would trip it; the outage run below covers the breaker.
await mode("noisy answers", noisyAnswer, Infinity, ({ mm }) => {
  if (!mm.stats.errors) fail("noisy run produced no errors to compare");
  if (!mm.rejected) fail("noisy run produced no rejections to compare");
});

// 3. Outage: every call fails. Output must still match (all MyMemory words
// stay English), the breaker opens after 15 calls and no more are made.
await mode("outage", outageAnswer, undefined, ({ afterCalls, mm }) => {
  if (!mm.breakerOpen) fail("breaker did not open during the outage");
  if (afterCalls !== 15) fail(`outage made ${afterCalls} calls, expected 15`);
});

if (net.blocked.length) fail(`${net.blocked.length} blocked network calls, first: ${net.blocked[0]}`);

console.log("");
console.log(failed ? "Replay FAILED" : "Replay OK: lib matches the frozen baseline for every story");
process.exit(failed ? 1 : 0);
