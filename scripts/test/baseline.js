// FROZEN copy of the word selection in scripts/generate.js at commit 29cdae8
// (2026-10-12), before it moved into scripts/lib. The replay test compares
// the live code against this file. Do not edit it to follow later changes:
// it is the "before" side of every comparison.
//
// Copied line for line from generate.js 40-67, 83-112, 122-138, 175-370 and
// 466-492. The only edits:
//   - overrides.json and places.json are read from this file's location,
//     and the load messages are not printed;
//   - sleep can be swapped (setSleep) so tests do not wait;
//   - the pct >= 75 branch of buildLevel (never reached) is removed;
//   - exports at the end.
import { readFileSync } from "fs";

let sleep = ms => new Promise(r => setTimeout(r, ms));
export function setSleep(fn) { sleep = fn; }

const NEVER_TRANSLATE = new Set([
  "ireland", "irish", "dublin", "cork", "galway", "limerick", "belfast",
  "donegal", "kerry", "mayo", "wicklow", "wexford", "kilkenny", "tipperary",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december",
  "euro", "euros", "rte", "garda", "gardaí", "taoiseach", "tánaiste", "dáil",
  "leinster", "munster", "connacht", "ulster",
]);

// Only skipped at lower levels — at 75%+ these get included
const FUNCTION_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","has","have","had","will","would",
  "could","should","may","might","this","that","these","those","it","its",
  "he","she","they","we","you","his","her","their","our","my","your",
  "as","by","from","not","no","so","if","than","then","when","which","who",
  "over","into","after","before","about","up","out","also","just","more",
  "there","said","says","very","well","still","even","only","here","now",
]);

const BAD_MARKERS = [
  "optional", "city name", "probably does not", "file is being downloaded",
  "no translation", "translation not found", "mymemory", "daily quota",
  "contact us", "quota", "abuse", "being downloaded", "does not need",
  "place name", "proper noun", "not need a translation", "probably", "(optional",
  "name (", "untranslated", "leave as", "keep as", "do not translate",
];

