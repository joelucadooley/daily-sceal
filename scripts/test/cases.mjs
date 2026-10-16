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
import { parse as parseMarked } from "./metrics.mjs";
import { createMyMemory } from "../lib/mymemory.js";
import { catInfo } from "../categories.js";

const dict = loadDict();
const MACHINE = {
  anuas: "anuas", down: "anuas", deal: "margadh", visit: "cuairt", project: "tionscadal",
  record: "barr-", match: "cluiche", show: "seó", former: "eiteán", amus: "amas",
  crowd: "slua", ball: "liathróid", squad: "painéal", result: "toradh", life: "saol",
};
// Answers like MyMemory: unknown words come back as the English.
const lookup = async w => (Object.hasOwn(MACHINE, w.toLowerCase()) ? MACHINE[w.toLowerCase()] : w);
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
  const hy = await level("Rising cost-of-living pressures were raised by every party at the meeting in the town.", 25);
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

// ---- Ranking ----

await test("nouns first: Beginner marks bank and money, not accused", async () => {
  const text = "The bank had accused the men of stealing money from the project over several years.";
  const out = await level(text, 10);
  const m = markers(out);
  assert(m.length > 0, out);
  assert(!m.some(x => /^(accused|stealing)$/.test(x.en)), out);
  assert(m.every(x => ["bank", "money", "men", "project", "years"].includes(x.en)), out);
});

await test("at Beginner no -ed words, even from the dictionary", async () => {
  const text = "The minister announced the plan and confirmed that the hospital opened a new ward. " +
    "Two people were injured and the road was closed for the day while crews worked on it.";
  const out = await level(text, 10);
  assert(!markers(out).some(x => /ed$/.test(x.en)), out);
});

await test("a noun gets a noun: 'the show' and 'their return' stay English without a sense", async () => {
  for (const out of await all("The show opened to good reviews and fans cheered their return to the stage after the break.", EILE)) {
    assert(!/\|show\]\]/.test(out), out);
    assert(!/\|return\]\]/.test(out), out);
  }
});

await test("'to help' is not given the noun cabhair; 'the help' can be", async () => {
  for (const out of await all("Volunteers came to help families in the town after the flood damaged their homes.")) {
    assert(!/\|help\]\]/.test(out), out);
  }
  const ok = await level("Families said the help from volunteers after the flood made a huge difference to them.", 50);
  assert(/\[\[cabhair\|help\]\]/.test(ok), ok);
});

await test("root verb forms are skipped (question 9): rises, spans, reflects", async () => {
  for (const out of await all("Inflation rises again as the report reflects a crisis that spans the whole economy.")) {
    assert(!markers(out).some(x => /^(rises|reflects|spans)$/.test(x.en)), out);
  }
});

await test("short dictionary nouns count: 'pay' can be marked at Beginner (W4)", async () => {
  assert(words.shouldTranslate("pay", 10, "", dict), "pay is a Beginner candidate");
  assert(!words.shouldTranslate("pet", 25, "", dict), "a short machine word is still left out");
  const out = await level("Staff voted to accept the offer on pay late on Thursday after a long debate.", 10);
  assert(/\[\[pá\|pay\]\]/.test(out), out);
});

await test("words with many meanings never go to machine translation (S4)", async () => {
  let asked = [];
  const d = { dict, lookup: async w => { asked.push(w.toLowerCase()); return MACHINE[w.toLowerCase()] ?? w; } };
  await words.buildLevel("The former minister said the season would end at home after the record draw and the case.", 50, d, { ctx: SPORT });
  for (const w of ["former", "season", "end", "home", "record", "draw", "case"]) assert(!asked.includes(w), `${w} sent to MyMemory`);
});

// ---- Spacing ----

