// Archive replay: every archived story (unique by link) goes through the
// frozen baseline (scripts/test/baseline.js, "before") and through
// scripts/lib ("after") with MyMemory faked, and the two are measured.
//
//   node scripts/test/replay.mjs                 table + checks, exit 1 on a failed check
//   node scripts/test/replay.mjs --from 2026-10-01
//   node scripts/test/replay.mjs --archive <dir>
//   node scripts/test/replay.mjs --senses <file>   as if those senses were approved
//
// No network: fetch is replaced before anything else runs (archive.mjs), the
// MyMemory answers come from a table built from the archive's own markers,
// and any other URL throws so a stray call fails the run.
import { net, loadArchive, makeAnswers, archiveDir, LEVELS } from "./archive.mjs";
import {
  runBaseline, runLib, collect, tableRows, headlineRows, markdownTable, LEVEL_HEAD, inputsOf,
} from "./runs.mjs";
import * as words from "../lib/words.js";
import { parse, quant as quantile } from "./metrics.mjs";
import { loadDict, loadSenses } from "../lib/dict.js";
import { resolve } from "path";
import { pathToFileURL } from "url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const archive = loadArchive({ dir: archiveDir(args), from: opt("--from", "2026-09-11") });
const { stories, table, replayFiles } = archive;
const answers = makeAnswers(table);
const sensesFile = opt("--senses", null);
const dict = sensesFile
  ? { ...loadDict(), senses: loadSenses(pathToFileURL(resolve(sensesFile))) }
  : loadDict();
if (sensesFile) console.log(`Senses as if approved: ${Object.keys(dict.senses).length} words from ${sensesFile}`);

let failed = false;
const fail = msg => { failed = true; console.log(`FAIL ${msg}`); };

if (!stories.length) fail(`no stories found in ${archive.dir}`);
console.log(`Archive ${replayFiles[0]?.slice(0, 10)} to ${replayFiles.at(-1)?.slice(0, 10)}: ` +
  `${replayFiles.length} days, ${stories.length} unique stories`);
console.log(`MyMemory table: ${table.size} words from archive markers`);

// ---- 1. Archive answers: the before/after table ----

net.calls = 0;
const before = await runBaseline(stories, answers.tableAnswer);
const beforeCalls = net.calls;
net.calls = 0;
const lib = await runLib(stories, answers.tableAnswer, { dict });
const afterCalls = net.calls;
const mBefore = collect(stories, before, lib.dict, archive);
const mAfter = collect(stories, lib.out, lib.dict, archive);

console.log(`\nArchive answers: MyMemory calls ${beforeCalls} before, ${afterCalls} after`);
console.log(`  ${lib.mm.summary()}`);
console.log(`  words with no archive Irish (would need a live lookup): ${answers.unknownWords.size}`);
if (lib.mm.breakerOpen) fail("breaker opened with no errors");

for (const [field, label] of [["levels", "Article text"], ["summaryLevels", "Summaries (iOS)"]]) {
  console.log(`\n${label}\n`);
  console.log(markdownTable(LEVEL_HEAD, tableRows(mBefore, mAfter, field)));
}
console.log(`\nHeadlines and MyMemory\n`);
console.log(markdownTable(["Metric", "before", "after"], headlineRows(mBefore, mAfter)));
const wrongLeft = [...LEVELS.flatMap(p => ["levels", "summaryLevels"].flatMap(f => [...mAfter[f][p].knownWrongPairs]))];
if (wrongLeft.length) console.log(`\nKnown wrong pairs still present: ${[...new Set(wrongLeft.map(([k]) => k))].join(", ")}`);
if (mAfter.headlines.nameExamples.length) console.log(`Name parts after: ${mAfter.headlines.nameExamples.join(", ")}`);