function isGoodTranslation(original, raw) {
  if (!raw) return false;
  const t = raw.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim();
  if (!t) return false;
  if (t.toLowerCase() === original.toLowerCase()) return false;
  if (/[\n\r\t]/.test(t)) return false;
  if (/[\[\](){}]/.test(t)) return false;
  const tl = t.toLowerCase();
  if (BAD_MARKERS.some(m => tl.includes(m))) return false;
  // Reject any parenthetical note, e.g. "ard mhacha (optional...)"
  if (/[()]/.test(t)) return false;
  // A single source word should map to at most 2 Irish words; note-blobs are long
  if (t.trim().split(/\s+/).length > 2) return false;
  if (t.length > original.length * 5) return false;
  if (/\d/.test(t) && !/\d/.test(original)) return false;
  if (/[_/\\@#$%^&*=+|<>]/.test(t)) return false;
  if (tl.includes("http") || tl.includes("www")) return false;
  // Reject suspiciously short results: a 1-2 char translation for a real word
  // is almost always junk (e.g. "south" -> "D")
  if (original.length >= 4 && t.replace(/[.,;:!?]/g, "").length <= 2) return false;
  // Reject words with letters/combinations that don't occur in standard Irish.
  // Irish doesn't use j, k, q, v, w, x, y, z (except in loanwords), so a result
  // full of them is likely junk or an untranslated foreign string.
  if (/[jkqwxyz]/i.test(t)) return false;
  // Irish words must contain at least one vowel (incl. fada vowels)
  if (!/[aeiouáéíóú]/i.test(t)) return false;
  // Reject 4+ consonants in a row (not a valid Irish cluster) — catches mangled output
  if (/[bcdfghlmnprst]{5,}/i.test(t)) return false;
  return true;
}

// Match the casing of the original word so MyMemory can't randomly capitalise.
// Handles both "Tuar" (wrong leading cap) and "tRIALACHA" (weird internal caps).
function matchCase(original, translated) {
  if (!translated) return translated;
  // Original is a normal lowercase word: force the whole translation lowercase,
  // since Irish mid-sentence words are lowercase and any caps here are junk.
  if (/^[a-z]/.test(original)) {
    return translated.toLowerCase();
  }
  // Original starts uppercase (sentence start): lowercase everything after the
  // first letter, then capitalise the first, to fix mixed-case noise.
  return translated.charAt(0).toUpperCase() + translated.slice(1).toLowerCase();
}

function cleanTranslation(raw) {
  return raw.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim();
}

// Curated overrides: english (lowercase) -> trusted Irish. Checked before MyMemory.
// Grows over time as corrections are made — every fix here is permanent.
let OVERRIDES = {};
try {
  OVERRIDES = JSON.parse(readFileSync(new URL("../overrides.json", import.meta.url), "utf-8"));
} catch {
}

// Verified Irish place names (english lowercase -> properly-capitalised Irish).
// These are translated even though they're proper nouns, and keep their capitals.
let PLACES = {};
try {
  PLACES = JSON.parse(readFileSync(new URL("../places.json", import.meta.url), "utf-8"));
} catch {
}

async function translate(word) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ga&de=joelucadooley@gmail.com`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(`Translation failed: ${data.responseStatus}`);
}

const translationCache = {};

// Place keys that are also ordinary English words. Matching these on a
// lowercase token turns "stepped down" into County Down, so they only count
// when the source text capitalised them as a proper noun.
const RISKY_PLACE_KEYS = new Set([
  "down", "clare", "bray", "lu", "sord", "laois", "ennis", "naas",
  "meath", "mayo", "trim", "cork", "clones", "athlone", "cobh",
]);

// Words that can follow a county name and still mean the county:
// "Clare County Council", "Clare GAA", "Clare FM".
const COUNTY_FOLLOWERS = new Set([
  "county", "co", "gaa", "fm", "council", "senior", "minor", "hurling", "football", "camogie", "ladies",
]);

// A couple of place names are something else when a capital follows them:
// "Clare O'Mahony" is a person and "Down Under" is Australia.
function notAPlaceHere(key, next) {
  if (key === "down" && /^under$/i.test(next)) return true;
  if (key === "clare" && /^[A-Z]/.test(next) && !COUNTY_FOLLOWERS.has(next.toLowerCase().replace(/[^a-z]/g, ""))) return true;
  return false;
}

// The next word after token i, skipping spaces; "" if punctuation comes first.
function nextWord(tokens, i) {
  let j = i + 1;
  while (j < tokens.length && /^\s+$/.test(tokens[j])) j++;
  return j < tokens.length && /^\w/.test(tokens[j]) ? tokens[j] : "";
}

function placeFor(word, next = "") {
  const key = word.toLowerCase();
  if (PLACES[key] === undefined) return undefined;
  if (RISKY_PLACE_KEYS.has(key) && word[0] !== word[0].toUpperCase()) return undefined;
  if (notAPlaceHere(key, next)) return undefined;
  return PLACES[key];
}

async function translateCached(word, next = "") {
  const key = word.toLowerCase();
  // Verified place names win first, with their proper capitalisation
  const place = placeFor(word, next);
  if (place !== undefined) return place;
  // Curated overrides win over MyMemory
  if (OVERRIDES[key] !== undefined) return OVERRIDES[key];
  if (translationCache[key] !== undefined) return translationCache[key];
  await sleep(250);
  const result = await translate(word);
  translationCache[key] = result;
  return result;
}

function shouldTranslate(tok, pct, next = "") {
  const lower = tok.toLowerCase();
  if (NEVER_TRANSLATE.has(lower)) return false;
  // Place names are proper nouns but we DO want to translate them (from PLACES),
  // unless this one is a person or a phrase ("Clare O'Mahony", "Down Under")
  if (PLACES[lower] !== undefined) return !notAPlaceHere(lower, next);
  if (/^[A-Z]/.test(tok)) return false;
  if (/^\d+$/.test(tok)) return false;
  if (tok.length <= 1) return false;

  if (pct <= 25) {
    // Beginner and Foundation: content words only, no short words
    if (FUNCTION_WORDS.has(lower)) return false;
    if (tok.length <= 3) return false;
  } else if (pct <= 50) {
    // Intermediate: content words, allow slightly shorter
    if (FUNCTION_WORDS.has(lower)) return false;
    if (tok.length <= 2) return false;
  }
  // Advanced (75%) and above: translate everything including function words
  return true;
}

// Words that read as nouns often enough to be worth marking, and endings that
// give a word away as a verb or adverb. There is no part-of-speech tagger here,
// so this is a heuristic, but it is a great deal better than picking by
// position, which is what this used to do.
const NOUN_ENDINGS = [/tion$/, /sion$/, /ment$/, /ness$/, /ity$/, /ance$/, /ence$/, /ship$/, /hood$/, /ism$/, /ist$/, /age$/, /ure$/];
const NOT_NOUN_ENDINGS = [/ly$/, /ing$/, /ed$/, /ise$/, /ize$/, /ful$/, /ous$/, /ive$/, /able$/, /ible$/];
const DETERMINERS = new Set(["the","a","an","its","their","his","her","this","that","these","those","our","some","any","each","every","no"]);

function nounScore(tok, prevWord) {
  const w = tok.toLowerCase();
  let score = 0;
  if (OVERRIDES[w] !== undefined) score += 4;        // curated vocabulary, already trusted
  if (PLACES[w] !== undefined) score += 3;
  if (DETERMINERS.has((prevWord || "").toLowerCase())) score += 3;  // "the depot", "a warehouse"
  if (NOUN_ENDINGS.some(re => re.test(w))) score += 3;
  if (NOT_NOUN_ENDINGS.some(re => re.test(w))) score -= 4;
  if (/[^s]s$/.test(w) && !/(ss|us|is)$/.test(w)) score += 1;       // plurals read as nouns
  if (w.length >= 6) score += 1;
  return score;
}

// Choose which words get marked. Two rules that the old even-spacing version
// had no way to express: prefer whole nouns, and never mark two words that sit
// side by side, so a reader always gets a standalone word rather than a
// fragment of a phrase.
function selectMarkerIndices(tokens, candidates, targetCount) {
  // Position of each candidate in the sequence of words, so "adjacent" means
  // adjacent words rather than adjacent tokens, which include whitespace.
  const wordPos = new Map();
  let n = 0;
  tokens.forEach((tok, i) => { if (/^\w/.test(tok)) wordPos.set(i, n++); });

  const prevWordOf = i => {
    for (let j = i - 1; j >= 0; j--) if (/^\w/.test(tokens[j])) return tokens[j];
    return "";
  };

  const scored = candidates
    .map(c => ({ ...c, score: nounScore(c.tok, prevWordOf(c.i)), pos: wordPos.get(c.i) }))
    .sort((a, b) => b.score - a.score || a.pos - b.pos);

  const chosen = [];
  for (const c of scored) {
    if (chosen.length >= targetCount) break;
    if (c.score < 0) continue;                                       // clearly not a noun
    if (chosen.some(p => Math.abs(p.pos - c.pos) < 2)) continue;     // no side-by-side markers
    chosen.push(c);
  }
  return new Set(chosen.map(c => c.i));
}

async function buildLevel(sentence, pct) {

  const tokens = sentence.match(/(\w[\w']*|[^\w\s]|\s+)/g) || [];

  const candidates = tokens
    .map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))
    .filter(({ tok, i, isWord }) => isWord && shouldTranslate(tok, pct, nextWord(tokens, i)));

  const targetCount = Math.ceil(candidates.length * (pct / 100));
  const toTranslateIndices = selectMarkerIndices(tokens, candidates, targetCount);

  const result = [];
  for (const { tok, i, isWord } of tokens.map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))) {
    if (isWord && toTranslateIndices.has(i)) {
      try {
        const next = nextWord(tokens, i);
        const irish = await translateCached(tok, next);
        const lower = tok.toLowerCase();
        const isPlace = placeFor(tok, next) !== undefined;
        const isOverride = OVERRIDES[lower] !== undefined;
        if (isPlace) {
          // Keep proper capitalisation, don't run matchCase
          result.push(`[[${irish}|${tok}]]`);
        } else if (isOverride || isGoodTranslation(tok, irish)) {
          result.push(`[[${matchCase(tok, cleanTranslation(irish))}|${tok}]]`);
        } else {
          result.push(tok);
        }
      } catch {
        result.push(tok);
      }
    } else {
      result.push(tok);
    }
  }
  return result.join("");
}

// Mark up to 3 headline words with Irish, using ONLY the verified dictionaries
// (overrides + places), never MyMemory, so the most visible text is always right.
function markHeadline(title) {
  const tokens = title.split(/(\s+)/);
  const candidates = [];
  tokens.forEach((tok, i) => {
    const clean = tok.replace(/[^A-Za-zÀ-ÿ'’]/g, "");
    if (!clean) return;
    const lower = clean.toLowerCase();
    // placeFor applies the same capital-letter check as the summaries, so
    // "steps down" stays English while "Down win Ulster title" is the county.
    const place = placeFor(clean, (tokens[i + 2] || "").replace(/[^A-Za-zÀ-ÿ'’]/g, ""));
    if (place !== undefined) {
      candidates.push({ i, clean, irish: place, place: true });
    } else if (OVERRIDES[lower] !== undefined && clean.length >= 4) {
      let irish = OVERRIDES[lower];
      if (/^[A-Z]/.test(clean)) irish = irish.charAt(0).toUpperCase() + irish.slice(1);
      candidates.push({ i, clean, irish, place: false });
    }
  });
  // Prefer place names, then longer words; cap at 3 so it stays readable
  candidates.sort((a, b) => (b.place ? 1 : 0) - (a.place ? 1 : 0) || b.clean.length - a.clean.length);
  for (const c of candidates.slice(0, 3)) {
    tokens[c.i] = tokens[c.i].replace(c.clean, `[[${c.irish}|${c.clean}]]`);
  }
  return tokens.join("");
}

function clearCache() {
  for (const k of Object.keys(translationCache)) delete translationCache[k];
}

export {
  NEVER_TRANSLATE, FUNCTION_WORDS, BAD_MARKERS,
  isGoodTranslation, matchCase, cleanTranslation,
  OVERRIDES, PLACES, translationCache, clearCache,
  nextWord, placeFor, translateCached, shouldTranslate, nounScore,
  selectMarkerIndices, buildLevel, markHeadline,
};