const LONG_TEXT = "The government said the budget would help families with the cost of housing this winter. " +
  "Officials expect the plan to reduce prices for workers and farmers across the country. " +
  "The minister told the meeting in the town that the hospital and the school would get more money. " +
  "Critics argued the measures were too small for people struggling with bills, rent and energy costs. " +
  "The report into the economy found that the year had been hard for every family and every business. " +
  "A spokesperson for the union said its members would vote on the offer at a meeting next week.";
const wordGaps = text => {
  const { markers: ms, words: n } = parseMarked(text);
  const gaps = [];
  let a = -1;
  for (const m of ms) { gaps.push(m.start - a - 1); a = m.end; }
  gaps.push(n - a - 1);
  return { ms, gaps };
};

await test("spacing: fewest words between markers and the repeat cap hold at every level", async () => {
  for (const p of [10, 25, 50]) {
    const out = await level(LONG_TEXT, p);
    const { ms, gaps } = wordGaps(out);
    const r = words.LEVEL_RULES[p];
    assert(gaps.slice(1, -1).every(g => g >= r.minBetween), `${p}: ${gaps.join(",")} ${out}`);
    const seen = {};
    for (const m of ms) seen[m.en.toLowerCase()] = (seen[m.en.toLowerCase()] || 0) + 1;
    assert(Object.values(seen).every(n => n <= r.repeatCap), `${p}: ${JSON.stringify(seen)}`);
  }
});

await test("Beginner: one marker per sentence under 20 words, and dictionary Irish only", async () => {
  const out = await level(LONG_TEXT, 10);
  const { ms } = wordGaps(out);
  assert(ms.length >= 4, out);
  for (const m of ms) {
    const key = m.en.toLowerCase().split(/[\s-]+/).join(" ");
    assert(dict.overrides[key] !== undefined || Object.values(dict.places).includes(m.ga), `${m.en}=${m.ga} not from the dictionary`);
  }
  for (const sentence of LONG_TEXT.split(/(?<=\.) /)) {
    const marked = await level(sentence, 10);
    assert(markers(marked).length <= 1, marked);
  }
});

await test("no long gaps: the longest stretch with no marker stays under the level limit here", async () => {
  for (const p of [10, 25, 50]) {
    const { gaps } = wordGaps(await level(LONG_TEXT, p));
    assert(Math.max(...gaps) <= words.LEVEL_RULES[p].maxGap, `${p}: ${gaps.join(",")}`);
  }
});

await test("backfill: a rejected machine answer is replaced by another word nearby", async () => {
  const text = "Residents of the valley said the pylon and the turbine were built near the lake without any warning.";
  const asked = [];
  // pylon comes back as junk; turbine is fine.
  const d = { dict, lookup: async w => { asked.push(w); return { pylon: "pylon", turbine: "tuirbín" }[w.toLowerCase()] ?? w; } };
  const out = await words.buildLevel(text, 50, d, { ctx: NEWS });
  assert(out.includes("[[tuirbín|turbine]]"), out);
  assert(!out.includes("|pylon]]"), out);
});

await test("Foundation uses machine Irish only where the dictionary leaves a gap", async () => {
  const asked = [];
  const d = { dict, lookup: async w => { asked.push(w.toLowerCase()); return MACHINE[w.toLowerCase()] ?? w; } };
  // Dictionary words all through: no machine call needed.
  await words.buildLevel(LONG_TEXT, 25, d, { ctx: NEWS });
  const dense = asked.length;
  asked.length = 0;
  // A long stretch with no dictionary word: machine nouns may close it.
  const sparse = "The squad trained on the beach with the ball before the visit, and the result was a deal on the pitch, " +
    "said the coach, who praised the squad for their life and energy over the long months of preparation.";
  const out = await words.buildLevel(sparse, 25, d, { ctx: SPORT });
  assert(dense === 0, `machine asked ${dense} times on a dictionary-rich text`);
  assert(asked.length > 0 && markers(out).length > 0, out);
});

