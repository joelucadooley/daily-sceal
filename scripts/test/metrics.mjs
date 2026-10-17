// Measures marked text the same way for the frozen baseline and the new
// rules, so the before/after table compares like with like.
import { splitSentences } from "../summary.js";
import { MARKER } from "./archive.mjs";

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const countWords = s => (s.match(WORD) || []).length;

// The rule numbers each metric is checked against (rules draft, section 1).
export const LIMITS = {
  10: { maxGap: 40, minBetween: 4, repeatCap: 1 },
  25: { maxGap: 25, minBetween: 3, repeatCap: 2 },
  50: { maxGap: 12, minBetween: 2, repeatCap: 3 },
};

// Pairs the plan lists as wrong in news context (about 40). Matching is on
// lowercased English and Irish; `topic` limits a pair to one part of the paper.
export const KNOWN_WRONG = [
  ["down", "anuas"], ["record", "barr-"], ["made", "críochnaitheach”"], ["pitch", "airde"],
  ["points", "ladhróg"], ["point", "ladhróg"], ["case", "crotal"], ["party", "buíon"], ["state", "abair"],
  ["fine", "caolchúiseach"], ["draw", "aimsiú"], ["seat", "seas"], ["race", "caise abhann"],
  ["former", "eiteán"], ["end", "aidhm"], ["current", "cainéal"], ["comes", "coimhdire"],
  ["can", "canna"], ["four", "bád ceathrair"], ["home", "abhaile"], ["first", "an chéad"],
  ["two", "dhá"], ["senior", "ard-"], ["original", "bun-"], ["key", "bun-"], ["specialist", "sain-"],
  ["general", "ard-"], ["pre", "réamh -"], ["ready", "ré-"], ["season", "biaiste"], ["time", "aga"],
  ["minutes", "miontuairiscí"], ["whether", "aimsir"], ["while", "comhad"], ["position", "deashuíomh"],
  ["action", "aicsean"], ["means", "acmhainn"], ["set", "babhta"], ["take", "beir ar"],
  ["amus", "amas"], ["tel", "teil"], ["number", "uimhir"], ["club", "bata"], ["series", "dreas buillí"],
  // Found in the review of the Intermediate -ed change: a noun phrase, an
  // adverb and Irish with its own pronoun for one English verb.
  ["appointed", "dáta ceaptha"], ["forced", "d'éigean"], ["looked", "d'fhéach sé"], ["welcomed", "fáilte rompu"],
];
// Context-dependent wrong uses: a verb gloss right after a determiner (W9).
export const DETERMINER_VERB = [["show", "léiríonn"], ["return", "fill"], ["return", "aisbhuille"]];
const DETERMINERS = new Set(["the","a","an","its","their","his","her","this","that","these","those","our","some","any","each","every","no"]);
const KNOWN_WRONG_SET = new Set(KNOWN_WRONG.map(([e, g]) => `${e}|${g}`));
const DET_VERB_SET = new Set(DETERMINER_VERB.map(([e, g]) => `${e}|${g}`));

