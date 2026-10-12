// Fixture tests for the word rules. No network: fetch is stubbed (archive.mjs)
// and MyMemory is a small in-file table.
//
//   node scripts/test/cases.mjs
import { net } from "./archive.mjs";
import { loadDict, loadSenses } from "../lib/dict.js";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import * as words from "../lib/words.js";
import { createMyMemory } from "../lib/mymemory.js";

const dict = loadDict();
const MACHINE = {
  anuas: "anuas", down: "anuas", deal: "margadh", visit: "cuairt", project: "tionscadal",
  record: "barr-", match: "cluiche", show: "seó", former: "eiteán", amus: "amas",
  crowd: "slua", ball: "liathróid", squad: "painéal", result: "toradh", life: "saol",
};
// Answers like MyMemory: unknown words come back as the English.
const lookup = async w => MACHINE[w.toLowerCase()] ?? w;
const deps = { dict, lookup };
const SPORT = { feed: "gaa", section: "sport", topic: "sport" };
const NEWS = { feed: "news", section: "eire", topic: "eire" };
const EILE = { feed: "ents", section: "eile", topic: "eile" };

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
const markers = text => [...text.matchAll(/\[\[([^|\]]+)\|([^\]]+)\]\]/g)].map(m => ({ ga: m[1], en: m[2] }));
const level = (text, pct, ctx = NEWS) => words.buildLevel(text, pct, deps, { ctx });
const all = async (text, ctx = NEWS) => Promise.all([10, 25, 50].map(p => level(text, p, ctx)));

// ---- Places ----

await test("'Minister steps down' gives no marker on down", async () => {
  for (const text of ["The Minister steps down after the report into the hospital was published today.",
    "He said he would step down soon."]) {
    for (const out of await all(text)) assert(!markers(out).some(m => /^down$/i.test(m.en)), out);
  }
  assert(!/\|down\]\]/i.test(words.markHeadline("Minister steps down after report", dict, NEWS)), "headline");
});

await test("'Down win Ulster title' gives [[An Dún|Down]]", async () => {
  const h = words.markHeadline("Down win Ulster title", dict, SPORT);
  assert(h.includes("[[An Dún|Down]]"), h);
});

await test("'Clare O'Mahony' stays English", async () => {
  const text = "The singer Clare O'Mahony said the concert in the city was a great success for the band.";
  for (const out of await all(text)) assert(!/\|Clare\]\]/.test(out), out);
  assert(!/\|Clare\]\]/.test(words.markHeadline("Clare O'Mahony wins award", dict, NEWS)), "headline");
});

await test("'Down Under' stays English", async () => {
  const text = "The family moved Down Under last year and the children started school in the new town.";
  for (const out of await all(text)) assert(!/\|Down\]\]/.test(out), out);
});

await test("a lowercase place word is an ordinary word, never the place", async () => {
  // "trim" is on the risky list (Trim, Co Meath); try it with a place entry.
  const d = { ...deps, dict: { ...dict, places: { ...dict.places, trim: "Baile Átha Troim" } } };
  const lv = (t, p) => words.buildLevel(t, p, d, { ctx: NEWS });
  for (const p of [10, 25, 50]) {
    const out = await lv("They plan to trim the budget and cut the waiting lists at the hospital this year.", p);
    assert(!out.includes("Baile Átha Troim"), out);
  }
  assert(words.shouldTranslate("Trim", 10, "", d.dict), "capital Trim is a place candidate");
  assert(!words.shouldTranslate("down", 50, "", dict), "lowercase down");
});

// ---- Phrases ----

await test("'the cost of living crisis' gives one phrase marker", async () => {
  const text = "Families say the cost of living crisis is the main issue as the election campaign gets under way.";
  const outs = await all(text);
  for (const out of outs) assert(!markers(out).some(x => /^(cost|living)$/i.test(x.en)), out);
  for (const out of outs.slice(1)) {
    assert(markers(out).some(x => x.en === "cost of living" && x.ga === dict.overrides["cost of living"]), out);
  }
  const hy = await level("Rising cost-of-living pressures were raised by every party at the meeting in the town.", 10);
  assert(markers(hy).some(x => x.en === "cost-of-living"), hy);
});