await test("outage: Beginner is unchanged when MyMemory is down (dictionary only)", async () => {
  const down = { dict, lookup: async () => { throw new Error("down"); } };
  assert(await words.buildLevel(LONG_TEXT, 10, down, { ctx: NEWS }) === await level(LONG_TEXT, 10), "Beginner changed");
});

// ---- Headlines ----

await test("headlines: never side by side, nouns only", async () => {
  const h = words.markHeadline("Four people killed in Kyiv", dict, NEWS);
  assert(!/maraíodh/.test(h), h);
  const vw = words.markHeadline("VW profit warning hits shares", dict, NEWS);
  assert(!/\]\] \[\[/.test(vw), vw);
  assert(/\[\[/.test(vw), vw);
});

await test("headlines: a capital mid-headline is a name (Katie Price, Fair City, White House)", async () => {
  for (const t of ["Katie Price to appear in court", "Fair City star leaves soap", "White House says talks to continue",
    "Culture Night events across the country"]) {
    const h = words.markHeadline(t, dict, EILE);
    assert(!/\|(Price|City|House|Night)\]\]/.test(h), h);
  }
  const ok = words.markHeadline("Analysis: Budget brings little for renters", dict, NEWS);
  assert(ok.includes("[[Buiséad|Budget]]"), ok);
});

await test("headlines: three-letter dictionary nouns count, verbs and months do not", async () => {
  const h = words.markHeadline("Pay deal agreed for nurses after long talks", dict, NEWS);
  assert(h.includes("[[Pá|Pay]]"), h);
  const v = words.markHeadline("Government announced plan to show new rules", dict, NEWS);
  assert(!/d'fhógair|léiríonn/.test(v), v);
  const m = words.markHeadline("February rents rise again", dict, NEWS);
  assert(!/Mí Feabhra/.test(m), m);
});

await test("headlines: an approved sense comes before the dictionary", async () => {
  const d = { ...dict, senses: { title: { sport: "craobh" } } };
  const h = words.markHeadline("Kerry win the title in Croke Park", d, SPORT);
  assert(h.includes("[[craobh|title]]"), h);
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

// ---- Categories ----

await test("categories match whole words: Darts is not arts, Stardust is not us", async () => {
  assert(catInfo("Darts") === null, JSON.stringify(catInfo("Darts")));
  assert(catInfo("Stardust") === null, JSON.stringify(catInfo("Stardust")));
  assert(catInfo("Agriculture") === null, JSON.stringify(catInfo("Agriculture")));
  assert(catInfo("World Cup 2026")?.[1] === "sport", JSON.stringify(catInfo("World Cup 2026")));
  assert(catInfo("USA")?.[1] === "domhan", JSON.stringify(catInfo("USA")));
  assert(catInfo("Northern Ireland")?.[0] === "Tuaisceart Éireann", JSON.stringify(catInfo("Northern Ireland")));
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
  // Plain nouns with no dictionary entry, so every run needs MyMemory.
  const nouns = ["kettle", "ladder", "lantern", "pebble", "saddle", "teapot", "thimble", "trumpet",
    "walrus", "wardrobe", "anchor", "barrel", "biscuit", "blanket", "bucket", "candle", "carpet",
    "chimney", "cushion", "envelope", "feather", "goblet", "hammer", "helmet", "jacket", "kitten"];
  let out = "";
  for (let i = 0; i < nouns.length; i += 2) {
    out = await words.buildLevel(text + ` The ${nouns[i]} sat beside the ${nouns[i + 1]} for a while.`, 50, d, { ctx: NEWS });
  }
  assert(mm.breakerOpen, "breaker not open");
  assert(calls === 15, `calls ${calls}`);
  assert(slept === 15, `waits ${slept}`);
  assert(markers(out).length > 0, "no dictionary markers: " + out);
});

// ---- Review fixes (one case per confirmed defect) ----

// The text with every marker replaced by its English, as App.jsx reads it.
const appStrip = t => t.replace(/\[\[([^\|]+)\|([^\]]+)\]\]/g, "$2");

await test("G22: 'constructor' stays English, in text and headline", async () => {
  const text = "The constructor of the stadium said the new roof would be finished before the winter.";
  for (const out of await all(text)) assert(!/native code|\|constructor\]\]/.test(out), out);
  const h = words.markHeadline("New constructor for stadium", dict, NEWS);
  assert(!/native code|\|constructor\]\]/.test(h), h);
  // A plain object dictionary (as the tests build them) is safe too.
  const plain = { ...dict, overrides: { ...dict.overrides }, places: { ...dict.places } };
  assert(words.dictionaryFor("constructor", {}, plain) === undefined, "plain object");
});

