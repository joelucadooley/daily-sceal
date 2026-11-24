// Tests for the daily run when RTÉ sends something odd, the check before
// today.json is written, and the site's own pure helpers (a/an, markers,
// Focal an lae). No network: archive.mjs blocks every URL.
//
//   node scripts/test/pipeline.mjs
import { net } from "./archive.mjs";
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync, readdirSync } from "fs";
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
const {
  fixArticle, parseText, focalFor, fnv1a64, timeoutSignal,
  storyAddress, parseStoryAddress, routeFor, addressFor, withAddresses, storyAt, rememberedLevel, rememberLevel,
  regionIn, packGroups, fixedDays, focalForKey,
} = await import("../../src/helpers.js");

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

await test("every story in the archive passes the check", () => {
  const dir = new URL("../../public/data/archive/", import.meta.url);
  const days = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  assert(days.length > 100, `only ${days.length} days`);
  for (const f of days) {
    const day = JSON.parse(readFileSync(new URL(f, dir), "utf-8"));
    eq(day.date, f.slice(0, 10), `${f}: date`);
    for (const s of day.stories) {
      const p = storyProblems(s);
      assert(!p.length, `${f} ${s.title}: ${p.join("; ")}`);
    }
  }
});

await test("the archive list has every day, newest first, and matches the day files", () => {
  const dir = new URL("../../public/data/archive/", import.meta.url);
  const days = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort().reverse();
  const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf-8"));
  eq(index.map(e => e.date).join(","), days.join(","), "the same days, newest first");
  for (const e of index) {
    const day = JSON.parse(readFileSync(new URL(`${e.date}.json`, dir), "utf-8"));
    eq(e.generated, day.generated, `${e.date}: generated`);
    eq(JSON.stringify(e.stories), JSON.stringify(day.stories.map(s => ({ title: s.title, category: s.categoryIr, section: s.section }))), `${e.date}: stories`);
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
  eq(Object.keys(focail.days || {}).length, 3, "focail.json fixes three days of Focal an lae");
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

await test("marked text splits into the same sentences as the plain text", async () => {
  const { firstSentences, stripMarkers, splitSentences } = await import("../summary.js");
  const marked = "UK consumer champion Which? [[anailís|analyses]] the caffeine. [[Inniu|Today]] it said more. Then [[oíche|night]] fell.";
  eq(splitSentences(stripMarkers(marked)).length, splitSentences(marked).length, "same count");
  eq(stripMarkers(firstSentences(marked, 40)), firstSentences(stripMarkers(marked), 40), "same summary");
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

// ---- 6. Page addresses (#sport, #faoi, #story/2026-11-22/3/25) ----

await test("a story address is story/, the day, the story's number from 1 and the level", () => {
  eq(storyAddress("2026-11-22", 3, 25), "#story/2026-11-22/3/25", "with a level");
  eq(storyAddress("2026-11-22", 3), "#story/2026-11-22/3", "without");
  eq(storyAddress("2026-11-22", 3, 75), "#story/2026-11-22/3", "a locked level is left out");
  eq(storyAddress(undefined, 3, 10), "", "no day (the built-in stories)");
  eq(storyAddress("2026-11-22", 0, 10), "", "no story 0");
});

await test("addresses are read back, and anything else is not an address", () => {
  const got = parseStoryAddress("#story/2026-11-22/3/25");
  eq(JSON.stringify(got), JSON.stringify({ day: "2026-11-22", n: 3, level: 25 }), "full");
  eq(parseStoryAddress("#story/2026-11-22/3").level, null, "no level");
  eq(parseStoryAddress("#story/2026-11-22/3/").n, 3, "a trailing slash");
  eq(parseStoryAddress("#Story/2026-11-22/3").n, 3, "a capital S");
  eq(parseStoryAddress("#story/2026-11-22/3/99").level, null, "an unknown level is ignored, the story still opens");
  for (const bad of ["", "#", "#bearnai", "#faoi", "#export", "#story", "#story/2026-11-22", "#story/2026-11-22/0",
    "#story/2026-02-30/1", "#story/2026-13-01/1", "#story/26-11-22/3", "#story/2026-11-22/x",
    "#story/2026-11-22/3/25/4", "#story/2026-11-22/1234", "#2026-11-22/3", "#stories/2026-11-22/3"]) {
    eq(parseStoryAddress(bad), null, `not an address: ${bad}`);
  }
  for (const [day, n, level] of [["2026-11-22", 1, 10], ["2026-01-05", 30, 50], ["2026-12-31", 7, null]]) {
    const back = parseStoryAddress(storyAddress(day, n, level));
    assert(back.day === day && back.n === n && back.level === level, `round trip ${day}/${n}/${level}`);
  }
});

const TABS = ["inniu", "eire", "sport", "domhan", "eile"];

await test("every page has an address, and the address opens that page", () => {
  const pages = [
    [{ view: "feed", tab: "inniu" }, ""],
    [{ view: "feed", tab: "eire" }, "#eire"],
    [{ view: "feed", tab: "sport" }, "#sport"],
    [{ view: "feed", tab: "domhan" }, "#domhan"],
    [{ view: "feed", tab: "eile" }, "#eile"],
    [{ view: "game" }, "#bearnai"],
    [{ view: "about" }, "#faoi"],
  ];
  for (const [page, address] of pages) {
    eq(addressFor(page), address, `address of ${JSON.stringify(page)}`);
    eq(JSON.stringify(routeFor(address, TABS)), JSON.stringify(page.view === "feed" ? page : { view: page.view }), `page at "${address}"`);
  }
  eq(routeFor("#story/2026-11-22/3/25", TABS).story.n, 3, "a story");
  eq(routeFor("#export", TABS).view, "export", "the export page");
  // The first story links, live on 23 November 2026, still open their story.
  eq(JSON.stringify(routeFor("#2026-11-23/3/25", TABS)), JSON.stringify({ view: "story", story: { day: "2026-11-23", n: 3, level: 25 } }), "first story links");
  eq(routeFor("#2026-11-23/3", TABS).story.level, null, "first story links without a level");
});

await test("addresses are forgiving: #inniu, fadas, capitals, a trailing slash, copied links", () => {
  for (const [typed, tab] of [["#inniu", "inniu"], ["#éire", "eire"], ["#Éire", "eire"], ["#%C3%89ire", "eire"],
    ["#Spórt", "sport"], ["#SPORT", "sport"], ["#domhan/", "domhan"], ["eile", "eile"]]) {
    eq(routeFor(typed, TABS).tab, tab, typed);
  }
  for (const junk of ["#", "#nuacht", "#2026-02-30/3", "#%E0%A4%A", "#story/nope", "#eire/extra"]) {
    eq(JSON.stringify(routeFor(junk, TABS)), JSON.stringify({ view: "feed", tab: "inniu" }), `unknown: ${junk}`);
  }
});

await test("story n is the nth story in that day's file, in every saved day", () => {
  const index = JSON.parse(readFileSync(new URL("../../public/data/archive/index.json", import.meta.url), "utf-8"));
  for (const { date } of index.slice(0, 14)) {
    const day = JSON.parse(readFileSync(new URL(`../../public/data/archive/${date}.json`, import.meta.url), "utf-8"));
    const marked = withAddresses(day.stories, day.date);
    marked.forEach((s, i) => {
      const at = storyAt(day, s.addrN);
      assert(at && at.title === day.stories[i].title && at.addrDay === date, `${date} story ${s.addrN}`);
      // The file's own ids agree, so the number is the id plus one.
      eq(day.stories[i].id, `story-${s.addrN - 1}`, `${date} id`);
    });
    eq(storyAt(day, day.stories.length + 1), null, `${date}: past the end`);
  }
  eq(storyAt(null, 1), null, "no file");
  eq(storyAt({ date: "2026-11-22", stories: [null] }, 1), null, "a broken entry");
});

await test("a story added later takes the next number and moves no other", () => {
  const day = { date: "2026-11-22", stories: [{ title: "One" }, { title: "Two" }] };
  const before = withAddresses(day.stories, day.date).map(s => `${s.addrN}:${s.title}`);
  day.stories.push({ title: "Added" });   // what add-story.js does
  const after = withAddresses(day.stories, day.date).map(s => `${s.addrN}:${s.title}`);
  eq(after.slice(0, 2).join(","), before.join(","), "earlier numbers unchanged");
  eq(after[2], "3:Added", "new story");
});

await test("the reader's level is remembered, open levels only", () => {
  const store = new Map();
  const storage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  eq(rememberedLevel(storage), null, "nothing yet");
  rememberLevel(25, storage);
  eq(rememberedLevel(storage), 25, "kept");
  rememberLevel(75, storage);
  eq(rememberedLevel(storage), 25, "a locked level is not kept");
  store.set("ds-level", "abc");
  eq(rememberedLevel(storage), null, "junk ignored");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  eq(rememberedLevel(blocked), null, "storage blocked (private window)");
  rememberLevel(10, blocked);
  eq(rememberedLevel(undefined), null, "no storage at all");
});

// ---- 7. World regions for RTÉ's plain "World" ----

await test("a world story takes the region it names", () => {
  const cases = [
    ["Ukraine sank Russian ship near Libya, says Zelensky", "", "An Úcráin"],
    ["EU condemns Russian 'atrocities' as 17 killed in Kyiv", "", "An Úcráin"],
    ["Netanyahu and Eisenkot blocs fail to reach coalition deal", "", "An Meánoirthear"],
    ["Trump accuses China of interfering in 2020 election", "", "An Áise"],
    ["Ebola outbreak in DR Congo 'out of control', warns MSF", "", "An Afraic"],
    ["Macron and Merz meet in Brussels", "", "An Eoraip"],
    ["Venezuela quakes kill 1,400 amid race to find survivors", "", "Meiriceá"],
    ["US Senate committee votes to hold Fauci in contempt", "", "Meiriceá"],
    ["Man convicted of arson for deadly Palisades fire in LA", "", "Meiriceá"],
    ["Wildfires spread across Los Angeles", "", "Meiriceá"],
    // The headline names nowhere: the opening of the story decides.
    ["Kim highlights 'sovereignty' in ties after Trump no-show", "North Korean leader Kim Jong-un said", "An Áise"],
    // Whichever comes first in the headline.
    ["Poland strips Zelensky of top honour", "", "An Eoraip"],
  ];
  for (const [title, summary, want] of cases) eq(regionIn(title, summary), want, title);
});

await test("Britain, world bodies and stories naming nowhere stay Domhan", () => {
  for (const [title, summary] of [
    ["UK govt braced for massive release of Mandelson files", "The former ambassador in Washington"],
    ["NATO to unveil major arms deals at Ankara summit", "The US and its allies"],
    ["Pope Leo draws huge crowds at Argentina's holiest shrine", ""],
    ["AI, peace and multilateralism on UNGA delegates' minds", "In New York this week"],
    ["Fossil fuels still absent in latest COP31 draft deal", ""],
    ["Trump tells us nothing new", "It was said to us"],   // "us" is a word, not the US
    ["80% chance of El Niño developing in June-August, says UN", ""],
  ]) eq(regionIn(title, summary), null, title);
});

// ---- 8. Desktop rows ----

const grp = (label, n) => ({ label, items: Array.from({ length: n }, (_, i) => `${label} ${i}`) });
const layout = rows => rows.map(r => r.blocks.map(b => `${b.group.label}:${b.span}/${b.group.items.length}`).join(" + ")).join(" | ");

await test("small groups share a row instead of leaving blank columns", () => {
  const sport = [grp("Rugbaí", 3), grp("CLG", 2), grp("Sacar", 2), grp("Spórt eile", 1)];
  eq(layout(packGroups(sport, 4)), "Rugbaí:3/3 + Spórt eile:1/1 | CLG:2/2 + Sacar:2/2", "four columns");
  eq(layout(packGroups([grp("An Meánoirthear", 2), grp("An Úcráin", 2)], 4)), "An Meánoirthear:2/2 + An Úcráin:2/2", "two pairs side by side");
  eq(layout(packGroups([grp("Gnó", 5)], 3)), "Gnó:3/5", "a group wider than the grid takes whole rows");
});

await test("gaps are offered for older stories, which join that group", () => {
  const asked = [];
  const more = (g, n) => { asked.push(`${g.label}:${n}`); return g.label === "Sacar" ? ["old 1", "old 2", "old 3"] : []; };
  const rows = packGroups([grp("Rugbaí", 3), grp("CLG", 2), grp("Sacar", 2), grp("Spórt eile", 1)], 3, more);
  eq(layout(rows), "Rugbaí:3/3 | CLG:2/2 + Spórt eile:1/1 | Sacar:3/3", "Sacar row filled, never more than the gap");
  eq(asked.join(","), "Sacar:1", "only the row with a gap is asked");
  const wide = packGroups([grp("Gnó", 4)], 3, () => ["a", "b", "c"]);
  eq(wide[0].blocks[0].group.items.length, 6, "a wide group's last row is filled");
  const input = [grp("CLG", 2)];
  packGroups(input, 3, () => ["x"]);
  eq(input[0].items.length, 2, "the groups passed in are not changed");
});

// ---- 9. Focal an lae fixed for the day ----

await test("a word added to the dictionary never changes a day's word already shown", () => {
  const live = JSON.parse(readFileSync(new URL("../../public/data/focail.json", import.meta.url), "utf-8"));
  const before = { ...live, days: undefined };
  // A word that moves most days' picks.
  const after = { ...before, words: [...before.words, { en: "details", ga: "sonraí" }] };
  const day = "2026-11-24";
  assert(focalForKey(before, day).en !== focalForKey(after, day).en, "fixture: the new word moves today's pick");
  const days = fixedDays(before, after, day);
  eq(Object.keys(days).join(","), "2026-11-23,2026-11-24,2026-11-25", "yesterday, today, tomorrow");
  eq(days["2026-11-24"].en, focalForKey(before, "2026-11-24").en, "today keeps the word shown since midnight");
  eq(days["2026-11-23"].en, focalForKey(before, "2026-11-23").en, "yesterday too");
  eq(days["2026-11-25"].en, focalForKey(after, "2026-11-25").en, "tomorrow comes from the new list");
  // The next morning: what was fixed stays fixed.
  const next = fixedDays({ ...after, days }, after, "2026-11-25");
  eq(next["2026-11-24"].en, days["2026-11-24"].en, "a fixed day keeps its word");
  eq(next["2026-11-25"].en, days["2026-11-25"].en, "and tomorrow, once fixed, too");
  eq(Object.keys(next).length, 3, "older days drop off");
  // First run ever (no list yet): everything from the new list.
  eq(fixedDays(null, after, day)["2026-11-24"].en, focalForKey(after, day).en, "no earlier list");
});

await test("the site uses the fixed word for the day, and works it out otherwise", () => {
  const live = JSON.parse(readFileSync(new URL("../../public/data/focail.json", import.meta.url), "utf-8"));
  const f = { ...live, days: { "2026-11-24": { ga: "farraige", en: "sea" } } };
  eq(focalFor(f, new Date(2026, 10, 24, 0, 5)).en, "sea", "fixed day, just after midnight");
  eq(focalFor(f, new Date(2026, 10, 24, 23, 55)).en, "sea", "fixed day, late");
  eq(focalFor(f, new Date(2026, 10, 26)).en, focalForKey(live, "2026-11-26").en, "a day not fixed: worked out as before");
  eq(focalFor({ ...live, days: { "2026-11-26": { ga: 1 } } }, new Date(2026, 10, 26)).en, focalForKey(live, "2026-11-26").en, "a broken entry is ignored");
});

assert(net.calls === 0, "MyMemory was called");
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