// Key numbers in a few lines (used in commit messages).
{
  const q = (r, p) => `${quantile(r.longest, 0.5)}/${quantile(r.longest, 0.9)}`;
  const per = (m, f, fn) => LEVELS.map(p => fn(m[f][p], p)).join(", ");
  const both = (label, f, fn) => console.log(`${label}: ${per(mBefore, f, fn)} -> ${per(mAfter, f, fn)}`);
  const d = r => (100 * r.markers / r.words).toFixed(1);
  console.log("\nKey numbers, levels 10, 25, 50 (before -> after)");
  both("  article density", "levels", d);
  both("  summary density", "summaryLevels", d);
  const change = f => LEVELS.map(p => {
    const b = mBefore[f][p], x = mAfter[f][p];
    return `${(100 * ((x.markers / x.words) / (b.markers / b.words) - 1)).toFixed(1)}%`;
  }).join(", ");
  console.log(`  density change: article ${change("levels")}; summary ${change("summaryLevels")} (L1 allows 15%)`);
  both("  article longest gap median/p90", "levels", q);
  both("  summary longest gap median/p90", "summaryLevels", q);
  both("  article pairs too close", "levels", r => r.tooClose);
  both("  article repeats over cap", "levels", r => r.overCap);
  both("  article thirds", "levels", r => r.thirds.map(t => Math.round(100 * t / Math.max(1, r.markers))).join("/"));
  both("  article verified share", "levels", r => `${Math.round(100 * r.verified / Math.max(1, r.markers))}%`);
  both("  summary verified share", "summaryLevels", r => `${Math.round(100 * r.verified / Math.max(1, r.markers))}%`);
  const kw = m => LEVELS.reduce((n, p) => n + m.levels[p].knownWrong + m.summaryLevels[p].knownWrong, 0);
  console.log(`  known wrong pairs, all texts: ${kw(mBefore)} -> ${kw(mAfter)}`);
  const h = m => `${(100 * m.headlines.none / m.headlines.n).toFixed(1)}% none, ${m.headlines.sideBySide} side by side, ${m.headlines.nameParts} name parts`;
  console.log(`  headlines: ${h(mBefore)} -> ${h(mAfter)}`);
  console.log(`  MyMemory words per day: ${mBefore.mmPerDay.toFixed(0)} -> ${mAfter.mmPerDay.toFixed(0)}`);
}

// L1: density within 15% of today at every level, article and summary.
const DENSITY_TOLERANCE = 0.15;
for (const field of ["levels", "summaryLevels"]) {
  for (const pct of LEVELS) {
    const b = mBefore[field][pct], a = mAfter[field][pct];
    const ratio = (a.markers / a.words) / (b.markers / b.words);
    if (Math.abs(ratio - 1) > DENSITY_TOLERANCE) {
      fail(`${field}[${pct}] density ${(100 * a.markers / a.words).toFixed(2)} per 100 words is ` +
        `${((ratio - 1) * 100).toFixed(1)}% from today's ${(100 * b.markers / b.words).toFixed(2)}`);
    }
  }
}

// Rule checks, switched on as each rule lands in scripts/lib.
const rules = words.LEVEL_RULES;
if (rules) {
  for (const field of ["levels", "summaryLevels"]) {
    for (const pct of LEVELS) {
      const a = mAfter[field][pct];
      if (a.tooClose) fail(`${field}[${pct}]: ${a.tooClose} marker pairs closer than ${rules[pct].minBetween} words (P2)`);
      if (a.overCap) fail(`${field}[${pct}]: ${a.overCap} repeats over the cap of ${rules[pct].repeatCap} (P5)`);
    }
    if (!rules[10].machine) {
      const a = mAfter[field][10];
      if (a.verified !== a.markers) fail(`${field}[10]: ${a.markers - a.verified} Beginner markers not from the dictionary (W3)`);
      if (a.edWords) fail(`${field}[10]: ${a.edWords} -ed words at Beginner (W8)`);
    }
  }
}