await test("G13: tokens with a digit and the currency 'won' are never marked", async () => {
  for (const tok of ["21st", "45pm", "75million", "1980s", "u003EWill", "16bn"]) {
    for (const p of [10, 25, 50]) assert(!words.shouldTranslate(tok, p, "", dict), `${tok} at ${p}`);
  }
  const text = "Samsung said profit reached 107.4 trillion won this year, and the 21st report starts at 7.45pm with £10.75million in sales.";
  for (const out of await all(text)) assert(!/\|(won|21st|45pm|75million)\]\]/.test(out), out);
  const h = words.markHeadline("Samsung profit hits 100 trillion won", dict, NEWS);
  assert(!/\|won\]\]/.test(h), h);
  // Won as a verb still can be (Intermediate).
  assert(words.shouldTranslate("won", 50, "", dict, { prev: "Kerry" }), "Kerry won");
});

await test("G14: pronouns, auxiliaries, question words and contractions are never marked", async () => {
  const text = "What the council did for them was where both sides agreed, being careful, and it hasn't changed what they're doing.";
  for (const out of await all(text)) {
    assert(!markers(out).some(m => /^(what|did|them|where|both|being|hasn't|they're)$/i.test(m.en)), out);
  }
  for (const w of ["him", "themselves", "does", "how", "why", "such", "isn't", "we'll"]) {
    assert(!words.shouldTranslate(w, 50, "", dict), w);
  }
});

await test("G19: a word in square brackets is never marked", async () => {
  const text = "Officials said [people] and [money] would follow, and the [team] at the margins [higher yields] would help the city.";
  for (const out of await all(text)) {
    assert(!out.includes("[[["), out);
    assert(appStrip(out) === text, out);
  }
  const h = words.markHeadline("Club says [team] will play", dict, SPORT);
  assert(!h.includes("[[[") && appStrip(h) === "Club says [team] will play", h);
});

await test("G4: a word joined by a hyphen is never marked on its own", async () => {
  const text = "The club got a nine-month transfer ban and a two-year partnership deal, and the long-awaited " +
    "quarter-final stages of the All-Ireland title race start on a topsy-turvy day for the 28-year-old player.";
  for (const out of await all(text)) {
    assert(!markers(out).some(m => /^(month|year|final|awaited|long|topsy|old|Ireland|two|nine)$/i.test(m.en)), out);
  }
  for (const t of ["All-Ireland title defence for Kerry", "Seanad bye-election date set", "Three-car crash on motorway"]) {
    const h = words.markHeadline(t, dict, NEWS);
    assert(!/\|(Ireland|election|car)\]\]/.test(h), h);
  }
  // A spaced dash does not join, and dictionary hyphen phrases still match.
  const sp = await level("Rising cost-of-living pressures were raised by every party at the meeting in the town.", 25);
  assert(markers(sp).some(x => x.en === "cost-of-living"), sp);
});

await test("G15: a plural possessive is never marked; a word before a closing quote can be", async () => {
  for (const out of await all("The members' bar reopened and staff with five years’ experience said the families' view mattered.")) {
    assert(!markers(out).some(m => /^(members|years|families)$/i.test(m.en)), out);
  }
  const t = words.tokenize("He said some 'individual players' are uncomfortable.");
  const i = t.indexOf("players");
  assert(!words.pluralPossessive(t, i), "closing quote");
  const p = words.tokenize("The players' union met.");
  assert(words.pluralPossessive(p, p.indexOf("players")), "possessive");
});

