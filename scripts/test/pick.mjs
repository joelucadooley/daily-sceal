// Fixture tests for choosing the day's stories (scripts/lib/pick.js) through
// the real run() in generate.js: fake feed items, fake article pages read by
// the real scrapeArticle, and a stand-in for the MyMemory marking. No network:
// archive.mjs blocks every URL that is not one of the fake pages below.
//
//   node scripts/test/pick.mjs
import { net } from "./archive.mjs";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

delete process.env.FEEDS;
const OUT = mkdtempSync(join(tmpdir(), "sceal-pick-"));
process.env.OUT_DIR = OUT;

const { thinPattern, pickStories, wordCount, articleFromHtml, MIN_ARTICLE_WORDS, EXTRA_SCRAPES } = await import("../lib/pick.js");
const { balance } = await import("../feeds.js");
const gen = await import("../generate.js");
const { run, STORY_COUNT, MIN_STORIES } = gen;

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

// ---- Fake pages, served only to scrapeArticle ----

const pages = new Map();
const blockedFetch = globalThis.fetch;
globalThis.fetch = async (input, opts) => {
  const url = String(input);
  if (pages.has(url)) {
    const html = pages.get(url);
    return html == null
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => html };
  }
  return blockedFetch(input, opts);
};

const SENTENCE = "Officials said the work on the new county road would continue through the winter months";
const goodPage = n => "<html><body>" +
  Array.from({ length: 6 }, (_, i) => `<p>${SENTENCE}, paragraph ${i + 1} of story ${n}.</p>`).join("\n") +
  "</body></html>";
// Two short paragraphs, about 25 words: a live page's standfirst.
const thinPage = n => "<html><body>" +
  `<p>Follow all the action as it happens here today in story ${n} with our team.</p>` +
  `<p>Keep up to date with the latest developments as they come in.</p></body></html>`;

// Shaped like "RTÉ to screen 2027 Ryder Cup highlights" (2026-09-10), in our
// own words: six paragraphs of reporting, four of them naming RTÉ, then a
// programme listing, a cookie notice and the copyright line. The two that do
// not name RTÉ come to 44 words, so the article text alone is under the line.
const RYDER = {
  title: "RTÉ to screen 2027 Ryder Cup highlights",
  reporting: [
    "RTÉ has won the rights to show highlights of next year's Ryder Cup at Adare Manor and has signed a new deal to show the Irish Open for several more years.",
    "In 2025, Rory McIlroy and Shane Lowry were among the leading players as Europe held the Ryder Cup in New York.",
    "The rematch in Co Limerick next year should be a great event, with the best players in the world meeting over three days.",
    "Viewers will see the highlights free to air, and RTÉ will also hold the radio rights for both the Ryder Cup and the Irish Open.",
    "The RTÉ Head of Sport said the broadcaster was pleased to renew its agreement for the Irish Open, given the drama and the strong field the event now draws.",
    "He added that showing highlights of the Ryder Cup as well means RTÉ can give Irish audiences more access to great sporting moments.",
  ],
  rest: [
    "Watch the Irish Open from Thursday to Sunday on RTÉ2 and RTÉ Player",
    "We need your consent to load this rte-player content. We use rte-player to manage extra content that can set cookies on your device.",
    "© RTÉ 2026. RTÉ.ie is the website of Raidió Teilifís Éireann, Ireland's National Public Service Media. RTÉ is not responsible for the content of external internet sites.",
  ],
};
const ryderPage = () => "<html><body>" +
  [...RYDER.reporting, ...RYDER.rest].map(p => `<p class="body">${p}</p>`).join("\n") + "</body></html>";
// A soap preview: a short standfirst and three programme listings, all
// naming RTÉ One or the RTÉ Player. Still a thin story.
const SOAP_TITLE = "Fair City on Sunday: 'She is trampling all over you, son'";
const soapPage = () => "<html><body>" + [
  "Pete warns Doug that he is being played for a fool in Sunday's Fair City on RTÉ One and the RTÉ Player.",
  "Doug is not ready to listen, and the row in the kitchen soon turns into something far worse for the whole family.",
  "Fans can watch what happens next on Sunday on RTÉ One and the RTÉ Player at 8:30pm.",
  "Fair City airs on RTÉ One and the RTÉ Player on Sundays, Tuesdays, Thursdays, and Fridays.",
  "© RTÉ 2026. RTÉ.ie is the website of Raidió Teilifís Éireann, Ireland's National Public Service Media.",
].map(p => `<p>${p}</p>`).join("\n") + "</body></html>";

