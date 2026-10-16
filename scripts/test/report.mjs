// Before/after report for Joe: 12 stories side by side at each level with
// the markers highlighted, the plan E metrics tables, the defaults in use,
// spot checks and same-event pairs. Offline, like the replay.
//
//   node scripts/test/report.mjs --out <file.html> [--from 2026-09-11] [--senses <file>]
import { net, loadArchive, makeAnswers, archiveDir, LEVELS, MARKER } from "./archive.mjs";
import { runBaseline, runLib, collect, tableRows, headlineRows, LEVEL_HEAD, inputsOf } from "./runs.mjs";
import { KNOWN_WRONG, parse, PAST_ACTIVE_LOOSE, passiveBefore, capitalModal } from "./metrics.mjs";
import * as words from "../lib/words.js";
import { loadDict, loadSenses } from "../lib/dict.js";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = opt("--out", null);
if (!OUT) {
  console.error("Usage: node scripts/test/report.mjs --out <file.html>");
  process.exit(1);
}
const archive = loadArchive({ dir: archiveDir(args), from: opt("--from", "2026-09-11") });
const { stories } = archive;
const answers = makeAnswers(archive.table);
const sensesFile = opt("--senses", null);
const dict = sensesFile ? { ...loadDict(), senses: loadSenses(pathToFileURL(resolve(sensesFile))) } : loadDict();

const before = await runBaseline(stories, answers.tableAnswer);
const lib = await runLib(stories, answers.tableAnswer, { dict });
const after = lib.out;
const mB = collect(stories, before, dict, archive);
const mA = collect(stories, after, dict, archive);
if (net.blocked.length) throw new Error(`network call attempted: ${net.blocked[0]}`);

// ---- Story picks: the problem stories from the analysis, then one per feed ----

const PICK_TITLES = [
  "Something for the Weekend: Piers McGrail",
  "Tesco raises profit outlook",
  "Public sector workers threaten strike",
  "Harris signals cut on heating oil tax",
  "Could cheap flights be about to get more expensive",
  "Sibling rivalry: Franklin brothers",
];
const picks = [];
for (const t of PICK_TITLES) {
  const k = stories.findIndex(({ story }) => (story.title || "").startsWith(t));
  if (k >= 0 && !picks.includes(k)) picks.push(k);
}
const wc = k => parse(inputsOf(stories[k].story).text).words;
for (const feed of ["world", "gaa", "soccer", "rugby", "politics", "life", "ents", "culture", "news", "ireland", "business", "sport"]) {
  if (picks.length >= 12) break;
  if (picks.some(k => stories[k].story.feed === feed)) continue;
  const pool = stories.map((s, k) => k).filter(k => stories[k].story.feed === feed && stories[k].day >= "2026-10-01");
  if (!pool.length) continue;
  pool.sort((a, b) => wc(a) - wc(b));
  picks.push(pool[Math.floor(pool.length / 2)]);
}