await test("G2: a place followed by a capital is part of a name; a county word keeps it", async () => {
  const text = "Fans saw Drogheda United face Derry City and Sligo Rovers, while boxers Tyrone McKenna and others " +
    "met at Kildare Street and in Armagh City before Clare County Council spoke about Cork, Galway, Tyrone and Connacht.";
  for (const out of await all(text, SPORT)) {
    assert(!/\|(Drogheda|Derry|Sligo|Kildare|Armagh)\]\]/.test(out), out);
    assert(!/Tír Eoghain\|Tyrone\]\] McKenna/.test(out), out);
  }
  assert(words.placeFor("Tyrone", "", dict) !== undefined, "Tyrone before a comma is the county");
  assert(words.placeFor("Clare", "County", dict) !== undefined, "Clare County Council");
  assert(words.placeFor("Derry", "City", dict) === undefined, "Derry City");
  for (const t of ["Galway United 0-2 Derry City", "Cork Jazz Festival returns", "Ulster Unionists pick leader"]) {
    const h = words.markHeadline(t, dict, SPORT);
    assert(!/\|(Galway|Derry|Cork|Ulster)\]\]/.test(h), h);
  }
});

await test("G3: the first word of a name at the start of a headline stays English", async () => {
  for (const t of ["Premier League: Man United 0-1 Man City recap", "World Cup play-off draw made",
    "South Africa power past Wales", "West Bank sanctions agreed", "Report released - Law Society"]) {
    const h = words.markHeadline(t, dict, SPORT);
    assert(!/\|(Man|World|South|West|Law)\]\]/.test(h), h);
  }
  const ok = words.markHeadline("Analysis: Budget brings little for renters", dict, NEWS);
  assert(ok.includes("[[Buiséad|Budget]]"), ok);
});

await test("G1: a noun/verb word after to, a modal, has or a pronoun keeps no noun Irish", async () => {
  const text = "Officials failed to pay a 1% rise and travelled to witness Marine One land. It plans to operate, " +
    "and the firm could flood the market, while Met Éireann has forecast rain. I will match it. " +
    "They hope to pressure Andy Burnham and look forward to meeting them to experience Donegal.";
  for (const out of await all(text)) {
    assert(!markers(out).some(m => /^(pay|witness|plans|flood|forecast|match|pressure|meeting|experience)$/i.test(m.en)), out);
  }
  // Nouns stay nouns: "to hospital.", "the pay", "a meeting".
  const ok = await level("He was taken to hospital. The pay rise was agreed at a meeting of the union in the city.", 10);
  assert(/\|(hospital|pay|meeting)\]\]/.test(ok), ok);
});

await test("G6: final, sound and capital before a noun stay English; the final itself can be marked", async () => {
  const text = "On the final day of play, in their final game, capital punishment and a sound foundation were discussed.";
  for (const out of await all(text, SPORT)) assert(!/\|(final|capital|sound)\]\]/.test(out), out);
  const ok = await level("Kerry beat Dublin in the final. Fans travelled to the capital for the game against Mayo.", 10, SPORT);
  assert(/\[\[cluiche ceannais\|final\]\]/.test(ok) || /\|capital\]\]/.test(ok), ok);
});