// Review checks shared by the replay and the report.
// G3: past active Irish, loosely (the first word only): d'fhógair, chaill.
export const PAST_ACTIVE_LOOSE = /^(d['’]|bh|ch|dh|fh|gh|mh|ph|sh|th|fuair(\s|$)|rinne|dúirt|chonaic|tháinig|chuaigh|thug|rug)/i;
const BE = /^(be|been|being|is|are|was|were|am|get|got|gets|getting|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|(it|he|she|that|there|what|who|here)['’]s)$/i;
const ADVERB = /^(first|now|also|still|already|later|then|not|never|recently|just|again|once|previously|\p{L}+ly)$/iu;
// True when plain text before a word ends in a be-form, with up to two
// adverbs after it: "was announced", "was first announced", "been repeatedly called".
export function passiveBefore(lead) {
  const ws = (lead.split(/[.!?;:]\s/).at(-1).match(WORD) || []).slice(-3).reverse();
  for (const w of ws) {
    if (BE.test(w)) return true;
    if (!ADVERB.test(w) || /^family$/i.test(w)) return false;
  }
  return false;
}
// W8: a modal written with a capital is a month or a name ("In May", "Will Smith").
export const MODAL_CUES = new Set(["will", "would", "can", "could", "should", "may", "might", "must", "did", "does", "do"]);
export const capitalModal = word => MODAL_CUES.has(word.toLowerCase()) && /^\p{Lu}/u.test(word);

// Parse a marked text into words and markers (word positions; a phrase
// marker spans all its English words). Sentences use summary.js's split.
export function parse(text) {
  const markers = [];
  let pos = 0, last = 0, prevWord = "";
  for (const m of text.matchAll(MARKER)) {
    const before = text.slice(last, m.index);
    const bw = before.match(WORD) || [];
    if (bw.length) prevWord = bw.at(-1);
    pos += bw.length;
    const n = Math.max(1, countWords(m[2]));
    markers.push({ start: pos, end: pos + n - 1, en: m[2], ga: m[1], prev: prevWord, at: m.index });
    pos += n;
    prevWord = (m[2].match(WORD) || [m[2]]).at(-1);
    last = m.index + m[0].length;
  }
  const plain = text.replace(MARKER, "$2");
  const words = countWords(plain);
  const sentences = splitSentences(plain).map(countWords);
  return { markers, words, sentences, plain };
}

function gapsOf(markers, words) {
  if (!markers.length) return [{ a: -1, b: words, len: words }];
  const gaps = [{ a: -1, b: markers[0].start, len: markers[0].start }];
  for (let i = 1; i < markers.length; i++) {
    gaps.push({ a: markers[i - 1].end, b: markers[i].start, len: markers[i].start - markers[i - 1].end - 1 });
  }
  const lastM = markers.at(-1);
  gaps.push({ a: lastM.end, b: words, len: words - lastM.end - 1 });
  return gaps;
}

const quant = (arr, q) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
};

// texts: [{ text, pct, topic, eligible? }] where eligible (optional) is a
// list of word positions [start, end] that the new rules could mark at this
// level, used for the "gaps that contain an eligible word" figure.
// Each marker counts once: `verified` (Joe's overrides, places, approved
// senses), `extra` (the extra list, when dict.extra has it and Joe's lists
// do not) or neither (machine). Measure output made without the extra list
// with a dict whose extra is {}, so machine Irish is never counted as extra.
export function measure(texts, { dict, senses = {} }) {
  const lowerOverrides = new Map(Object.entries(dict.overrides).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  const lowerExtra = new Map(Object.entries(dict.extra || {}).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  const placeIrish = new Set(Object.values(dict.places));
  const senseIrish = new Map();
  for (const [en, e] of Object.entries(senses)) {
    for (const v of Object.values(e)) if (typeof v === "string") {
      if (!senseIrish.has(en)) senseIrish.set(en, new Set());
      senseIrish.get(en).add(v.toLowerCase());
    }
  }
  const verified = (en, ga) => {
    const e = en.toLowerCase().replace(/[-\s]+/g, " ");
    return lowerOverrides.get(e) === ga.toLowerCase() || placeIrish.has(ga) ||
      (senseIrish.get(e)?.has(ga.toLowerCase()) ?? false);
  };
  const fromExtra = (en, ga) => lowerExtra.get(en.toLowerCase().replace(/[-\s]+/g, " ")) === ga.toLowerCase();

  const r = {
    texts: 0, words: 0, markers: 0, zero: 0, zeroWithEligible: 0,
    longest: [], longestEligible: [], overMaxNoEligible: 0,
    sentences6: 0, sentences6Empty: 0,
    tooClose: 0, oneApart: 0, repeats: 0, overCap: 0,
    thirds: [0, 0, 0], verified: 0, extra: 0, knownWrong: 0, knownWrongPairs: new Map(),
    edWords: 0, phrases: 0,
  };
  for (const { text, pct, topic, eligible } of texts) {
    const lim = LIMITS[pct];
    const { markers, words, sentences } = parse(text);
    r.texts++;
    r.words += words;
    r.markers += markers.length;
    if (!markers.length) {
      r.zero++;
      if (eligible && eligible.length) r.zeroWithEligible++;
    }
    const gaps = gapsOf(markers, words);
    r.longest.push(Math.max(...gaps.map(g => g.len)));
    if (eligible) {
      // A gap counts when an eligible unit fits in it with the level's
      // spacing to the markers on either side, and its word has not used up
      // the level's repeat cap in this text.
      const used = new Map();
      for (const m of markers) {
        const k = m.en.toLowerCase().split(/[\s-]+/).join(" ");
        used.set(k, (used.get(k) || 0) + 1);
      }
      const fits = g => eligible.some(([s, e, key]) =>
        s > g.a && e < g.b &&
        (key === undefined || (used.get(key) || 0) < lim.repeatCap) &&
        (g.a < 0 || s - g.a - 1 >= lim.minBetween) &&
        (g.b >= words || g.b - e - 1 >= lim.minBetween));
      const withEl = gaps.filter(fits).map(g => g.len);
      r.longestEligible.push(withEl.length ? Math.max(...withEl) : 0);
      if (gaps.some(g => g.len > lim.maxGap && !fits(g))) r.overMaxNoEligible++;
    }
    // Sentences of 6+ words with no marker.
    let p = 0;
    for (const n of sentences) {
      if (n >= 6) {
        r.sentences6++;
        if (!markers.some(m => m.start >= p && m.start < p + n)) r.sentences6Empty++;
      }
      p += n;
    }
    const seen = new Map();
    markers.forEach((m, i) => {
      if (i > 0) {
        const between = m.start - markers[i - 1].end - 1;
        if (between < lim.minBetween) r.tooClose++;
        if (between === 1) r.oneApart++;
      }
      const key = m.en.toLowerCase();
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) r.repeats++;
      if (n > lim.repeatCap) r.overCap++;
      r.thirds[Math.min(2, Math.floor((3 * m.start) / Math.max(1, words)))]++;
      if (verified(m.en, m.ga)) r.verified++;
      else if (fromExtra(m.en, m.ga)) r.extra++;
      const pair = `${key}|${m.ga.toLowerCase()}`;
      const wrong = KNOWN_WRONG_SET.has(pair) ||
        (DET_VERB_SET.has(pair) && DETERMINERS.has(m.prev.toLowerCase())) ||
        (pair === "pitch|airde" && topic === "sport");
      if (wrong) {
        r.knownWrong++;
        r.knownWrongPairs.set(pair, (r.knownWrongPairs.get(pair) || 0) + 1);
      }
      if (/ed$/i.test(m.en) && !/^(hundred|need|speed|seed|feed|bed|red|shed)$/i.test(m.en)) r.edWords++;
      if (/[\s-]/.test(m.en)) r.phrases++;
    });
  }
  return r;
}

const COUNTY_WORD = /^(county|co|gaa|fm|council|senior|minor|hurling|football|camogie|ladies)$/i;

// Headline figures: no Irish, side by side, name parts (a capitalised word
// marked mid-headline that is not a place).
export function measureHeadlines(items, { dict }) {
  // Places and the dictionary's own name entries (Irish written with a
  // capital, e.g. Comhaontú Aoine an Chéasta) are names on purpose.
  const placeIrish = new Set([...Object.values(dict.places),
    ...Object.entries(dict.overrides).filter(([en, ga]) => /\s/.test(en) && /\p{Lu}/u.test(ga)).map(([, ga]) => ga)]);
  const r = { n: 0, none: 0, noneWithEligible: 0, withEligible: 0, sideBySide: 0, nameParts: 0, nameExamples: [] };
  for (const { titleIr, eligible } of items) {
    r.n++;
    const { markers } = parse(titleIr);
    if (eligible) r.withEligible++;
    if (!markers.length) {
      r.none++;
      if (eligible) r.noneWithEligible++;
    }
    if (markers.some((m, i) => i > 0 && m.start - markers[i - 1].end === 1)) r.sideBySide++;
    for (const m of markers) {
      const plainAfter = titleIr.slice(m.at).replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1").slice(m.en.length);
      const next = (plainAfter.match(/^\s+([\p{L}\p{N}'’]+)/u) || [])[1] || "";
      const atStart = m.start === 0 || /[:?!.–—-]\s*$/.test(titleIr.slice(0, m.at));
      // A capital mid-headline that is not a place; or any capitalised
      // marker (a place too) with a capital after it, which starts a name
      // (Derry City, Man United, World Cup). County words do not count.
      const midName = !atStart && !placeIrish.has(m.ga);
      const nameStart = /^\p{Lu}/u.test(next) && !COUNTY_WORD.test(next);
      if (/^\p{Lu}/u.test(m.en) && (midName || nameStart)) {
        r.nameParts++;
        if (r.nameExamples.length < 12) r.nameExamples.push(`${m.en}=${m.ga}`);
      }
    }
  }
  return r;
}

export const pct1 = (a, b) => (b ? (100 * a / b).toFixed(1) : "0.0");
export { quant };