await test("a phrase that is a name keeps its capitals; a capitalised ordinary phrase stays English", async () => {
  const out = await level("Talks on the Good Friday Agreement resumed in the city yesterday with all parties present.", 50);
  assert(out.includes("[[Comhaontú Aoine an Chéasta|Good Friday Agreement]]"), out);
  const name = await level("The charity Mental Health Ireland said the report showed a sharp rise in demand.", 50);
  assert(!/\|Mental Health\]\]/.test(name), name);
});

// ---- Senses ----

// The dictionary with some senses approved, as Joe would tick them.
const withSenses = senses => ({ ...deps, dict: { ...dict, senses } });

await test("senses.json ships empty and loads as {}", async () => {
  assert(JSON.stringify(dict.senses) === "{}", JSON.stringify(dict.senses));
});

await test("loadSenses: a missing file is {}, a bad entry is skipped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "senses-"));
  assert(JSON.stringify(loadSenses(pathToFileURL(join(dir, "none.json")))) === "{}", "missing");
  const f = join(dir, "senses.json");
  writeFileSync(f, JSON.stringify({ Pitch: { sport: "páirc" }, bad: { weather: "x" }, empty: { sport: "" }, former: { default: null } }));
  const warned = [];
  const got = loadSenses(pathToFileURL(f), m => warned.push(m));
  assert(JSON.stringify(got) === JSON.stringify({ pitch: { sport: "páirc" }, former: { default: null } }), JSON.stringify(got));
  assert(warned.length === 2, warned.join("; "));
});

await test("'a show' gives seó with an approved sense, English without one", async () => {
  const text = "She starred in a show at the theatre last night and the crowd loved every minute of it.";
  const d = withSenses({ show: { noun: "seó" } });
  const out = await words.buildLevel(text, 50, d, { ctx: EILE });
  assert(out.includes("[[seó|show]]"), out);
  assert(!/léiríonn\|show/.test(out), out);
  // Without the sense there is no noun Irish for "show": it stays English
  // (the W9 check lands with the tiered ranking).
});

await test("'match' in an eile story is not marked once the null sense is approved", async () => {
  const d = withSenses({ match: { sport: "cluiche", default: null } });
  const text = "Officials will match the funding raised by the community group for the new playground.";
  for (const p of [10, 25, 50]) {
    const out = await words.buildLevel(text, p, d, { ctx: EILE });
    assert(!/\|match\]\]/.test(out), out);
  }
  const sport = await words.buildLevel("The match was played in heavy rain before a big crowd in the stadium.", 50, d, { ctx: SPORT });
  assert(sport.includes("[[cluiche|match]]"), sport);
});

await test("a sense wins over the dictionary in its section, and the feed wins over the topic", async () => {
  const d = withSenses({ title: { sport: "craobh", gaa: "corn" } }).dict;
  assert(words.dictionaryFor("title", { ctx: SPORT }, d).irish === "corn", "gaa feed");
  assert(words.dictionaryFor("title", { ctx: { feed: "rugby", topic: "sport" } }, d).irish === "craobh", "sport topic");
  assert(words.dictionaryFor("title", { ctx: NEWS }, d).irish === dict.overrides.title, "news falls to overrides");
});

await test("storyContext: a sport feed is sport whatever the category", async () => {
  const c = words.storyContext({ feed: "sport", section: "eile" });
  assert(c.topic === "sport", JSON.stringify(c));
  assert(words.storyContext({ feed: "news", section: "domhan" }).topic === "domhan", "domhan");
});

// ---- Tokens ----

await test("'Séamus' stays whole and is not marked", async () => {
  assert(words.tokenize("Séamus Ó Sé").join("|") === "Séamus| |Ó| |Sé", words.tokenize("Séamus Ó Sé").join("|"));
  for (const out of await all("Séamus Coleman said the club had a great season and the squad was ready.")) {
    assert(out.startsWith("Séamus "), out);
    assert(!/amas|\|amus/.test(out), out);
  }
});