// W6: no marker on a grammar word, a contraction or anything with a digit;
// G5: taking the markers out (as App.jsx reads them) gives back the input.
{
  const appStrip = t => t.replace(/\[\[([^\|]+)\|([^\]]+)\]\]/g, "$2");
  const own = (o, k) => Object.hasOwn(o, k);
  let grammar = 0, broken = 0;
  const examples = [];
  stories.forEach(({ story }, i) => {
    const { text, rss, title } = inputsOf(story);
    const r = lib.out[i];
    const pairs = [[r.titleIr, title], ...LEVELS.flatMap(p => [[r.levels[p], text], [r.summaryLevels[p], rss]])];
    for (const [marked, input] of pairs) {
      if (appStrip(marked) !== input || marked.includes("[[[")) broken++;
      for (const m of parse(marked).markers) {
        const en = m.en.toLowerCase();
        if (words.FUNCTION_WORDS.has(en) || /\p{N}/u.test(en) || (/['’]/.test(en) && !own(lib.dict.overrides, en))) {
          grammar++;
          if (examples.length < 5) examples.push(`${m.en}=${m.ga}`);
        }
      }
    }
  });
  console.log(`\nGrammar words, contractions and numbers marked: ${grammar}${examples.length ? ` (${examples.join(", ")})` : ""}`);
  console.log(`Texts whose markers do not strip back to the input: ${broken}`);
  if (grammar) fail(`${grammar} markers on grammar words, contractions or numbers (W6)`);
  if (broken) fail(`${broken} texts do not strip back to their input (G5)`);
}
if (words.NEVER_MACHINE && wrongLeft.length) fail(`${wrongLeft.length} known wrong pairs still present`);
if (words.headlineHasEligible) {
  if (mAfter.headlines.sideBySide) fail(`${mAfter.headlines.sideBySide} headlines with side-by-side markers (H2)`);
  if (mAfter.headlines.nameParts) fail(`${mAfter.headlines.nameParts} name parts marked in headlines (B5)`);
}

// ---- 2. Noisy answers: nothing odd may reach a marker ----

net.calls = 0;
const noisy = await runLib(stories, answers.noisyAnswer, { breakerLimit: Infinity, dict });
console.log(`\nNoisy answers: ${noisy.mm.summary()}`);
if (!noisy.mm.stats.errors) fail("noisy run produced no errors");
if (!noisy.mm.rejected) fail("noisy run produced no rejections");
let junk = 0;
for (const r of noisy.out) {
  for (const field of ["levels", "summaryLevels"]) {
    for (const pct of LEVELS) {
      for (const m of parse(r[field][pct]).markers) {
        if (/mymemory|quota|undefined/i.test(m.ga) || /^-|-$/.test(m.ga) || /\p{Lu}{3,}/u.test(m.ga)) junk++;
      }
    }
  }
}
// Hyphen fragments pass the baseline's isGoodTranslation, so this is only a
// hard check once the lib rejects them (S4).
console.log(`  junk answers in markers: ${junk}`);
if (junk && !words.isGoodTranslation("record", "barr-")) fail(`noisy run let ${junk} junk answers into markers`);

// ---- 3. Outage: every call fails ----

net.calls = 0;
const outage = await runLib(stories, answers.outageAnswer, { dict });
const outageCalls = net.calls;
console.log(`Outage: ${outage.mm.summary()}`);
if (!outage.mm.breakerOpen) fail("breaker did not open during the outage");
if (outageCalls !== 15) fail(`outage made ${outageCalls} calls, expected 15`);
const outageMarkers = outage.out.reduce((n, r) => n + parse(r.levels[10]).markers.length, 0);
if (!outageMarkers) fail("outage left no dictionary markers at Beginner");
if (rules && !rules[10].machine) {
  const same = outage.out.filter((r, i) => r.levels[10] === lib.out[i].levels[10] && r.summaryLevels[10] === lib.out[i].summaryLevels[10]).length;
  console.log(`  Beginner unchanged by the outage: ${same}/${stories.length} stories`);
  if (same !== stories.length) fail("Beginner changed during the outage although it uses no machine translation");
}

if (net.blocked.length) fail(`${net.blocked.length} blocked network calls, first: ${net.blocked[0]}`);

console.log("");
console.log(failed ? "Replay FAILED" : "Replay OK");
process.exit(failed ? 1 : 0);