// ---- Fake feed items, shaped like fetchFeed's output ----

const FEEDS = ["news", "ireland", "politics", "business", "world", "sport", "gaa",
  "soccer", "rugby", "culture", "ents", "life"];
const SECTION = { sport: "sport", gaa: "sport", soccer: "sport", rugby: "sport", world: "domhan", news: "eire", ireland: "eire" };

// `kinds` maps "feed-index" to how that item's page looks: "thin", "missing"
// (404), or { title, html } (either one) for the title rules and pages of
// their own. Everything else is good.
function day(perFeed, kinds = {}) {
  pages.clear();
  const items = [];
  for (const feed of FEEDS) {
    for (let i = 0; i < perFeed; i++) {
      const key = `${feed}-${i}`;
      const kind = kinds[key];
      const link = `https://www.rte.ie/fake/${feed}/${i}/`;
      const title = kind && kind.title ? kind.title : `Story number ${i} from the ${feed} feed today`;
      items.push({
        id: key, title, link, feed,
        summary: `A summary of story ${i} from the ${feed} feed, long enough to pass the RSS filter on length alone.`,
        rssSummary: `A summary of story ${i} from the ${feed} feed.`,
        category: feed, categoryIr: feed, section: SECTION[feed] || "eile",
        published: "2026-10-17T08:00:00.000Z", timeAgo: "1h ago",
      });
      pages.set(link, kind === "thin" ? thinPage(key) : kind === "missing" ? null
        : kind && kind.html ? kind.html : goodPage(key));
    }
  }
  return items;
}

