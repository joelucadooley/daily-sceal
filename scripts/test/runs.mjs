// Runs every archived story through the frozen baseline ("before") and
// through scripts/lib ("after"), with MyMemory faked, and measures both.
import { net, LEVELS, ctxOf } from "./archive.mjs";
import * as baseline from "./baseline.js";
import { loadDict } from "../lib/dict.js";
import * as words from "../lib/words.js";
import { createMyMemory } from "../lib/mymemory.js";
import { firstSentences, stripMarkers } from "../summary.js";
import { measure, measureHeadlines, quant, parse } from "./metrics.mjs";

const noSleep = async () => {};
baseline.setSleep(noSleep);

// The exact inputs processStory used: `summary` was overwritten with baseText.
export const inputsOf = s => {
  const text = s.summary || "";
  return {
    text,
    rss: s.rssSummary || firstSentences(stripMarkers(text)),
    title: s.title || "",
    ctx: words.storyContext ? words.storyContext(s) : ctxOf(s),
  };
};

// Before: the frozen code. The cache is cleared per story (the answers are
// fixed per word, so output is unchanged) to record the words each story
// sends to MyMemory.
export async function runBaseline(stories, answer) {
  net.respond = answer;
  const out = [];
  for (const { story } of stories) {
    const { text, rss, title } = inputsOf(story);
    baseline.clearCache();
    const asked = new Set();
    net.onAsk = q => asked.add(q.toLowerCase());
    const levels = {}, summaryLevels = {};
    for (const pct of LEVELS) {
      try { levels[pct] = await baseline.buildLevel(text, pct); } catch { levels[pct] = text; }
    }
    for (const pct of LEVELS) {
      try { summaryLevels[pct] = await baseline.buildLevel(rss, pct); } catch { summaryLevels[pct] = rss; }
    }
    out.push({ levels, summaryLevels, titleIr: baseline.markHeadline(title), asked });
  }
  net.onAsk = null;
  return out;
}

// The same dictionary with no extra list: today's code, and the replay's
// "without the list" run. Kept per dict so the phrase index is built once.
const BARE = new WeakMap();
export function withoutExtra(dict) {
  if (!BARE.has(dict)) BARE.set(dict, { ...dict, extra: Object.create(null) });
  return BARE.get(dict);
}

// After: scripts/lib through markStory, the same path processStory takes.
export async function runLib(stories, answer, { breakerLimit, dict = loadDict() } = {}) {
  net.respond = answer;
  const mm = createMyMemory({ sleep: noSleep, breakerLimit });
  const out = [];
  let asked;
  const deps = {
    dict,
    lookup: w => { asked.add(w.toLowerCase()); return mm.lookup(w); },
    onRejected: w => mm.noteRejected(w),
  };
  for (const { story } of stories) {
    asked = new Set();
    const { text, rss, title, ctx } = inputsOf(story);
    const r = await words.markStory({ title, text, rss, ctx }, deps);
    out.push({ ...r, asked });
  }
  return { out, mm, dict };
}

// Word spans the new rules could mark at each level (for the eligible-gap
// figure), when the lib exposes them.
export function eligibleFor(text, pct, dict, ctx) {
  return words.eligibleSpans ? words.eligibleSpans(text, pct, dict, ctx) : undefined;
}

// H4's yardstick, kept apart from the lib's own choice (headlineCandidates
// and looksNoun), so a word the lib wrongly turns down still counts: a
// headline word of 3+ letters whose lowercase is a dictionary key that is
// not a listed verb or adjective, whose Irish is not a verb form, and that
// is not a grammar, number or month word. A capital counts only at the
// start of the headline or after : or a dash (names stay out).
const MONTHS = new Set(["january", "february", "march", "april", "june", "july", "august", "september", "october", "november", "december"]);
export function hasDictionaryNoun(title, dict) {
  const tokens = words.tokenize(title);
  return tokens.some((tok, i) => {
    if (!words.isWordToken(tok) || tok.length < 3) return false;
    const key = tok.toLowerCase();
    if (/^\p{Lu}/u.test(tok) && !/(^|[:?!.–—-])\s*$/.test(tokens.slice(0, i).join(""))) return false;
    if (!Object.hasOwn(dict.overrides, key)) return false;
    if (words.DICT_VERBS.has(key) || words.DICT_ADJECTIVES.has(key) || words.FUNCTION_WORDS.has(key) ||
      words.NUMBER_WORDS.has(key) || words.GRAMMAR_WORDS.has(key) || words.PARTICLES.has(key) || MONTHS.has(key)) return false;
    return !words.isVerbLike(key, dict.overrides[key], { englishList: false });
  });
}

export function collect(stories, out, dict, archive) {
  const senses = dict.senses || {};
  const res = {};
  for (const field of ["levels", "summaryLevels"]) {
    res[field] = {};
    for (const pct of LEVELS) {
      const texts = stories.map(({ story }, i) => {
        const { text, rss, ctx } = inputsOf(story);
        const src = field === "levels" ? text : rss;
        return { text: out[i][field][pct], pct, topic: ctx.topic, eligible: eligibleFor(src, pct, dict, ctx) };
      });
      res[field][pct] = measure(texts, { dict, senses });
    }
  }
  res.headlines = measureHeadlines(stories.map(({ story }, i) => ({
    titleIr: out[i].titleIr,
    eligible: words.headlineHasEligible ? hasDictionaryNoun(story.title || "", dict) : undefined,
  })), { dict });
  // Unique MyMemory words per archive day (30 stories, cold cache).
  const perDay = archive.days.map(d => {
    const u = new Set();
    for (const link of d.links) for (const w of out[archive.byLink.get(link)].asked) u.add(w);
    return u.size;
  });
  res.mmPerDay = perDay.reduce((a, b) => a + b, 0) / Math.max(1, perDay.length);
  return res;
}

