// Fixture tests for the word rules. No network: fetch is stubbed (archive.mjs)
// and MyMemory is a small in-file table.
//
//   node scripts/test/cases.mjs
import { net } from "./archive.mjs";
import { loadDict } from "../lib/dict.js";
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
