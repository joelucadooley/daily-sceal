// Which tab a story lands in when its first tag says nothing (categories.js),
// the page's meta tags (lib/page.js), and add-story.js's helpers. No network.
//
//   node scripts/test/sections.mjs
import { catInfo, linkInfo, linkFolders, resolveCat } from "../categories.js";
import { pageTags, pageInfo } from "../lib/page.js";

process.env.OUT_DIR = process.env.OUT_DIR || "/nonexistent";
const { feedFor, storyFromPage, linksFrom } = await import("../add-story.js");

let failed = 0, passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const show = x => JSON.stringify(x);

const IOWA = "https://www.rte.ie/news/2026/1030/1597292-iowa-midterm-elections/";

test("Television is Teilifís in Eile", () => {
  assert(show(catInfo("Television")) === show(["Teilifís", "eile"]), show(catInfo("Television")));
});

test("every tag is tried, not only the first", () => {
  const got = resolveCat(["Analysis and Comment", "US", "World"], IOWA);
  assert(got && got.tag === "US" && got.info[1] === "domhan", show(got));
  assert(resolveCat(["Ireland", "World"], IOWA).info[1] === "eire", "first resolving tag should win");
});

test("a programme tag and a bare /news/ link leave it to the feed", () => {
  assert(resolveCat(["Analysis and Comment"], IOWA) === null, show(resolveCat(["Analysis and Comment"], IOWA)));
  assert(resolveCat([], null) === null, "no tags, no link");
});

test("the link's folders decide when the tags do not", () => {
  const cases = [
    ["https://www.rte.ie/news/us/2026/1030/1597299-trump-midterm-us/", "Meiriceá", "domhan"],
    ["https://www.rte.ie/news/world/2026/1030/1597300-australia-mushroom-world/", "Domhan", "domhan"],
    ["https://www.rte.ie/news/ireland/2026/1030/1597301-agriculture/", "Éire", "eire"],
    ["https://www.rte.ie/entertainment/television/2026/1030/1597302-tributes/", "Teilifís", "eile"],
    ["https://www.rte.ie/lifestyle/living/2026/1019/1595953-samhain/", "Saol", "eile"],
    ["https://www.rte.ie/sport/us-sport/2026/1030/1597310-nfl/", "Spórt", "sport"],
    ["https://www.rte.ie/sport/hockey/2026/1030/1-hockey/", "Spórt", "sport"],
    ["https://www.rte.ie/culture/2026/1024/1596322-witch-trial/", "Cultúr", "eile"],
  ];
  for (const [link, label, section] of cases) {
    const info = linkInfo(link);
    assert(info && info[0] === label && info[1] === section, `${link}: ${show(info)}`);
  }
  for (const link of [
    IOWA,
    "https://www.rte.ie/news/analysis-and-comment/2026/1030/1-x/",
    "https://www.rte.ie/news/primetime/2026/1030/1-x/",
    "https://www.rte.ie/brainstorm/2026/1030/1006125-horror-movies/",
    "not a link",
  ]) assert(linkInfo(link) === null, `${link}: ${show(linkInfo(link))}`);
  assert(show(linkFolders("https://www.rte.ie/news/us/2026/1030/1597299-trump/")) === show(["news", "us"]), "folders");
});

const PAGE = `<!doctype html><html><head>
<title>Is Halloween the same as Samhain? - RTÉ</title>
<meta property="og:title" content="Is Halloween the same as Samhain?" />
<meta content="Pagan Priestess Deirdre Wadding explains Samhain &amp; its customs." property="og:description">
<meta property="article:published_time" content="2026-10-19T09:00:00+01:00">
<meta name="categories" content="Lifestyle, Living, Halloween">
<meta property="article:tag" content="Living, Samhain">
<meta name="toptag" content="Living">
</head><body><p>Text</p></body></html>`;

test("the page's tags are read from both meta tags, in order, once each", () => {
  assert(show(pageTags(PAGE)) === show(["Lifestyle", "Living", "Halloween", "Samhain"]), show(pageTags(PAGE)));
  assert(show(pageTags("<p>no meta</p>")) === "[]", "no tags");
});

test("headline, standfirst and time come from the meta tags", () => {
  const p = pageInfo(PAGE);
  assert(p.title === "Is Halloween the same as Samhain?", p.title);
  assert(p.description === "Pagan Priestess Deirdre Wadding explains Samhain & its customs.", p.description);
  assert(p.published === "2026-10-19T08:00:00.000Z", p.published);
  const bare = pageInfo("<title>Some headline - RTÉ</title>");
  assert(bare.title === "Some headline" && bare.published === null, show(bare));
});

test("add-story: the feed a link would have come in on", () => {
  const cases = {
    "https://www.rte.ie/lifestyle/living/2026/1019/1595953-samhain/": "life",
    "https://www.rte.ie/news/us/2026/1030/1-x/": "world",
    "https://www.rte.ie/news/ireland/2026/1030/1-x/": "ireland",
    "https://www.rte.ie/news/2026/1030/1-x/": "news",
    "https://www.rte.ie/sport/hurling/2026/1030/1-x/": "gaa",
    "https://www.rte.ie/sport/soccer/2026/1030/1-x/": "soccer",
    "https://www.rte.ie/sport/golf/2026/1030/1-x/": "sport",
    "https://www.rte.ie/entertainment/2026/1030/1-x/": "ents",
    "https://www.rte.ie/brainstorm/2026/1030/1-x/": "culture",
  };
  for (const [link, feed] of Object.entries(cases)) assert(feedFor(link) === feed, `${link}: ${feedFor(link)}`);
});

test("add-story: the story is built like a feed item", () => {
  const link = "https://www.rte.ie/lifestyle/living/2026/1019/1595953-samhain/";
  const s = storyFromPage(link, { ...pageInfo(PAGE), text: "Article text.", words: 300 }, new Date("2026-10-30T12:00:00Z"));
  assert(s.title === "Is Halloween the same as Samhain?", s.title);
  assert(s.feed === "life" && s.section === "eile" && s.categoryIr === "Saol" && s.category === "Lifestyle", show([s.feed, s.section, s.categoryIr, s.category]));
  assert(s.published === "2026-10-19T08:00:00.000Z" && s.fullText === "Article text.", show([s.published, s.fullText]));
  assert(s.rssSummary && s.rssSummary.startsWith("Pagan Priestess"), s.rssSummary);
});

test("add-story: links from one argument or several", () => {
  assert(show(linksFrom(["https://a/ https://b/", " https://c/ "])) === show(["https://a/", "https://b/", "https://c/"]), show(linksFrom(["https://a/ https://b/"])));
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