const fakeMark = async (story, i) => {
  const { fullText, ...rest } = story;
  return { ...rest, summary: fullText, levels: { 10: fullText } };
};
const spreadOf = list => {
  const out = {};
  for (const s of list) out[s.feed] = (out[s.feed] || 0) + 1;
  return out;
};
const sameSpread = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// Quiet the run's own logging; keep the skip lines for the assertions.
async function quietRun(items, markOne = fakeMark) {
  const lines = [];
  const { log, warn } = console;
  console.log = (...a) => lines.push(a.join(" "));
  console.warn = (...a) => lines.push(a.join(" "));
  try {
    const out = await run({ loadItems: async () => items, process: markOne });
    return { out, lines };
  } catch (err) {
    return { err, lines };
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

// ---- 1. The title and address rules, on real archive titles ----

await test("thin titles and addresses are caught", () => {
  const thin = [
    ["FAI Cup semi-final: Galway United 0-2 Derry City recap", ""],
    ["Mayo bring home Sam Maguire - recap", ""],
    ["Transfer deadline day updates: Grealish on the move", ""],
    ["Conference League: KuPS v Shamrock Rovers updates", ""],
    ["Premier League and FAI Cup results and reports", ""],
    ["Rescuers on way to Venezuela after 'devastating' quakes", "https://www.rte.ie/news/2026/0625/1580229-venezuela-tracker/"],
    ["NI Secretary says he will 'go extra mile for peace'", "https://www.rte.ie/news/2026/0929/1593292-drumcree-live-blog/"],
    ["Women's Open leaderboard: Three Irish in action", "https://www.rte.ie/sport/results/golf/ladies-european-tour-and-lpga-tour-1/29538/aig-womens-open-913249/"],
  ];
  for (const [title, link] of thin) assert(thinPattern({ title, link }), `not caught: ${title}`);
});

await test("real stories with live, updates, reports or results in them are kept", () => {
  const real = [
    ["Kerry's half year revenues dip 3.7% as it updates targets", "https://www.rte.ie/news/business/2026/0729/1585559-kerry-group-half-year-results/"],
    ["3.4% rise in Live Register claimants in July - CSO", "https://www.rte.ie/news/business/2026/0810/1587255-cso-live-register/"],
    ["Maura Higgins tops women's leaderboard on DWTS US", ""],
    ["Inditex reports profit miss despite strong August sales", "https://www.rte.ie/news/business/2026/0909/1590835-inditex-trading-update/"],
    ["Over 70,000 Leaving Cert students to receive exam results", ""],
    ["Boehly, Walter in talks to sell Chelsea stakes – reports", ""],
    ["10 Irish bands you really need to see live right now", ""],
  ];
  for (const [title, link] of real) assert(!thinPattern({ title, link }), `wrongly caught: ${title} (${thinPattern({ title, link })})`);
});

await test("word count", () => {
  assert(wordCount("") === 0 && wordCount(null) === 0, "empty text is 0 words");
  assert(wordCount("  one two\nthree  ") === 3, "counts words across spaces and lines");
});

await test("a page about RTÉ itself is measured on all its reporting, not on its text alone", () => {
  const a = articleFromHtml(ryderPage());
  const plain = RYDER.reporting.filter(p => !p.includes("RTÉ"));
  assert(a.text === plain.join(" "), `published text changed: ${a.text}`);
  assert(wordCount(a.text) < MIN_ARTICLE_WORDS, `fixture text should be under the line: ${wordCount(a.text)}`);
  const reporting = RYDER.reporting.reduce((n, p) => n + wordCount(p), 0);
  assert(a.words === reporting, `counted ${a.words}, expected the ${reporting} words of reporting only`);
  assert(a.paragraphs === 2, `paragraphs ${a.paragraphs}`);
  // Listings, the copyright line and cookie notices never count.
  const soap = articleFromHtml(soapPage());
  assert(soap.words === wordCount("Doug is not ready to listen, and the row in the kitchen soon turns into something far worse for the whole family."),
    `soap preview counted ${soap.words}`);
  for (const line of ["Fair City airs on RTÉ One and the RTÉ Player on Sundays, Tuesdays, Thursdays, and Fridays.",
    "The 2FM Official Chart Show, hosted by our presenter, is live every Friday from 7pm on RTÉ's 2FM.",
    "Listen to the full interview with the minister on RTÉ Radio 1 this evening from six o'clock.",
    RYDER.rest[0], RYDER.rest[1], RYDER.rest[2]]) {
    assert(articleFromHtml(`<p>${line}</p>`).words === 0, `counted: ${line}`);
  }
  for (const line of ["Speaking on RTÉ's Morning Ireland programme, the parish priest said hearts were broken.",
    "\"The numbers are incredibly small,\" the doctor told RTÉ News on Wednesday afternoon."]) {
    assert(articleFromHtml(`<p>${line}</p>`).words === wordCount(line), `not counted: ${line}`);
  }
});

// ---- 2. Thin stories are skipped and replaced from the same feed ----

await test("thin stories are skipped, replaced, and the day stays at 30 with today's spread", async () => {
  const kinds = {
    "ireland-1": "thin",
    "news-0": "missing",
    "gaa-0": { title: "All-Ireland final: Kerry 1-20 Dublin 0-15 recap" },
    "world-2": { title: "Transfer deadline day updates: all the moves" },
    "sport-1": "thin",
  };
  const items = day(6, kinds);
  // Today's spread: what balance() picks from the same feeds with nothing thin.
  const today = spreadOf(balance(day(6), STORY_COUNT));
  day(6, kinds);
  const { out, err, lines } = await quietRun(items);
  assert(!err, `run failed: ${err && err.message}`);
  const titles = new Set(out.stories.map(s => s.title));
  assert(out.stories.length === STORY_COUNT, `expected ${STORY_COUNT} stories, got ${out.stories.length}`);
  for (const key of Object.keys(kinds)) {
    const t = items.find(s => s.id === key).title;
    assert(!titles.has(t), `thin story published: ${t}`);
  }
  assert(sameSpread(spreadOf(out.stories), today),
    `spread changed: ${JSON.stringify(spreadOf(out.stories))} vs ${JSON.stringify(today)}`);
  for (const s of out.stories) assert(wordCount(s.summary) >= MIN_ARTICLE_WORDS, `short text published: ${s.title}`);
  assert(out.stories.every((s, i) => s.id === `story-${i}`), "ids are not sequential");
  const skips = lines.filter(l => l.includes("Skipped ("));
  assert(skips.length === 5, `expected 5 skip lines, got ${skips.length}:\n${skips.join("\n")}`);
  assert(skips.some(l => /under 45 words, \d+ words\): Story number 1 from the ireland feed/.test(l)), "thin page not logged with its word count");
  assert(skips.some(l => /no article text, 0 words/.test(l)), "missing page not logged");
  assert(skips.some(l => /title: recap, not read/.test(l)), "recap not logged");
  const written = JSON.parse(readFileSync(join(OUT, "today.json"), "utf-8"));
  assert(written.stories.length === STORY_COUNT, "today.json does not hold the day");
});

await test("a day with no thin stories is exactly today's selection", async () => {
  const items = day(6);
  const today = balance(items, STORY_COUNT).map(s => s.title);
  const { out, err } = await quietRun(items);
  assert(!err, `run failed: ${err && err.message}`);
  assert(JSON.stringify(out.stories.map(s => s.title)) === JSON.stringify(today), "selection or order changed");
});

await test("a short report about RTÉ is kept and a soap preview is still skipped", async () => {
  const kinds = {
    "sport-0": { title: RYDER.title, html: ryderPage() },
    "ents-0": { title: SOAP_TITLE, html: soapPage() },
  };
  const items = day(6, kinds);
  const { out, err, lines } = await quietRun(items);
  assert(!err, `run failed: ${err && err.message}`);
  assert(out.stories.length === STORY_COUNT, `expected ${STORY_COUNT}, got ${out.stories.length}`);
  const ryder = out.stories.find(s => s.title === RYDER.title);
  assert(ryder, `dropped: ${lines.filter(l => l.includes("Skipped (")).join(" / ")}`);
  assert(ryder.summary === RYDER.reporting.filter(p => !p.includes("RTÉ")).join(" "), `text changed: ${ryder.summary}`);
  assert(!out.stories.some(s => s.title === SOAP_TITLE), "soap preview published");
  assert(lines.some(l => /Skipped \(under 45 words, 22 words\): Fair City on Sunday/.test(l)), "soap preview not logged");
});

await test("a feed that runs out of good stories is topped up from the others", async () => {
  // Every rugby page is thin; the two rugby slots go to other feeds.
  const items = day(6, Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [`rugby-${i}`, "thin"])));
  const { out, err } = await quietRun(items);
  assert(!err, `run failed: ${err && err.message}`);
  assert(out.stories.length === STORY_COUNT, `expected ${STORY_COUNT}, got ${out.stories.length}`);
  assert(!out.stories.some(s => s.feed === "rugby"), "a thin rugby story got through");
});

