// Tests for the daily run when RTÉ sends something odd, the check before
// today.json is written, and the site's own pure helpers (a/an, markers,
// Focal an lae). No network: archive.mjs blocks every URL.
//
//   node scripts/test/pipeline.mjs
import { net } from "./archive.mjs";
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

delete process.env.FEEDS;
const OUT = mkdtempSync(join(tmpdir(), "sceal-pipeline-"));
process.env.OUT_DIR = OUT;

const { storyFromItem, itemDate, plainText } = await import("../lib/feeditem.js");
const { storyProblems, checkStories, markedTextProblems } = await import("../lib/day.js");
const { decode } = await import("../lib/page.js");
const { articleFromHtml } = await import("../lib/pick.js");
const { loadOverrides, loadDict, focailLists } = await import("../lib/dict.js");
const { RTE_FEEDS, feedById } = await import("../feeds.js");
const { run } = await import("../generate.js");
const { fixArticle, parseText, focalFor, fnv1a64, timeoutSignal } = await import("../../src/helpers.js");

let failed = 0, passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const NEWS = feedById("news");
const NOW = new Date("2026-11-04T08:30:00Z");
const item = (over = {}) => ({
  title: "Government to publish housing plan next week",
  description: "The Government will publish its new housing plan next week, the Minister has said. It sets out targets to 2030.",
  link: "https://www.rte.ie/news/ireland/2026/1104/1600000-housing/",
  pubDate: "Tue, 04 Nov 2026 07:00:00 +0000",
  categories: ["Ireland"],
  ...over,
});

// ---- 1. Feed items ----

await test("an item with a date that cannot be read is kept, dated now, instead of losing the feed", () => {
  for (const pubDate of ["", "not a date", "Tue, 4 Nov 2026 25:61:00 XYZ", undefined]) {
    const s = storyFromItem(item({ pubDate }), NEWS, 0, NOW);
    assert(s, `dropped for pubDate ${pubDate}`);
    eq(s.published, NOW.toISOString(), `published for ${JSON.stringify(pubDate)}`);
  }
  eq(itemDate("Tue, 04 Nov 2026 07:00:00 +0000", NOW).toISOString(), "2026-11-04T07:00:00.000Z", "a good date");
});

await test("an item with no link or no headline is dropped", () => {
  eq(storyFromItem(item({ link: "" }), NEWS, 0, NOW), null, "no link");
  eq(storyFromItem(item({ link: "/news/1234" }), NEWS, 0, NOW), null, "relative link");
  eq(storyFromItem(item({ title: "  " }), NEWS, 0, NOW), null, "no headline");
});