await test("G8: with the fine sense approved, 'a fine finish' stays English and 'a fine of' is fíneáil", async () => {
  const d = withSenses({ fine: { noun: "fíneáil", default: null } });
  for (const t of ["He scored with a fine finish late in the game at the stadium.",
    "He described his play as a \"fine, unusual, tragic comedy\" at the festival.",
    "She followed up a fine first try with another in the second half."]) {
    for (const p of [10, 25, 50]) {
      const out = await words.buildLevel(t, p, d, { ctx: SPORT });
      assert(!/fíneáil/.test(out), out);
    }
  }
  const ok = await words.buildLevel("The company was given a fine of €5,000 by the court in the city.", 10, d, { ctx: NEWS });
  assert(ok.includes("[[fíneáil|fine]]"), ok);
  assert(!/fíneáil/.test(words.markHeadline("The 'fine margins' that decided the final", d.dict, SPORT)), "headline");
});

await test("G9: a noun/verb word that is the headline's verb stays English", async () => {
  for (const t of ["Escalation fears in Middle East as Houthis attack Riyadh",
    "Wheelchair basketball team plans Israel match gesture", "Casey Walsh talks Tall Tales & Murder"]) {
    const h = words.markHeadline(t, dict, NEWS);
    assert(!/\|(attack|plans|talks)\]\]/.test(h), h);
  }
  const ok = words.markHeadline("Drone attack on power station", dict, NEWS);
  assert(/\|attack\]\]/.test(ok), ok);
});

await test("G10: 'that' before a verb is not a determiner", async () => {
  const text = "Only parties that support Mr Putin took part, and a clip that stays with me shows a jar that sets four records.";
  for (const out of await all(text)) assert(!/\|(support|stays|sets)\]\]/.test(out), out);
  for (const t of ["We all agreed that decision was right.", "Everyone said that year was hard."]) {
    const ok = await level(t, 10);
    assert(/\|(decision|year)\]\]/.test(ok), ok);
  }
});

await test("G11: show in noun position never gets léiríonn, even two words after the determiner", async () => {
  for (const t of ["Fans gathered ahead of the launch show in the city on Friday night.",
    "This expansive show highlights the work of many artists from the country.",
    "It was the second season of the BBC show and the best TV show of the year.",
    "Crowds came to the Fashion Week show. Then she did not show it to anyone at the event."]) {
    for (const out of await all(t, EILE)) assert(!/léiríonn/.test(out), out);
  }
  const d = withSenses({ show: { noun: "seó", default: null } });
  const out = await words.buildLevel("Fans gathered ahead of the launch show in the city on Friday night.", 50, d, { ctx: EILE });
  assert(out.includes("[[seó|show]]"), out);
});

await test("G12 and G18: the Irish verb form matches the English (passive, participle, irregular past)", async () => {
  const text = "The Budget will be announced at 1pm, and the book will be published by Gill Books. " +
    "It was announced that the show is not to be missed. Power closed out his tournament in style.";
  for (const out of await all(text)) {
    assert(!/d'fhógair\|announced|d'fhoilsigh\|published|chaill\|missed|dúnta\|closed/.test(out), out);
  }
  // Machine Irish for an irregular past: a root or a participle is turned down.
  const lookup = async w => ({ told: "inste", found: "bunaigh", slid: "sleamhnaigh", wrote: "scríofa", stays: "tréimhsí fanachta" })[w.toLowerCase()] ?? w;
  const m = await words.buildLevel("Siriano told the press, Vinnie found himself alone and sales slid while he wrote: a clip that stays with me.", 50,
    { dict, lookup }, { ctx: NEWS });
  assert(!/inste|bunaigh|sleamhnaigh|scríofa|tréimhsí/.test(m), m);
  assert(!words.looksNoun("told") && !words.looksNoun("found"), "irregular pasts are not nouns");
  // Active past after a subject is fine.
  const spans = words.eligibleSpans("The minister announced a new plan for the hospital in the town yesterday.", 25, dict, NEWS);
  assert(spans.some(([, , k]) => k === "announced"), JSON.stringify(spans));
});