// ---- HTML helpers ----

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wrongSet = new Set(KNOWN_WRONG.map(([e, g]) => `${e}|${g}`));
const lowerOverrides = new Map(Object.entries(dict.overrides).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
const placeIrish = new Set(Object.values(dict.places));
const isVerified = (en, ga) => lowerOverrides.get(en.toLowerCase().split(/[\s-]+/).join(" ")) === ga.toLowerCase() || placeIrish.has(ga);

function marked(text) {
  let out = "", last = 0;
  for (const m of text.matchAll(MARKER)) {
    out += esc(text.slice(last, m.index));
    const [ga, en] = [m[1], m[2]];
    const cls = wrongSet.has(`${en.toLowerCase()}|${ga.toLowerCase()}`) ? "m wrong" : isVerified(en, ga) ? "m" : "m machine";
    out += `<mark class="${cls}"><b>${esc(ga)}</b><i>${esc(en)}</i></mark>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}
const count = t => parse(t).markers.length;
const table = (head, rows) =>
  `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
  rows.map(r => `<tr>${r.map((c, i) => `<${i ? "td" : "th"}>${esc(c)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("") +
  `</tbody></table></div>`;

// ---- Spot checks ----

const tally = (filter) => {
  const c = new Map();
  for (const r of after) for (const pct of LEVELS) for (const f of ["levels", "summaryLevels"]) {
    for (const m of parse(r[f][pct]).markers) if (filter(m)) {
      const k = `${m.en.toLowerCase()} = ${m.ga}`;
      c.set(k, (c.get(k) || 0) + 1);
    }
  }
  return [...c].sort((a, b) => b[1] - a[1]);
};
const DET = words.DETERMINERS;
const afterDet = tally(m => DET.has(m.prev.toLowerCase()) && !isVerified(m.en, m.ga));
const ingMarkers = tally(m => /ing$/i.test(m.en));
const thinBeginner = stories.map((s, k) => k).filter(k => count(after[k].levels[10]) < 3)
  .map(k => ({ k, title: stories[k].story.title || "", day: stories[k].day, b: count(before[k].levels[10]), a: count(after[k].levels[10]), words: wc(k) }))
  .sort((x, y) => (y.b - y.a) - (x.b - x.a) || y.words - x.words);
const thinBefore = stories.filter((s, k) => count(before[k].levels[10]) < 3).length;
// Capitals (G4): dictionary or sense Irish whose capitals the old matchCase
// would have changed (it lowercased everything after the first letter).
const oldMatchCase = (en, ga) => /^\p{Ll}/u.test(en) ? ga.toLowerCase() : ga.charAt(0).toUpperCase() + ga.slice(1).toLowerCase();
const capitals = tally(m => isVerified(m.en, m.ga) && m.ga !== oldMatchCase(m.en, m.ga) && !placeIrish.has(m.ga));

// Checks added after the review: the same counts on the before and after
// output (the replay fails on any of these after).
const CUES = new Set(["to", "will", "would", "can", "could", "should", "may", "might", "must", "did", "does", "do",
  "i", "we", "you", "they", "he", "she", "it", "who", "not"]);
const appStrip = t => t.replace(/\[\[([^\|]+)\|([^\]]+)\]\]/g, "$2");
function reviewCounts(out) {
  const c = { grammar: 0, joined: 0, possessive: 0, cueNoun: 0, beActive: 0, nounShow: 0, brackets: 0, placeName: 0 };
  out.forEach((r, k) => {
    const texts = [r.titleIr, ...LEVELS.flatMap(p => [r.levels[p], r.summaryLevels[p]])];
    texts.forEach((t, n) => {
      if (t.includes("[[[")) c.brackets++;
      for (const m of t.matchAll(MARKER)) {
        const [all, ga, en] = m;
        const lo = en.toLowerCase(), before = t.slice(0, m.index), rest = t.slice(m.index + all.length);
        const rawPrev = (appStrip(before).match(/([\p{L}\p{N}'’]+)[^\p{L}\p{N}]*$/u) || [])[1] || "";
        const prev = rawPrev.toLowerCase();
        const next = (appStrip(rest).match(/^\s+([\p{L}\p{N}'’]+)/u) || [])[1] || "";
        if (words.FUNCTION_WORDS.has(lo) || /\p{N}/u.test(en) || (/['’]/.test(en) && !Object.hasOwn(dict.overrides, lo))) c.grammar++;
        if (/[\p{L}\p{N}]-$/u.test(before) || /^-[\p{L}\p{N}]/u.test(rest)) c.joined++;
        if (/s$/i.test(en) && /^['’]\s+\p{Ll}/u.test(rest) && !words.quoteOpen(appStrip(before).split(/[.!?]\s/).at(-1) + en)) c.possessive++;
        const nounIrish = Object.hasOwn(dict.overrides, lo) && dict.overrides[lo] === ga && !words.DICT_VERBS.has(lo);
        if (nounIrish && words.NOUN_VERB_WORDS.has(lo) && ((CUES.has(prev) && !capitalModal(rawPrev)) || (/^(has|have|had)$/.test(prev) && !/s$/.test(lo)))) c.cueNoun++;
        if (/ed$/.test(lo) && PAST_ACTIVE_LOOSE.test(ga) && passiveBefore(appStrip(before))) c.beActive++;
        if (/léiríonn/.test(ga) && words.DETERMINERS.has(prev)) c.nounShow++;
        if (placeIrish.has(ga) && /^\p{Lu}/u.test(next) && !/^(county|co|gaa|fm|council|senior|minor|hurling|football|camogie|ladies)$/i.test(next)) c.placeName++;
      }
    });
  });
  return c;
}
const rcB = reviewCounts(before), rcA = reviewCounts(after);
const reviewRows = [
  ["Grammar words, contractions and numbers (them, what, hasn't, 21st)", "grammar"],
  ["Part of a hyphenated word (nine-month, All-Ireland)", "joined"],
  ["Plural possessive (members' bar)", "possessive"],
  ["Place name before a capital (Derry City, Tyrone McKenna)", "placeName"],
  ["Noun Irish on a verb (to pay a, will match, has forecast)", "cueNoun"],
  ["Past Irish on a passive (was announced, was first announced)", "beActive"],
  ["léiríonn after a determiner (the show)", "nounShow"],
  ["Texts with [[[ (a word in square brackets)", "brackets"],
].map(([label, k]) => [label, String(rcB[k]), String(rcA[k])]);
const share = r => `${(100 * r.verified / Math.max(1, r.markers)).toFixed(1)}%`;
const thinSummary = stories.map((s, k) => k).filter(k => count(after[k].summaryLevels[10]) === 0);

// Same-event pairs (question 12: reported only, story choice unchanged).
const STOP = new Set(("a an the and or but in on at to for of with is are was were be been has have had will would " +
  "could should may might this that these those it its he she they we you his her their our as by from not no so if " +
  "than then when which who over into after before about up out also just more there said says new says after one two " +
  "first last year years says rté").split(" "));
const bag = s => new Set(((s.title || "") + " " + (s.rssSummary || "")).toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(w => w.length > 2 && !STOP.has(w)) || []);
const jaccard = (a, b) => {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i || 1);
};
const SAME_EVENT = 0.22;
const pairs = [];
for (const d of archive.days) {
  const ss = d.links.map(l => stories[archive.byLink.get(l)].story);
  const bags = ss.map(bag);
  for (let x = 0; x < ss.length; x++) for (let y = x + 1; y < ss.length; y++) {
    const j = jaccard(bags[x], bags[y]);
    if (j >= SAME_EVENT) pairs.push({ day: d.day, a: ss[x].title, b: ss[y].title, j });
  }
}
const uniquePairs = [...new Map(pairs.map(p => [`${p.a}|${p.b}`, p])).values()];

// ---- Page ----

const LEVEL_NAME = { 10: "Beginner", 25: "Foundation", 50: "Intermediate" };
const pctChange = (f, p) => {
  const b = mB[f][p], a = mA[f][p];
  return `${(((a.markers / a.words) / (b.markers / b.words) - 1) * 100).toFixed(0)}%`;
};

const storyCards = pct => picks.map(k => {
  const { story } = stories[k];
  const b = before[k], a = after[k];
  return `<article class="story">
  <p class="meta">${esc(stories[k].day)} · ${esc(story.feed)} · ${esc(story.section)}</p>
  <div class="pair head"><div><span class="lab">Before</span><h3>${marked(b.titleIr)}</h3></div><div><span class="lab">After</span><h3>${marked(a.titleIr)}</h3></div></div>
  <div class="pair"><div><span class="lab">Before · ${count(b.summaryLevels[pct])} in the app summary</span><p class="sum">${marked(b.summaryLevels[pct])}</p></div>
  <div><span class="lab">After · ${count(a.summaryLevels[pct])} in the app summary</span><p class="sum">${marked(a.summaryLevels[pct])}</p></div></div>
  <div class="pair"><div><span class="lab">Before · ${count(b.levels[pct])} in the story</span><p>${marked(b.levels[pct])}</p></div>
  <div><span class="lab">After · ${count(a.levels[pct])} in the story</span><p>${marked(a.levels[pct])}</p></div></div>
</article>`;
}).join("\n");

const defaults = [
  ["Q1 Beginner Irish", "Dictionary only: overrides, places, approved senses", "MACHINE_AT[10] = \"none\""],
  ["Q2 Foundation and Intermediate", "Foundation: machine nouns only for a gap of 12+ words with no dictionary word. Intermediate: machine after the dictionary", "MACHINE_AT[25] = \"gap\", GAP_REPAIR_FROM = 12, MACHINE_AT[50] = \"normal\""],
  ["Q3 Senses", "Mechanism built; scripts/senses.json ships empty", "scripts/senses.json = {}"],
  ["Q4 focail.json", "Unchanged: senses are not hand-checked in the app yet", "generate.js"],
  ["Q5 Ireland, Dublin, Cork, provinces", "Unchanged: English in stories, places in headlines", "NEVER_TRANSLATE"],
  ["Q6 Months", "Unchanged: off, in headlines too", "NEVER_TRANSLATE, MONTHS"],
  ["Q7 Government, Minister, Budget", "A capital mid-sentence is a name: English", "shouldTranslate"],
  ["Q8 Grammar words", "From Foundation up", "GRAMMAR_WORDS_FROM = 25"],
  ["Q9 Root verb forms", "Skipped: rises, spans, reflects, return", "SKIP_ROOT_FORMS, ROOT_FORMS"],
  ["Q10 Longest gap", "40 / 25 / 12 words", "MAX_GAP"],
  ["Q11 Repeats", "1 / 2 / 3", "REPEAT_CAP"],
  ["Q12 Story choice", "Unchanged; same-event pairs listed below", "feeds.js untouched"],
];
const tuning = [
  ["Sentence cap", "2 markers in a sentence of 20+ words at Beginner and Foundation (rules table: 30+)", "LONG_SENTENCE"],
  ["Foundation gap repair", "Machine nouns for a gap of 12+ words with no dictionary word (L4: over 25)", "GAP_REPAIR_FROM"],
  ["Target", "Candidates x level x 2.2 / 1.2 / 1.2, as the spacing rules and the review fixes hold markers back", "DENSITY"],
  ["Which word first", "Tier, whole phrases, then the word that shuts out fewest others, then the middle of the gap", "pickMarkers"],
  ["Intermediate verbs", "Machine -ed verbs and -ly adverbs, only with one past, participle or adjective Irish word (no noun, adverb or pronoun)", "verbFormFits"],
  ["Long gaps", "The sentence cap gives way in a gap over the limit; spacing and repeats never do", "pickMarkers"],
];

const css = `
:root{--bg:#f4f1ec;--card:#fff;--ink:#0d2137;--muted:#6b7380;--line:#e2ddd4;--accent:#e8951e;--ok:#15803d;--bad:#b42318;--mark:#fdf0d8;--machine:#eef2f7}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0b1420;--card:#13202f;--ink:#e8edf3;--muted:#9aa5b4;--line:#243245;--accent:#f0a83a;--ok:#4ade80;--bad:#f87171;--mark:#3a2c12;--machine:#1d2a3a}}
:root[data-theme="dark"]{--bg:#0b1420;--card:#13202f;--ink:#e8edf3;--muted:#9aa5b4;--line:#243245;--accent:#f0a83a;--ok:#4ade80;--bad:#f87171;--mark:#3a2c12;--machine:#1d2a3a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:28px;margin:0 0 4px}h2{font-size:20px;margin:40px 0 12px}
.sub{color:var(--muted);margin:0 0 24px}.tw{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{font-weight:600;color:var(--muted);white-space:nowrap}tbody th{font-weight:500}td{font-variant-numeric:tabular-nums}
.tabs{display:flex;gap:8px;position:sticky;top:0;background:var(--bg);padding:10px 0;z-index:2}
.tabs button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:6px 14px;border-radius:999px;cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.story{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}
.meta{color:var(--muted);font-size:13px;margin:0 0 8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}
.pair p{margin:4px 0 0}.pair .sum{font-size:15px}.head h3{font-size:17px;margin:4px 0 0;line-height:1.5}
.lab{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
@media (max-width:760px){.pair{grid-template-columns:1fr}}
mark.m{background:var(--mark);color:inherit;border-radius:4px;padding:0 3px}mark.m b{font-weight:600}mark.m i{font-style:normal;color:var(--muted);font-size:.78em;margin-left:3px}
mark.machine{background:var(--machine);outline:1px dashed var(--muted)}mark.wrong{background:transparent;outline:2px solid var(--bad)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:14px;color:var(--muted);margin:0 0 12px}
ul.list{columns:2;font-size:14px;padding-left:18px}@media (max-width:760px){ul.list{columns:1}}
.panel[hidden]{display:none}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Word rules report</title><style>${css}</style></head><body><main>
<h1>Word rules: before and after</h1>
<p class="sub">${stories.length} archive stories, ${archive.replayFiles[0].slice(0, 10)} to ${archive.replayFiles.at(-1).slice(0, 10)}, run offline with MyMemory answers taken from the archive. Before is today's code; after is branch word-rules.${sensesFile ? ` Senses as if approved: ${Object.keys(dict.senses).length} words.` : " No senses approved yet."}</p>

<h2>Key numbers</h2>
${table(["", "Beginner", "Foundation", "Intermediate"], [
  ["Irish per 100 words, story", ...LEVELS.map(p => `${(100 * mB.levels[p].markers / mB.levels[p].words).toFixed(1)} → ${(100 * mA.levels[p].markers / mA.levels[p].words).toFixed(1)} (${pctChange("levels", p)})`)],
  ["Irish per 100 words, app summary", ...LEVELS.map(p => `${(100 * mB.summaryLevels[p].markers / mB.summaryLevels[p].words).toFixed(1)} → ${(100 * mA.summaryLevels[p].markers / mA.summaryLevels[p].words).toFixed(1)} (${pctChange("summaryLevels", p)})`)],
  ["Hand-checked share, story", ...LEVELS.map(p => `${Math.round(100 * mB.levels[p].verified / mB.levels[p].markers)}% → ${Math.round(100 * mA.levels[p].verified / mA.levels[p].markers)}%`)],
  ["Known wrong pairs, story", ...LEVELS.map(p => `${mB.levels[p].knownWrong} → ${mA.levels[p].knownWrong}`)],
  ["Markers too close, story", ...LEVELS.map(p => `${mB.levels[p].tooClose} → ${mA.levels[p].tooClose}`)],
])}

<h2>Stories</h2>
<div class="legend"><span><mark class="m"><b>Irish</b><i>English</i></mark> hand-checked</span><span><mark class="m machine"><b>Irish</b><i>English</i></mark> machine</span><span><mark class="m wrong"><b>Irish</b><i>English</i></mark> known wrong</span></div>
<div class="tabs" role="tablist">${LEVELS.map((p, i) => `<button role="tab" aria-selected="${i === 0}" data-p="${p}">${LEVEL_NAME[p]}</button>`).join("")}</div>
${LEVELS.map((p, i) => `<section class="panel" data-p="${p}"${i ? " hidden" : ""}>${storyCards(p)}</section>`).join("\n")}

<h2>All metrics: story text</h2>
${table(LEVEL_HEAD, tableRows(mB, mA, "levels"))}
<h2>All metrics: app summaries</h2>
${table(LEVEL_HEAD, tableRows(mB, mA, "summaryLevels"))}
<h2>Headlines and MyMemory</h2>
${table(["", "Before", "After"], headlineRows(mB, mA))}

<h2>Defaults until you answer</h2>
${table(["Question", "Default", "Setting"], defaults)}
<h2>Tuning to keep density within 15%</h2>
${table(["What", "Now", "Setting"], tuning)}

<h2>Your choice: density or hand-checked Irish</h2>
<p>Two settings keep Irish per 100 words within 15% of today (L1) but go past the rules as written. Each pulls against a plan target.</p>
${table(["", "Now", "Plan"], [
  ["Foundation hand-checked share, story", share(mA.levels[25]), "75%+"],
  ["Intermediate hand-checked share, story", share(mA.levels[50]), "45%+"],
  ["Beginner sentences of 6+ words with no Irish", `${(100 * mA.levels[10].sentences6Empty / Math.max(1, mA.levels[10].sentences6)).toFixed(1)}%`, "20% or less"],
])}
<p>Foundation machine Irish only for gaps over 25 words (L4 as written): Foundation Irish falls 27.5% in stories and 33.9% in app summaries, and the hand-checked share rises to 77%. From 18 words: 14.8% and 22.0% fewer, 65% hand-checked. Now: from 12 words.</p>

<h2>Checks added after review</h2>
${table(["Never marked", "Before", "After"], reviewRows)}

<h2>Spot checks</h2>
<p>Beginner stories with fewer than 3 Irish words: ${thinBeginner.length} of ${stories.length} (before: ${thinBefore}). App summaries with none at Beginner: ${thinSummary.length} (none of them has a dictionary word).</p>
${table(["Day", "Story", "Words", "Irish before", "Irish after"], thinBeginner.map(t => [t.day, t.title, String(t.words), String(t.b), String(t.a)]))}
<p>Machine Irish after a, the, his and the like: ${afterDet.length} different pairs, the 100 most used:</p>
<ul class="list">${afterDet.slice(0, 100).map(([k, n]) => `<li>${esc(k)} · ${n}</li>`).join("")}</ul>
<p>Every word ending in -ing (${ingMarkers.length}):</p>
<ul class="list">${ingMarkers.map(([k, n]) => `<li>${esc(k)} · ${n}</li>`).join("")}</ul>
<p>Capitals kept from the dictionary that the old code would have changed (${capitals.length}):</p>
<ul class="list">${capitals.map(([k, n]) => `<li>${esc(k)} · ${n}</li>`).join("") || "<li>None</li>"}</ul>

<h2>Same event, same day</h2>
<p>${uniquePairs.length} pairs at word overlap ${SAME_EVENT} or more. Story choice is unchanged for now.</p>
${table(["Day", "Story", "Also", "Overlap"], uniquePairs.map(p => [p.day, p.a, p.b, p.j.toFixed(2)]))}
</main>
<script>
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
  document.querySelectorAll('.panel').forEach(s => { s.hidden = s.dataset.p !== b.dataset.p; });
}));
</script>
</body></html>
`;
writeFileSync(OUT, html);
console.log(`Wrote ${OUT}: ${picks.length} stories, ${uniquePairs.length} same-event pairs`);