const f1 = x => x.toFixed(1);
const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : "0%");

// Rows of the plan E table for one field.
export function tableRows(before, after, field) {
  const rows = [];
  const cell = (fn) => LEVELS.flatMap(p => [fn(before[field][p], p), fn(after[field][p], p)]);
  rows.push(["Markers per 100 words", ...cell(r => f1(100 * r.markers / r.words))]);
  rows.push(["Markers per text", ...cell(r => f1(r.markers / r.texts))]);
  rows.push(["Longest gap, median / p90", ...cell(r => `${quant(r.longest, 0.5)} / ${quant(r.longest, 0.9)}`)]);
  if (after[field][10].longestEligible.length) {
    rows.push(["Longest gap with a markable word, median / p90", ...cell(r => r.longestEligible.length ? `${quant(r.longestEligible, 0.5)} / ${quant(r.longestEligible, 0.9)}` : "n/a")]);
    rows.push(["Texts with an over-limit gap and no markable word", ...cell(r => r.longestEligible.length ? String(r.overMaxNoEligible) : "n/a")]);
  }
  rows.push(["Sentences of 6+ words with no marker", ...cell(r => pc(r.sentences6Empty, r.sentences6))]);
  rows.push(["Pairs closer than the level minimum", ...cell(r => `${r.tooClose} (${pc(r.tooClose, r.markers)})`)]);
  rows.push(["Pairs one word apart", ...cell(r => String(r.oneApart))]);
  rows.push(["Repeats (over the cap)", ...cell(r => `${pc(r.repeats, r.markers)} (${r.overCap})`)]);
  rows.push(["Share in each third", ...cell(r => r.thirds.map(t => Math.round(100 * t / Math.max(1, r.markers))).join("/"))]);
  rows.push(["Verified share", ...cell(r => pc(r.verified, r.markers))]);
  rows.push(["Extra list share", ...cell(r => pc(r.extra, r.markers))]);
  rows.push(["Known wrong pairs", ...cell(r => String(r.knownWrong))]);
  rows.push(["Texts with no marker", ...cell(r => `${r.zero}${r.longestEligible.length ? ` (${r.zeroWithEligible} with a dictionary word)` : ""}`)]);
  rows.push(["English -ed words marked", ...cell(r => String(r.edWords))]);
  rows.push(["Phrase markers", ...cell(r => String(r.phrases))]);
  return rows;
}

export function headlineRows(before, after) {
  const hb = before.headlines, ha = after.headlines;
  const rows = [
    ["Headlines with no Irish", pc(hb.none, hb.n), pc(ha.none, ha.n)],
    ["Side by side", String(hb.sideBySide), String(ha.sideBySide)],
    ["Name parts marked", String(hb.nameParts), String(ha.nameParts)],
    ["Unique MyMemory words per day", f1(before.mmPerDay), f1(after.mmPerDay)],
  ];
  if (ha.withEligible) {
    rows.splice(1, 0, ["No Irish among headlines with a dictionary noun", `${hb.noneWithEligible} of ${hb.withEligible}`, `${ha.noneWithEligible} of ${ha.withEligible}`]);
  }
  return rows;
}

export function markdownTable(head, rows) {
  const line = cells => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
}

export const LEVEL_HEAD = ["Metric", "10 before", "10 after", "25 before", "25 after", "50 before", "50 after"];

// Beginner texts with fewer than 3 Irish words: all of them, and those whose
// text is 60 words or more.
export const THIN_UNDER = 3;
export const THIN_LONG = 60;
export function thinBeginner(out, field) {
  let all = 0, long = 0;
  for (const r of out) {
    const { markers, words } = parse(r[field][10]);
    if (markers.length >= THIN_UNDER) continue;
    all++;
    if (words >= THIN_LONG) long++;
  }
  return { all, long };
}

// The extra list's own table: for each level, today's code, the new rules
// without the list and with it. runs: [{ label, m, out }] in that order.
export function extraRows(runs, field) {
  const NAME = { 10: "Beginner", 25: "Foundation", 50: "Intermediate" };
  const today = runs[0].m[field];
  const density = r => 100 * r.markers / r.words;
  const rows = [];
  for (const p of LEVELS) {
    const cells = fn => runs.map(x => fn(x.m[field][p], x));
    rows.push([`${NAME[p]}: Irish per 100 words`, ...cells(r => f1(density(r)))]);
    rows.push([`${NAME[p]}: change from today`, ...cells(r => `${(100 * (density(r) / density(today[p]) - 1)).toFixed(1)}%`)]);
    if (p === 10) {
      rows.push([`${NAME[p]}: texts with fewer than ${THIN_UNDER} Irish words`, ...cells((r, x) => String(thinBeginner(x.out, field).all))]);
      rows.push([`${NAME[p]}: of those, ${THIN_LONG}+ words long`, ...cells((r, x) => String(thinBeginner(x.out, field).long))]);
    }
    rows.push([`${NAME[p]}: longest gap, median / p90`, ...cells(r => `${quant(r.longest, 0.5)} / ${quant(r.longest, 0.9)}`)]);
    rows.push([`${NAME[p]}: Irish from Joe's dictionary / extra list / machine`, ...cells(r =>
      `${pc(r.verified, r.markers)} / ${pc(r.extra, r.markers)} / ${pc(r.markers - r.verified - r.extra, r.markers)}`)]);
  }
  return rows;
}