// ---- 3. Limits ----

await test(`no more than ${EXTRA_SCRAPES} extra pages are read`, async () => {
  const pool = day(6, Object.fromEntries(FEEDS.flatMap(f => [0, 1, 2, 3, 4, 5].map(i => [`${f}-${i}`, i < 3 ? "thin" : "good"]))));
  let reads = 0;
  const { log } = console;
  console.log = () => {};
  const { stories, scrapes } = await pickStories(pool, {
    total: STORY_COUNT, balance,
    scrape: async url => { reads++; return gen.scrapeArticle(url); },
  }).finally(() => { console.log = log; });
  assert(reads === STORY_COUNT + EXTRA_SCRAPES && scrapes === reads, `read ${reads} pages`);
  assert(stories.length < STORY_COUNT, "should have stopped short");
  assert(stories.every(s => wordCount(s.fullText) >= MIN_ARTICLE_WORDS), "a thin story got through");
});

await test(`a day with too few good stories still publishes them if at least ${MIN_STORIES}`, async () => {
  // Two stories per feed, the first one thin: 12 good stories in all.
  const items = day(2, Object.fromEntries(FEEDS.map(f => [`${f}-0`, "thin"])));
  rmSync(join(OUT, "today.json"), { force: true });
  const { out, err } = await quietRun(items);
  assert(!err, `run failed: ${err && err.message}`);
  assert(out.stories.length === FEEDS.length, `expected the ${FEEDS.length} good stories, got ${out.stories.length}`);
  assert(out.stories.every(s => s.title.startsWith("Story number 1 ")), "a thin story got through");
  const written = JSON.parse(readFileSync(join(OUT, "today.json"), "utf-8"));
  assert(written.stories.length === FEEDS.length, "today.json was not written with them");
});

await test(`fewer than ${MIN_STORIES} good stories publishes nothing`, async () => {
  // Two stories per feed, only five good ones in the whole day.
  const kinds = {};
  FEEDS.forEach((f, n) => {
    kinds[`${f}-0`] = "thin";
    if (n >= 5) kinds[`${f}-1`] = "thin";
  });
  const items = day(2, kinds);
  rmSync(join(OUT, "today.json"), { force: true });
  let marked = 0;
  const { err } = await quietRun(items, async (story, i) => { marked++; return fakeMark(story, i); });
  assert(err && err.message.includes(`minimum ${MIN_STORIES}`), `expected a refusal, got ${err ? err.message : "a published day"}`);
  // Refused before marking: no story is marked, so no MyMemory calls.
  assert(marked === 0, `${marked} stories marked on a day that cannot publish`);
  assert(err.message.includes("stories with article text"), `refused late: ${err.message}`);
  assert(!existsSync(join(OUT, "today.json")), "today.json was written");
});

// ---- Freshness: today's news first, each tab its share ----