await test("gardaí, tánaiste and dáil match the never-translate list", async () => {
  for (const w of ["gardaí", "tánaiste", "dáil"]) assert(!words.shouldTranslate(w, 50, "", dict), w);
});

await test("apostrophes inside words stay, a trailing one is punctuation", async () => {
  assert(words.tokenize("O'Mahony's workers' café").join("|") === "O'Mahony's| |workers|'| |café",
    words.tokenize("O'Mahony's workers' café").join("|"));
});

// ---- Words never marked ----

await test("'year's' is not marked", async () => {
  for (const out of await all("Last year's festival drew a big crowd and this year's event will be bigger again.")) {
    assert(!/\|[^\]]*['’]s\]\]/.test(out), out);
  }
});

await test("number words and particles are never marked", async () => {
  const text = "Two men and the first woman set off up the hill, then came back down and went away for three days.";
  for (const out of await all(text)) {
    assert(!markers(out).some(m => /^(two|first|three|off|up|back|down|away)$/i.test(m.en)), out);
  }
});

await test("grammar words wait for Foundation", async () => {
  assert(!words.shouldTranslate("during", 10, "", dict), "during at 10");
  assert(words.shouldTranslate("during", 25, "", dict), "during at 25");
});

// ---- Irish form ----

await test("matchCase keeps the dictionary's capitals and fixes machine ones", async () => {
  assert(words.matchCase("january", "Mí Eanáir", { trusted: true }) === "Mí Eanáir", "Mí Eanáir");
  assert(words.matchCase("language", "Gaeilge", { trusted: true }) === "Gaeilge", "Gaeilge");
  assert(words.matchCase("city", "Cathair") === "cathair", "machine capital");
  assert(words.matchCase("Prices", "pRAGHSANNA") === "Praghsanna", "sentence start");
  assert(words.matchCase("prices", "praghsanna", { trusted: true }) === "praghsanna", "plain dictionary word");
});

await test("isGoodTranslation turns down fragments, quotes and articles", async () => {
  for (const [en, ga] of [["record", "barr-"], ["senior", "ard-"], ["pre", "réamh -"], ["ready", "ré-"],
    ["made", "críochnaitheach”"], ["first", "an chéad"], ["management", "an bhainistíocht"], ["those", "na daoine"]]) {
    assert(!words.isGoodTranslation(en, ga), `${en} ${ga}`);
  }
  for (const [en, ga] of [["deal", "margadh"], ["visit", "cuairt"], ["result", "toradh"], ["family", "teaghlach"]]) {
    assert(words.isGoodTranslation(en, ga), `${en} ${ga}`);
  }
});

// ---- MyMemory outage ----

await test("outage: run finishes, dictionary markers stay, breaker opens after 15, nothing waits", async () => {
  let calls = 0, slept = 0;
  const mm = createMyMemory({
    fetch: async () => { calls++; throw new Error("fetch failed"); },
    sleep: async () => { slept++; },
  });
  const d = { dict, lookup: mm.lookup, onRejected: w => mm.noteRejected(w) };
  const text = "The government said the budget would help families with the cost of housing. " +
    "Officials expect the plan to reduce prices for workers across the country this winter. " +
    "Critics argued the measures were too small to make a real difference to people struggling with bills.";
  let out = "";
  for (let i = 0; i < 6; i++) out = await words.buildLevel(text + ` Extra sentence number ${i} about pylons, gizmos and widgets.`, 50, d, { ctx: NEWS });
  assert(mm.breakerOpen, "breaker not open");
  assert(calls === 15, `calls ${calls}`);
  assert(slept === 15, `waits ${slept}`);
  assert(markers(out).length > 0, "no dictionary markers: " + out);
});

if (net.blocked.length) { failed++; console.log(`FAIL network calls: ${net.blocked[0]}`); }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