await test("entities and tags in the feed come out as plain text", () => {
  const s = storyFromItem(item({
    title: "Trump&#x27;s visit to Sin&eacute;ad&#8217;s town",
    description: "<p>Donald Trump&#x27;s first day in &Eacute;ire &amp; the West.</p> It went on.",
  }), NEWS, 0, NOW);
  eq(s.title, "Trump's visit to Sinéad’s town", "title");
  assert(s.rssSummary.startsWith("Donald Trump's first day in Éire & the West."), s.rssSummary);
  assert(!/&#|&[a-z]+;|<p>/i.test(s.summary + s.rssSummary), s.summary);
});

await test("the item keeps every field the day needs", () => {
  const s = storyFromItem(item(), NEWS, 3, NOW);
  for (const f of ["id", "title", "summary", "rssSummary", "link", "category", "categoryIr", "feed", "section", "published", "timeAgo"]) {
    assert(typeof s[f] === "string" && s[f], `${f} missing`);
  }
  eq(s.id, "news-3", "id");
  eq(s.section, "eire", "section from the Ireland tag");
  assert(!s.fromFeed, "a tag decided, so the feed did not");
  const untagged = storyFromItem(item({ categories: [], link: "https://www.rte.ie/news/2026/1104/1-x/" }), NEWS, 0, NOW);
  assert(untagged.fromFeed && untagged.section === NEWS.section, "no tag: the feed decides");
});

await test("a future date does not give a negative time", () => {
  const s = storyFromItem(item({ pubDate: new Date(Date.now() + 3600e3).toUTCString() }), NEWS, 0);
  assert(!s.timeAgo.startsWith("-"), s.timeAgo);
});

await test("decode leaves odd entities alone rather than breaking", () => {
  eq(decode("&constructor; &toString;"), "&constructor; &toString;", "no prototype values");
  eq(decode("&#99999999; &#0;"), "&#99999999; &#0;", "out of range");
  eq(decode("&EACUTE;"), "&EACUTE;", "unknown case of a fada");
  eq(decode("Caf&eacute; &AMP; bar"), "Café & bar", "known ones");
});

await test("article text keeps apostrophes written as entities", () => {
  const p = "The Minister said it wasn&#8217;t the Government&#x27;s plan to change the rules this year at all.";
  const a = articleFromHtml(`<p>${p}</p><p>${p}</p>`);
  assert(a.text.includes("wasn’t the Government's plan"), a.text);
});

// ---- 2. The check before writing ----

const good = () => ({
  id: "story-0",
  title: "Housing plan to be published",
  titleIr: "[[Tithíocht|Housing]] plan to be published",
  link: "https://www.rte.ie/news/1",
  summary: "The housing plan is due next week.",
  rssSummary: "The plan is due.",
  category: "Ireland", categoryIr: "Éire", feed: "news", section: "eire",
  published: "2026-11-04T07:00:00.000Z", timeAgo: "1h ago",
  levels: {
    10: "The [[tithíocht|housing]] plan is due next week.",
    25: "The [[tithíocht|housing]] [[plean|plan]] is due next week.",
    50: "The [[tithíocht|housing]] [[plean|plan]] is due next [[seachtain|week]].",
  },
  summaryLevels: { 10: "The plan is due.", 25: "The [[plean|plan]] is due.", 50: "The [[plean|plan]] is due." },
});

await test("a well-formed story passes", () => {
  const p = storyProblems(good());
  eq(p.length, 0, `problems ${p.join("; ")}`);
});

await test("the archive's own recent stories pass", () => {
  const index = JSON.parse(readFileSync(new URL("../../public/data/archive/index.json", import.meta.url), "utf-8"));
  const dates = index.map(e => e.date).filter(d => d >= "2026-09-11").slice(0, 10);
  assert(dates.length, "no recent days");
  for (const d of dates) {
    const day = JSON.parse(readFileSync(new URL(`../../public/data/archive/${d}.json`, import.meta.url), "utf-8"));
    for (const s of day.stories) {
      const p = storyProblems(s);
      assert(!p.length, `${d} ${s.title}: ${p.join("; ")}`);
    }
  }
});

await test("broken stories are caught", () => {
  const cases = [
    [s => { delete s.summaryLevels; }, "summaryLevels missing"],
    [s => { delete s.levels["25"]; }, "levels.25: missing"],
    [s => { s.levels["10"] = "The [[tithíocht|housing plan is due next week."; }, "not closed"],
    [s => { s.levels["10"] = "The [[tithíocht|housing]] plan is due next week. ]]"; }, "not closed"],
    [s => { s.levels["50"] = "The [[ |housing]] plan is due next week."; }, "no Irish"],
    [s => { s.levels["10"] = "The [[tithíocht|home]] plan is due next week."; }, "does not match"],
    [s => { s.title = ""; }, "title missing"],
    [s => { s.published = "yesterday"; }, "not a date"],
    [s => { s.titleIr = "[[Tithíocht|Housing]] plan"; }, "titleIr: does not match"],
  ];
  for (const [spoil, want] of cases) {
    const s = good();
    spoil(s);
    const p = storyProblems(s).join("; ");
    assert(p.includes(want), `wanted "${want}", got "${p}"`);
  }
  eq(markedTextProblems(undefined, "x")[0], "missing", "missing text");
});

await test("checkStories leaves out broken ones and renumbers the rest", () => {
  const list = [good(), { ...good(), levels: null }, good(), null];
  const { stories, dropped } = checkStories(list);
  eq(stories.length, 2, "kept");
  eq(dropped.length, 2, "dropped");
  eq(stories.map(s => s.id).join(","), "story-0,story-1", "ids follow on");
});

// ---- 3. The whole run, with odd feeds ----

const PARA = "The Government has said it will publish its new plan next week, after months of talks with the parties and the unions about what it should hold.";
const page = n => `<html><head><meta property="og:title" content="Story ${n}"></head><body>${Array.from({ length: 4 }, () => `<p>${PARA}</p>`).join("")}</body></html>`;
const blocked = globalThis.fetch;
globalThis.fetch = async (input, opts) => {
  const url = String(input);
  const m = /^https:\/\/www\.rte\.ie\/test\/(\d+)\/$/.exec(url);
  if (m) return new Response(page(m[1]), { status: 200, headers: { "content-type": "text/html" } });
  return blocked(input, opts);
};
const items = n => Array.from({ length: n }, (_, i) => storyFromItem(item({
  title: `Test story number ${i} about the housing plan`,
  link: `https://www.rte.ie/test/${i}/`,
  pubDate: NOW.toUTCString(),
}), RTE_FEEDS[i % RTE_FEEDS.length], i, NOW));
const mark = (broken = () => false) => async (story, i) => {
  const { fullText, ...rest } = story;
  const all = t => ({ 10: t, 25: t, 50: t });
  const out = { ...rest, summary: fullText, levels: all(fullText), summaryLevels: all(rest.rssSummary), titleIr: rest.title };
  if (broken(i)) out.levels = { 10: "[[broken" };
  return out;
};
async function quietRun(opts) {
  const lines = [];
  const { log, warn } = console;
  console.log = (...a) => lines.push(a.join(" "));
  console.warn = (...a) => lines.push(a.join(" "));
  try {
    return { out: await run(opts), lines };
  } catch (err) {
    return { err, lines };
  } finally {
    console.log = log;
    console.warn = warn;
  }
}
const fresh = () => { rmSync(OUT, { recursive: true, force: true }); };

await test("every feed empty: the run fails and writes nothing", async () => {
  fresh();
  const { err } = await quietRun({ loadItems: async () => [], process: mark() });
  assert(err && /No stories from any feed/.test(err.message), `error ${err && err.message}`);
  assert(!existsSync(join(OUT, "today.json")), "today.json written");
});

await test("a broken story is left out, the rest publish with ids in order", async () => {
  fresh();
  const { out, err, lines } = await quietRun({ loadItems: async () => items(40), process: mark(i => i === 2) });
  assert(!err, err && err.message);
  const day = JSON.parse(readFileSync(join(OUT, "today.json"), "utf-8"));
  eq(day.stories.length, out.stories.length, "file and result agree");
  assert(day.stories.length >= 8, `only ${day.stories.length}`);
  assert(day.stories.every((s, i) => s.id === `story-${i}` && !storyProblems(s).length), "ids or shape");
  assert(lines.some(l => l.includes("Left out")), "the log says what was left out");
  const archived = JSON.parse(readFileSync(join(OUT, "archive", `${day.date}.json`), "utf-8"));
  eq(archived.stories.length, day.stories.length, "archive copy");
  const focail = JSON.parse(readFileSync(join(OUT, "focail.json"), "utf-8"));
  assert(Array.isArray(focail.words) && Array.isArray(focail.places), "focail.json shape");
});

await test("too many broken stories: the run fails and yesterday's file stays", async () => {
  fresh();
  const { mkdirSync } = await import("fs");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "today.json"), '{"date":"yesterday"}');
  const { err } = await quietRun({ loadItems: async () => items(40), process: mark(() => true) });
  assert(err && /Refusing to publish/.test(err.message), `error ${err && err.message}`);
  eq(readFileSync(join(OUT, "today.json"), "utf-8"), '{"date":"yesterday"}', "today.json untouched");
});

