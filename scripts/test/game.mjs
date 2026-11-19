// The daily game (scripts/game.js). No network: the checked post is passed in.
//
//   node scripts/test/game.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { makeGame, split, choose, isSad, QUESTIONS } from "../game.js";
import { shareText, beforeGap } from "../../src/gameText.js";

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
}

const dir = mkdtempSync(join(tmpdir(), "sceal-game-"));
mkdirSync(join(dir, "archive"));
const words = ["bád|boat", "teach|house", "madra|dog", "cat|cat", "crann|tree", "abhainn|river", "sliabh|mountain", "bóthar|road",
  "scoil|school", "leabhar|book", "ceol|music", "aimsir|weather", "bia|food", "uisce|water", "airgead|money", "carr|car"].map(p => { const [ga, en] = p.split("|"); return { ga, en }; });
writeFileSync(join(dir, "focail.json"), JSON.stringify({ words }));
writeFileSync(join(dir, "places.json"), JSON.stringify({ galway: "Gaillimh" }));
const autoText = "The [[bád|boat]] left. A [[teach|house]] fell. The [[madra|dog]] ran. The [[crann|tree]] grew. The [[abhainn|river]] rose. The [[sliabh|mountain]] stood.";
writeFileSync(join(dir, "archive", "2026-11-19.json"), JSON.stringify({ stories: [
  { title: "Man dies in crash", categoryIr: "Nuacht", levels: { 25: autoText } },
  { title: "A quiet day", link: "https://rte.ie/q", categoryIr: "Nuacht", levels: { 25: autoText.replace("[[crann|tree]]", "[[crann|branch]]") } },
] }));

const post = {
  title: "Fans wait for the game", link: "https://rte.ie/g", categoryIr: "Cultúr",
  headline: "[[Lucht leanúna|Fans]] wait in [[Gaillimh|Galway]]",
  text: "The [[scoil|school]] opened. The [[leabhar|book]] sold out and the [[ceol|music]] played. The [[aimsir|weather]] held. Free [[bia|food]] and [[uisce|water]] were given out.",
};
const opts = extra => ({ dataDir: dir, ...extra });

await test("the checked post comes first: five words, story order, no places", async () => {
  const g = await makeGame("2026-11-20", opts({ fetchPost: async from => (from === "2026-11-19" ? post : null) }));
  assert.equal(g.source, "post");
  assert.equal(g.from, "2026-11-19");
  assert.equal(g.questions.length, QUESTIONS);
  assert.deepEqual(g.questions.map(q => q.irish), ["Lucht leanúna", "scoil", "leabhar", "aimsir", "bia"]);
  for (const q of g.questions) {
    assert.equal(q.options.length, 4);
    assert.ok(q.options.includes(q.irish));
    assert.equal(new Set(q.options.map(o => o.toLowerCase())).size, 4);
  }
});

await test("options match the answer's capital, and no option is another answer", async () => {
  const g = await makeGame("2026-11-20", opts({ fetchPost: async () => post }));
  assert.ok(g.questions[0].options.every(o => /^\p{Lu}/u.test(o)));
  const answers = new Set(g.questions.map(q => q.irish.toLowerCase()));
  for (const q of g.questions) for (const o of q.options) if (o !== q.irish) assert.ok(!answers.has(o.toLowerCase()), o);
});

await test("the same game wherever and whenever it is built", async () => {
  const a = await makeGame("2026-11-20", opts({ fetchPost: async () => post }));
  const b = await makeGame("2026-11-20", opts({ fetchPost: async () => post }));
  assert.deepEqual(a, b);
});

await test("no checked post: yesterday's first story that isn't sad, checked words only", async () => {
  const g = await makeGame("2026-11-20", opts({ fetchPost: async () => null }));
  assert.equal(g.source, "auto");
  assert.equal(g.title, "A quiet day");
  assert.ok(!g.questions.some(q => q.english === "branch"), "a pair not in the dictionary is never asked");
});

await test("a sad checked post is skipped", async () => {
  const g = await makeGame("2026-11-20", opts({ fetchPost: async () => ({ ...post, title: "Boxer dies aged 31" }) }));
  assert.equal(g.source, "auto");
  assert.ok(isSad({ title: "Boxer dies aged 31", text: "" }));
});

await test("the gap sentence: other Irish in English, long sides cut", async () => {
  const s = "The [[scoil|school]] in the [[baile|town]] opened.";
  assert.deepEqual(split(s, s.indexOf("[[scoil")), { before: "The ", after: " in the town opened." });
  const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen [[x|y]] end";
  assert.equal(split(long, long.indexOf("[[")).before, "… three four five six seven eight nine ten eleven twelve thirteen fourteen ");
});

await test("choose: one per sentence first, then the rest", () => {
  const m = (irish, si, at = 0) => ({ irish, english: irish + "-en", si, at, sentence: "" });
  assert.deepEqual(choose([m("a", 0), m("b", 0, 5), m("c", 1), m("d", 2), m("e", 3), m("f", 4)], 5).map(x => x.irish), ["a", "c", "d", "e", "f"]);
  assert.deepEqual(choose([m("a", 0), m("b", 0, 5), m("c", 1)], 3).map(x => x.irish), ["a", "b", "c"]);
});

await test("share text: score, a shamrock or cross each, the link", () => {
  assert.equal(shareText([true, true, false, true, true]), "Daily Scéal gap fill 4/5\n☘️☘️❌☘️☘️\ndailysceal.com/#bearnai");
});

await test("a or an before the gap: a(n) until answered, then agreeing", () => {
  assert.equal(beforeGap("He bought a ", null), "He bought a(n) ");
  assert.equal(beforeGap("He bought an ", "teach"), "He bought a ");
  assert.equal(beforeGap("He bought a ", "abhainn"), "He bought an ");
  assert.equal(beforeGap("An ", null), "A(n) ");
  assert.equal(beforeGap("The banana ", null), "The banana ");
});

console.log(`game: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