await test("G21: family, fish and prize are nouns; rise is a noun only after a determiner", async () => {
  assert(words.looksNoun("family") && words.looksNoun("fish") && words.looksNoun("prize"), "known nouns");
  const h = words.markHeadline("German, US scientists win Nobel prize for optogenetics", dict, NEWS);
  assert(h.includes("[[duais|prize]]"), h);
  assert(words.markHeadline("H&M founding family builds stake", dict, NEWS).includes("[[teaghlach|family]]"), "family");
  assert(!/ardú/.test(words.markHeadline("Breastfeeding rates rise to record high", dict, NEWS)), "rise as a verb");
  assert(/ardú/.test(words.markHeadline("Warning over a rise in rents", dict, NEWS)), "a rise");
  const out = await level("The family said the fish was a prize catch for the town.", 10);
  assert(/\|(family|fish|prize)\]\]/.test(out), out);
});

await test("G16: machine Irish carrying a mutation from a dropped article is turned down", async () => {
  for (const [en, ga] of [["changes", "hathruithe"], ["lands", "dtailte"], ["groups", "ngrúpaí"], ["rupture", "heirne"],
    ["helps", "gcuidíonn seo"], ["farms", "bhfeirmeacha"], ["water", "n-uisce"], ["boxes", "mboscaí"]]) {
    assert(!words.isGoodTranslation(en, ga), `${en} ${ga}`);
  }
  for (const [en, ga] of [["hall", "halla"], ["hockey", "haca"], ["changes", "athruithe"], ["angle", "uillinn"]]) {
    assert(words.isGoodTranslation(en, ga), `${en} ${ga}`);
  }
});

await test("Intermediate: machine -ed verbs and -ly adverbs pass only with the matching Irish form", async () => {
  const lookup = async w => ({ released: "scaoil", unveiled: "nocht", recently: "le déanaí", collapsed: "thit" })[w.toLowerCase()] ?? w;
  const out = await words.buildLevel("The band released a single while the firm unveiled plans recently, and the old bridge collapsed in the storm.", 50,
    { dict, lookup }, { ctx: NEWS });
  assert(!/\[\[scaoil\|released\]\]|\[\[nocht\|unveiled\]\]/.test(out), out);   // root forms for a past
  const one = await words.buildLevel("After months of warnings, it finally collapsed.", 50, { dict, lookup }, { ctx: NEWS });
  assert(one.includes("[[thit|collapsed]]"), one);
  assert(words.verbFormFits({ key: "published", afterBe: true }, "foilsithe"), "participle after be");
  assert(!words.verbFormFits({ key: "published", afterBe: true }, "d'fhoilsigh"), "past active after be");
  assert(!words.verbFormFits({ key: "stays", verb: true }, "tréimhsí fanachta"), "-s verb needs present Irish");
  // Foundation still leaves them out.
  const f = await words.buildLevel("The band released a single while the firm unveiled plans recently.", 25, { dict, lookup }, { ctx: NEWS });
  assert(!/\|(released|unveiled|recently)\]\]/.test(f), f);
});

await test("G23: MyMemory stops being asked after the time budget, and the run carries on", async () => {
  let t = 0, calls = 0;
  const mm = createMyMemory({
    fetch: async () => { calls++; t += 60 * 1000; return { json: async () => ({ responseStatus: 200, responseData: { translatedText: "x" } }) }; },
    sleep: async () => {},
    now: () => t,
    budgetMs: 5 * 60 * 1000,
  });
  for (const w of ["kettle", "ladder", "lantern", "pebble", "saddle", "teapot", "thimble", "trumpet"]) {
    try { await mm.lookup(w); } catch {}
  }
  assert(calls === 6, `calls ${calls}`);
  assert(mm.breakerOpen && /time budget/.test(mm.summary()), mm.summary());
  const d = { dict, lookup: mm.lookup, onRejected: w => mm.noteRejected(w) };
  const out = await words.buildLevel(LONG_TEXT, 50, d, { ctx: NEWS });
  assert(markers(out).length > 0, out);
});

if (net.blocked.length) { failed++; console.log(`FAIL network calls: ${net.blocked[0]}`); }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