globalThis.fetch = blocked;
fresh();

// ---- 4. The dictionary ----

await test("an override with no Irish, a bracket or a | is skipped, not published", () => {
  const dir = mkdtempSync(join(tmpdir(), "sceal-dict-"));
  const file = join(dir, "overrides.json");
  writeFileSync(file, JSON.stringify({ house: "teach", pitch: "páirc|airde", bad: "", nul: null, num: 3, "[x]": "y", ok: "ceart" }));
  const warnings = [];
  const o = loadOverrides(pathToFileURL(file), w => warnings.push(w));
  eq(Object.keys(o).sort().join(","), "house,ok", "kept");
  eq(warnings.length, 5, "a warning for each one skipped");
  rmSync(dir, { recursive: true, force: true });
});

await test("focail.json words are what the apps can sort the same way", () => {
  const { words, places } = focailLists(loadDict());
  assert(words.length > 100 && places.length > 0, "lists");
  const seen = new Set();
  for (const w of [...words, ...places]) {
    assert(typeof w.ga === "string" && w.ga.trim() && typeof w.en === "string" && w.en.trim(), JSON.stringify(w));
    assert(w.ga === w.ga.normalize("NFC"), `Irish not in composed form: ${w.ga}`);
  }
  for (const w of words) {
    // JavaScript sorts by UTF-16 units and Swift by Unicode; for lower-case
    // ASCII English they agree, so the site and the apps pick the same word.
    assert(/^[a-z0-9' .-]+$/.test(w.en), `English key the apps may sort differently: ${w.en}`);
    assert(!seen.has(w.en), `twice: ${w.en}`);
    seen.add(w.en);
  }
});

// ---- 5. The site's helpers ----

await test("Focal an lae uses the FNV-1a hash of the local date", () => {
  assert(fnv1a64("") === 14695981039346656037n, "empty");
  assert(fnv1a64("2026-11-04") === 15239041166255467555n, `a date: ${fnv1a64("2026-11-04")}`);
  const focail = JSON.parse(readFileSync(new URL("../../public/data/focail.json", import.meta.url), "utf-8"));
  const a = focalFor(focail, new Date(2026, 10, 4, 0, 5));
  const b = focalFor(focail, new Date(2026, 10, 4, 23, 55));
  assert(a && a === b, "same word all day");
  const shuffled = { words: [...focail.words].reverse() };
  eq(focalFor(shuffled, new Date(2026, 10, 4)).en, a.en, "the file's order does not matter");
  eq(focalFor({ words: [] }), null, "empty");
  eq(focalFor({ words: [{ en: "word", ga: null }, { en: "house", ga: "teach" }] }, new Date(2026, 10, 4)).en, "house", "skips a broken entry");
});

await test("fixArticle: a/an agrees with the Irish shown", () => {
  const cases = [
    ["There was an ", "scútar", "There was a "],
    ["There was a ", "uisce", "There was an "],
    ["It was a ", "Éire", "It was an "],
    ["An ", "cúirt", "A "],
    ["A ", "oifig", "An "],
    ["The judge. A ", "oifig", "The judge. An "],
    ["(a ", "árasán", "(an "],
    ["“an ", "teach", "“a "],
    ["said – a ", "eagraíocht", "said – an "],
    // Not the article: left alone.
    ["in Group A ", "eagraíocht", "in Group A "],
    ["Plan A ", "údarás", "Plan A "],
    ["Kia ", "uisce", "Kia "],
    ["Ana ", "teach", "Ana "],
    ["a  ", "uisce", "an  "],
    ["", "uisce", ""],
  ];
  for (const [before, irish, want] of cases) eq(fixArticle(before, irish), want, `${before}+${irish}`);
});

await test("parseText reads markers and nothing else", () => {
  const p = parseText("An [[scútar|e-scooter]] and [[teach|house]].");
  eq(p.map(x => x.t).join(","), "en,ir,en,ir,en", "parts");
  eq(p[0].v, "A ", "article fixed");
  eq(p[1].irish + "|" + p[1].english, "scútar|e-scooter", "marker");
  const odd = parseText("A [[stray] bracket and [[teach|house]]");
  eq(odd.filter(x => x.t === "ir").length, 1, "a stray [[ does not swallow text");
  eq(odd.filter(x => x.t === "ir")[0].irish, "teach", "marker after the stray bracket");
  eq(parseText(undefined).length, 0, "no text");
});

await test("timeoutSignal works where AbortSignal.timeout is missing", async () => {
  const saved = AbortSignal.timeout;
  try {
    delete AbortSignal.timeout;
    const s = timeoutSignal(10);
    assert(s && !s.aborted, "a signal");
    await new Promise(r => setTimeout(r, 30));
    assert(s.aborted, "aborts after the time");
  } finally {
    AbortSignal.timeout = saved;
  }
});

assert(net.calls === 0, "MyMemory was called");
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