const NOW = Date.parse("2026-10-29T08:30:00Z");
const story = (feed, i, hoursAgo, section) => ({
  id: `${feed}-${i}`, feed, section, title: `${feed} story ${i} with a long enough title`,
  summary: SENTENCE + ".", link: `https://example.ie/${feed}/${i}`,
  published: new Date(NOW - hoursAgo * 36e5).toISOString(),
});

await test("a quiet feed's places go to fresh stories in the same tab", async () => {
  // GAA: 2 fresh then old; /sport and soccer full of fresh stories.
  const items = [
    ...Array.from({ length: 10 }, (_, i) => story("gaa", i, i < 2 ? 3 : 70 + i, "sport")),
    ...Array.from({ length: 20 }, (_, i) => story("sport", i, 1 + i, "sport")),
    ...Array.from({ length: 20 }, (_, i) => story("soccer", i, 2 + i, "sport")),
    ...Array.from({ length: 20 }, (_, i) => story("news", i, 1 + i, "eire")),
    ...Array.from({ length: 20 }, (_, i) => story("world", i, 1 + i, "domhan")),
    ...Array.from({ length: 20 }, (_, i) => story("culture", i, 1 + i, "eile")),
  ];
  const out = balance(items, 30, { now: NOW });
  const sport = out.filter(s => s.section === "sport");
  assert(out.length === 30, `${out.length} chosen`);
  assert(sport.length === 9, `sport has ${sport.length}, wants 9`);
  assert(sport.every(s => NOW - Date.parse(s.published) <= 24 * 36e5), "an old sport story was chosen over fresh ones");
  assert(sport.filter(s => s.feed === "gaa").length === 2, "GAA's two fresh stories were not kept");
});

await test("older stories fill a tab only when it has nothing fresh", async () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => story("world", i, 40 + i, "domhan")),
    ...Array.from({ length: 40 }, (_, i) => story("news", i, 1 + i / 4, "eire")),
    ...Array.from({ length: 20 }, (_, i) => story("sport", i, 1 + i, "sport")),
    ...Array.from({ length: 20 }, (_, i) => story("culture", i, 1 + i, "eile")),
  ];
  const out = balance(items, 30, { now: NOW });
  const world = out.filter(s => s.section === "domhan").map(s => (NOW - Date.parse(s.published)) / 36e5);
  assert(world.length === 5, `domhan has ${world.length}`);
  assert(JSON.stringify(world.sort((a, b) => a - b)) === JSON.stringify([40, 41, 42, 43, 44]), `not the newest old ones: ${world}`);
});

// ---- The page's own tags place a story its feed tag said nothing about ----

await test("a story the feed placed takes its tab from the page's tags", async () => {
  const items = day(3);
  // Shaped like the Iowa midterms piece (2026-10-30): Top stories, tagged only
  // "Analysis and Comment", so the feed put it in Éire.
  const iowa = items.find(s => s.id === "news-0");
  Object.assign(iowa, { category: "Analysis and Comment", categoryIr: "Nuacht", section: "eire", fromFeed: true });
  pages.set(iowa.link, goodPage("news-0").replace("<html>",
    '<html><head><meta name="categories" content="News, Analysis and Comment, US, World, Iowa">' +
    '<meta property="article:tag" content="News, Analysis and Comment, US, World, Iowa"></head>'));
  // A feed-placed story whose page has no useful tags keeps the feed's tab.
  const other = items.find(s => s.id === "news-1");
  Object.assign(other, { category: "Prime Time", section: "eire", fromFeed: true });
  // A story whose own tag decided is never moved by its page.
  const tagged = items.find(s => s.id === "ireland-0");
  pages.set(tagged.link, goodPage("ireland-0").replace("<html>", '<html><head><meta name="categories" content="World"></head>'));

  const { out, err } = await quietRun(items);
  assert(!err, err && err.message);
  const by = id => out.stories.find(s => s.link === items.find(i => i.id === id).link);
  const a = by("news-0");
  assert(a && a.section === "domhan" && a.category === "US" && a.categoryIr === "Meiriceá", `Iowa: ${JSON.stringify(a && [a.section, a.category, a.categoryIr])}`);
  assert(by("news-1").section === "eire", "a page with no useful tags moved the story");
  assert(by("ireland-0").section === "eire", "a story whose tag decided was moved by its page");
  assert(out.stories.every(s => !("fromFeed" in s) && !("pageTags" in s)), "working fields left in today.json");
});

assert(net.calls === 0, "MyMemory was called");
const stray = net.blocked.filter(u => !u.includes("/fake/"));
if (stray.length) { failed++; console.log(`FAIL network calls attempted: ${stray.join(", ")}`); }

rmSync(OUT, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
