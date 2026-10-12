// Word selection and marking. No network and no file access: the dictionary
// comes in as `dict` ({ overrides, places, senses }) and MyMemory comes in as
// `lookup(word)`, so the same code runs in the daily job and in the tests.

export const NEVER_TRANSLATE = new Set([
  "ireland", "irish", "dublin", "cork", "galway", "limerick", "belfast",
  "donegal", "kerry", "mayo", "wicklow", "wexford", "kilkenny", "tipperary",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december",
  "euro", "euros", "rte", "garda", "gardaí", "taoiseach", "tánaiste", "dáil",
  "leinster", "munster", "connacht", "ulster",
]);

// Only skipped at lower levels; at 75%+ these get included
export const FUNCTION_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","has","have","had","will","would",
  "could","should","may","might","this","that","these","those","it","its",
  "he","she","they","we","you","his","her","their","our","my","your",
  "as","by","from","not","no","so","if","than","then","when","which","who",
  "over","into","after","before","about","up","out","also","just","more",
  "there","said","says","very","well","still","even","only","here","now",
]);

export const BAD_MARKERS = [
  "optional", "city name", "probably does not", "file is being downloaded",
  "no translation", "translation not found", "mymemory", "daily quota",
  "contact us", "quota", "abuse", "being downloaded", "does not need",
  "place name", "proper noun", "not need a translation", "probably", "(optional",
  "name (", "untranslated", "leave as", "keep as", "do not translate",
];

export function isGoodTranslation(original, raw) {
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
  // Irish doesn't use j, k, q, w, x, y, z (except in loanwords), so a result
  // with them is likely junk or an untranslated foreign string. (v is left
  // out on purpose: it turns up in loanwords such as veidhlín.)
  if (/[jkqwxyz]/i.test(t)) return false;
  // Irish words must contain at least one vowel (incl. fada vowels)
  if (!/[aeiouáéíóú]/i.test(t)) return false;
  // Reject 5+ consonants in a row (not a valid Irish cluster): catches mangled output
  if (/[bcdfghlmnprst]{5,}/i.test(t)) return false;
  // Rule S4: a prefix or fragment, not a word (barr-, ard-, "réamh -").
  if (/^-|-$|\s-|-\s/.test(t)) return false;
  // Rule S4: a stray quote mark (made -> críochnaitheach”).
  if (/["“”‘’«»]/.test(t)) return false;
  // Rule S4 and G1: an article in front (an chéad, an bhainistíocht, na ...).
  if (/^(an|na)\s/i.test(t)) return false;
  return true;
}

// Match the casing of the original word so MyMemory can't randomly capitalise.
// Handles both "Tuar" (wrong leading cap) and "tRIALACHA" (weird internal caps).
// Irish from the dictionary or an approved sense that has a capital in it is
// a name or written that way on purpose (Mí Eanáir, Gaeilge, Béarla), so it
// is kept exactly as written (rule G4).
export function matchCase(original, translated, { trusted = false } = {}) {
  if (!translated) return translated;
  if (trusted && /\p{Lu}/u.test(translated)) return translated;
  // Original is a normal lowercase word: force the whole translation lowercase,
  // since Irish mid-sentence words are lowercase and any caps here are junk.
  if (/^\p{Ll}/u.test(original)) {
    return translated.toLowerCase();
  }
  // Original starts uppercase (sentence start): lowercase everything after the
  // first letter, then capitalise the first, to fix mixed-case noise.
  return translated.charAt(0).toUpperCase() + translated.slice(1).toLowerCase();
}

export function cleanTranslation(raw) {
  return raw.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim();
}

// ---- Tokens ----

// A word is letters, combining marks and digits in any script, with
// apostrophes allowed inside it (O'Mahony, year's, don't). JavaScript's \w is
// ASCII only, which split Séamus into S, é, amus and marked "amus".
// A trailing apostrophe (workers') or a closing quote stays punctuation.
const TOKEN = /([\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*|[^\p{L}\p{M}\p{N}\s]|\s+)/gu;
const WORD_START = /^[\p{L}\p{M}\p{N}]/u;

export function tokenize(text) {
  return text.match(TOKEN) || [];
}

export function isWordToken(tok) {
  return WORD_START.test(tok);
}

// The next word after token i, skipping spaces; "" if punctuation comes first.
export function nextWord(tokens, i) {
  let j = i + 1;
  while (j < tokens.length && /^\s+$/.test(tokens[j])) j++;
  return j < tokens.length && isWordToken(tokens[j]) ? tokens[j] : "";
}

// The nearest word before token i, across any punctuation; "" at the start.
export function prevWord(tokens, i) {
  for (let j = i - 1; j >= 0; j--) if (isWordToken(tokens[j])) return tokens[j];
  return "";
}

// ---- Places ----

// Place keys that are also ordinary English words. Matching these on a
// lowercase token turns "stepped down" into County Down, so they only count
// when the source text capitalised them as a proper noun.
export const RISKY_PLACE_KEYS = new Set([
  "down", "clare", "bray", "lu", "sord", "laois", "ennis", "naas",
  "meath", "mayo", "trim", "cork", "clones", "athlone", "cobh",
]);

// Words that can follow a county name and still mean the county:
// "Clare County Council", "Clare GAA", "Clare FM".
export const COUNTY_FOLLOWERS = new Set([
  "county", "co", "gaa", "fm", "council", "senior", "minor", "hurling", "football", "camogie", "ladies",
]);

// A couple of place names are something else when a capital follows them:
// "Clare O'Mahony" is a person and "Down Under" is Australia.
export function notAPlaceHere(key, next) {
  if (key === "down" && /^under$/i.test(next)) return true;
  if (key === "clare" && /^\p{Lu}/u.test(next) && !COUNTY_FOLLOWERS.has(next.toLowerCase().replace(/[^a-z]/g, ""))) return true;
  return false;
}

export function placeFor(word, next = "", dict) {
  const key = word.toLowerCase();
  if (dict.places[key] === undefined) return undefined;
  if (RISKY_PLACE_KEYS.has(key) && word[0] !== word[0].toUpperCase()) return undefined;
  if (notAPlaceHere(key, next)) return undefined;
  return dict.places[key];
}

// ---- Senses (rules S1 to S3) ----

export const SPORT_FEEDS = new Set(["sport", "gaa", "soccer", "rugby"]);

// The context processStory passes for a story. topic is "sport" for anything
// from a sport feed or in the sport section, whatever its RSS category said
// (so "Darts", which categories.js once mapped to arts, still reads as sport).
export function storyContext(story = {}) {
  const topic = story.section === "sport" || SPORT_FEEDS.has(story.feed) ? "sport" : story.section;
  return { feed: story.feed, section: story.section, topic };
}

// The approved sense of `key` here: a string (trusted Irish), null ("leave in
// English here") or undefined (no entry applies, fall through). Checked in
// order: the story's feed, its topic, "noun" after a determiner, "default".
export function senseFor(key, ctx = {}, prev = "", dict) {
  const entry = dict.senses?.[key.toLowerCase()];
  if (!entry) return undefined;
  for (const k of [ctx.feed, ctx.topic]) {
    if (k && Object.hasOwn(entry, k)) return entry[k];
  }
  if (Object.hasOwn(entry, "noun") && DETERMINERS.has(prev.toLowerCase())) return entry.noun;
  if (Object.hasOwn(entry, "default")) return entry.default;
  return undefined;
}

// ---- Lookup ----

// Trusted Irish for a word, without MyMemory (rule S2): the place, then the
// approved sense for this story, then overrides. Returns { irish, source }
// with source "place", "sense" or "dict"; { irish: null, source: "sense" }
// when a sense says to leave it in English; undefined when the dictionary
// has nothing.
export function dictionaryFor(word, { next = "", prev = "", ctx = {} } = {}, dict) {
  const place = placeFor(word, next, dict);
  if (place !== undefined) return { irish: place, source: "place" };
  const sense = senseFor(word, ctx, prev, dict);
  if (sense !== undefined) return { irish: sense, source: "sense" };
  const key = word.toLowerCase();
  if (dict.overrides[key] !== undefined) return { irish: dict.overrides[key], source: "dict" };
  return undefined;
}

// Place, sense, overrides, then MyMemory through the injected lookup (which
// owns the cache and the waits). Returns { irish, source }; source "machine"
// for MyMemory. Throws if MyMemory fails.
export async function translateWord(word, next, { dict, lookup }, { prev = "", ctx = {} } = {}) {
  const hit = dictionaryFor(word, { next, prev, ctx }, dict);
  if (hit !== undefined) return hit;
  return { irish: await lookup(word), source: "machine" };
}

// ---- Candidates ----

// Never marked at any level (rules W6).
// The small words of phrasal verbs: "steps down", "set up", "called off".
export const PARTICLES = new Set(["down", "up", "off", "back", "away"]);
// Numbers and ordinals: the Irish changes with the noun that follows (dhá,
// an chéad), so on their own they come out wrong.
export const NUMBER_WORDS = new Set([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty",
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
]);
// Grammar words: taught from Foundation up, not at Beginner (question 8).
export const GRAMMAR_WORDS = new Set([
  "against", "around", "between", "through", "during", "among", "within", "without",
  "while", "whether", "across", "since", "until", "despite", "toward", "towards",
  "almost", "already", "always", "anymore", "together", "per", "shortly",
]);
export const GRAMMAR_WORDS_FROM = 25;
// Possessives: "year's", "country's". Marking them loses the 's.
const POSSESSIVE = /['’]s$/i;

export function shouldTranslate(tok, pct, next = "", dict, { prev = "", ctx = {} } = {}) {
  const lower = tok.toLowerCase();
  if (NEVER_TRANSLATE.has(lower)) return false;
  // A senses null: "leave this word in English here" (rule S3).
  if (senseFor(lower, ctx, prev, dict) === null && placeFor(tok, next, dict) === undefined) return false;
  if (POSSESSIVE.test(tok)) return false;
  if (PARTICLES.has(tok)) return false;            // lowercase only: "Down" can be the county
  if (NUMBER_WORDS.has(lower)) return false;
  if (pct < GRAMMAR_WORDS_FROM && GRAMMAR_WORDS.has(lower)) return false;
  // Place names are proper nouns but we DO want to translate them (from PLACES)
  // when placeFor accepts them here: a capital where the word is risky, and not
  // a person or a phrase ("Clare O'Mahony", "Down Under"). Otherwise the word
  // carries on as an ordinary word, so lowercase "down" no longer reaches
  // MyMemory as a place candidate (rule W11).
  if (placeFor(tok, next, dict) !== undefined) return true;
  if (/^\p{Lu}/u.test(tok)) return false;
  if (/^\p{N}+$/u.test(tok)) return false;
  if (tok.length <= 1) return false;

  // Rule W4: the length limits are for machine words only. Short dictionary
  // nouns (pay, tax, war, man, car, job, law, sea) count at every level.
  const inDictionary = dict.overrides[lower] !== undefined || typeof senseFor(lower, ctx, prev, dict) === "string";
  if (pct <= 25) {
    // Beginner and Foundation: content words only, no short words
    if (FUNCTION_WORDS.has(lower)) return false;
    if (tok.length <= 3 && !inDictionary) return false;
  } else if (pct <= 50) {
    // Intermediate: content words, allow slightly shorter
    if (FUNCTION_WORDS.has(lower)) return false;
    if (tok.length <= 2 && !inDictionary) return false;
  }
  // Advanced (75%) and above: translate everything including function words
  return true;
}

// ---- Ranking (rules W1 to W3, W8, W9, S4) ----

export const DETERMINERS = new Set(["the","a","an","its","their","his","her","this","that","these","those","our","some","any","each","every","no"]);

// Where the Irish may come from at each level (questions 1 and 2):
//   "none"   dictionary only (overrides, places, approved senses)
//   "gap"    machine translation only to close a gap the dictionary cannot
//   "nouns"  machine translation for noun-like words only
//   "normal" machine translation like any other word, after the dictionary
export const MACHINE_AT = { 10: "nouns", 25: "nouns", 50: "normal" };

// Dictionary entries that are verbs. There is no part-of-speech tagger, so
// this list and the Irish endings in isVerbLike stand in for one.
export const DICT_VERBS = new Set([
  "announce", "announced", "broke", "confirmed", "died", "flew", "hurt", "killed", "launched",
  "lost", "missed", "opened", "operated", "publish", "published", "push", "reflects", "return",
  "rises", "runs", "said", "say", "says", "seek out", "show", "shows", "smashed", "spans", "wants",
  "won", "win", "called", "taking", "growing", "scoring", "comes", "means", "made", "take", "set",
]);

// Question 9: root verb forms whose Irish does not match the English form
// (rises éirigh, spans sín, reflects léirigh, return fill). Skipped
// everywhere until Joe changes the entries or approves a sense.
export const SKIP_ROOT_FORMS = true;
export const ROOT_FORMS = new Set(["rises", "spans", "reflects", "return"]);

// Dictionary entries that are adjectives: marked from Foundation, not at
// Beginner, which marks nouns only (rule W1).
export const DICT_ADJECTIVES = new Set([
  "annual", "big", "broken", "closed", "commercial", "critical", "daily", "dangerous", "dead",
  "determined", "digital", "enacted", "free", "good", "guilty", "high", "higher", "historic",
  "homeless", "huge", "illegal", "important", "injured", "innocent", "international", "legal",
  "linked", "local", "low", "national", "new", "official", "old", "open", "political", "private",
  "proposed", "public", "safe", "serious", "significant", "small", "standout", "unwell", "urgent",
  "weekly", "young", "abroad", "almost", "already", "always", "anymore", "shortly", "together",
  "today", "tomorrow", "tonight", "yesterday", "during", "among", "within", "per",
]);

// Words that are both a noun and a verb in English, with noun Irish in the
// dictionary: after "to", a modal or a pronoun they are verbs ("to help",
// "they work"), so the noun Irish would be wrong there (rule W9).
export const NOUN_VERB_WORDS = new Set([
  "help", "work", "support", "increase", "vote", "attack", "appeal", "protest", "display",
  "arrest", "plan", "score", "strike", "study", "trade", "rise", "fund", "grant", "report",
  "rent", "collapse", "debate", "interview", "train", "push", "question", "balance", "award",
  "control", "travel", "change", "need", "use", "move", "face", "end", "call", "hold",
]);
const VERB_CUES = new Set([
  "to", "will", "would", "can", "could", "should", "may", "might", "must", "did", "does", "do",
  "i", "we", "you", "they", "he", "she", "it", "who", "not", "also",
]);

// -ing words that are nouns.
export const KNOWN_NOUN_ING = new Set([
  "building", "meeting", "funding", "housing", "hurling", "training", "spending", "warning",
  "wedding", "evening", "morning", "parking", "clothing", "ceiling", "farming", "fishing",
  "spring", "king", "ring", "thing", "string", "wing", "darling", "offspring", "being",
]);
const ED_NOUNS = new Set(["hundred", "need", "speed", "seed", "feed", "bed", "red", "shed", "greed", "creed", "breed", "deed", "reed", "weed"]);

// Rule S4: words with many meanings never go to machine translation. Their
// one-word MyMemory answer is wrong in news more often than not (season
// biaiste, former eiteán, points ladhróg, case crotal, can canna).
export const NEVER_MACHINE = new Set([
  "season", "side", "record", "end", "home", "current", "time", "minutes", "former", "state",
  "fine", "seat", "draw", "race", "point", "points", "case", "party", "can", "set", "means",
  "comes", "whether", "while", "four", "result", "matter", "course", "couple", "action",
  "position", "security", "resolution", "audience", "retirement", "production", "performance",
  "stage", "industrial", "equity", "date", "pitch", "take", "made", "club", "series", "number",
  "general", "senior", "original", "key", "specialist", "ready", "pre",
]);

const ABSTRACT_ENDINGS = /(tion|sion|ment|ness|ity|ance|ence|ship|hood|ism)$/;
const ADJ_ENDINGS = /(ous|ive|able|ible|ful|less|ish|ise|ize)$/;

// Irish that reads as a verb: d' past, lenited past for an English -ed,
// present endings for an English -s. englishList: false skips DICT_VERBS,
// for an approved sense, whose Irish was chosen for this use ("the show" seó).
export function isVerbLike(en, ga = "", { englishList = true } = {}) {
  const e = en.toLowerCase();
  if (englishList && DICT_VERBS.has(e)) return true;
  if (/^d['’]/.test(ga)) return true;
  if (/ed$/.test(e) && /^(bh|ch|dh|fh|gh|mh|ph|sh|th)/i.test(ga)) return true;
  if (/[^s]s$/.test(e) && !/\s/.test(ga) && /(íonn|aíonn|eann|ann)$/.test(ga) && !/s$/.test(ga)) return true;
  return false;
}

// English that reads as a noun (or a phrase, which counts as one).
export function looksNoun(key) {
  if (/\s/.test(key)) return !DICT_VERBS.has(key);
  if (DICT_VERBS.has(key) || DICT_ADJECTIVES.has(key)) return false;
  if (/ly$/.test(key)) return false;
  if (/ing$/.test(key)) return KNOWN_NOUN_ING.has(key);
  if (/ed$/.test(key)) return ED_NOUNS.has(key);
  if (ADJ_ENDINGS.test(key)) return false;
  return true;
}

// Tier and score for one unit, or null when it must not be marked here.
//   tier 3: dictionary, sense or place, and noun-like
//   tier 2: dictionary, other
//   tier 1: machine, noun-like
//   tier 0: machine, other
// Within a tier: +3 after a determiner, +1 plural, +1 for a plain (not
// abstract) noun, -4 for -ly, -ing or -ed.
export function rankUnit(unit, tokens, pct, dict, ctx = {}) {
  const key = unit.key;
  const prev = prevWord(tokens, unit.i).toLowerCase();
  const next = nextWord(tokens, unit.j);
  const afterDet = DETERMINERS.has(prev);
  const verbCue = VERB_CUES.has(prev);
  const hit = unit.phrase ? { irish: unit.irish, source: unit.source } : dictionaryFor(unit.text, { next, prev, ctx }, dict);
  let tier, verb;
  if (hit) {
    if (hit.irish === null) return null;
    verb = hit.source !== "place" && isVerbLike(key, hit.irish, { englishList: hit.source === "dict" });
    if (SKIP_ROOT_FORMS && hit.source === "dict" && ROOT_FORMS.has(key)) return null;   // question 9
    if (verb && afterDet) return null;                                                // W9: "the show"
    if (!verb && hit.source === "dict" && verbCue && NOUN_VERB_WORDS.has(key)) return null; // "to help"
    tier = hit.source === "place" || (!verb && (looksNoun(key) || (hit.source === "sense" && afterDet))) ? 3 : 2;
  } else {
    if (NEVER_MACHINE.has(key)) return null;                                          // S4
    if (MACHINE_AT[pct] === "none") return null;                                      // question 1
    verb = DICT_VERBS.has(key) || (verbCue && !afterDet);
    tier = !verb && (afterDet || looksNoun(key)) ? 1 : 0;
    if (MACHINE_AT[pct] !== "normal" && tier < 1) return null;                        // question 2
  }
  let score = 0;
  if (unit.phrase) score += 3;          // a whole dictionary phrase is prime vocabulary (W5)
  if (afterDet) score += 3;
  if (/[^s]s$/.test(key) && !/(ss|us|is)$/.test(key)) score += 1;
  if (!ABSTRACT_ENDINGS.test(key)) score += 1;
  if (!unit.phrase && (/ly$/.test(key) || (/ing$/.test(key) && !KNOWN_NOUN_ING.has(key)) || (/ed$/.test(key) && !ED_NOUNS.has(key)))) score -= 4;
  return { tier, score, hit, verb, afterDet };
}

// Tiers each level may use (the table in rule section 1). Tier 1 at
// Foundation is gap repair only.
export function tierAllowed(tier, pct, { gapRepair = false } = {}) {
  if (tier >= 3) return true;
  if (tier === 2) return pct >= 25;
  if (MACHINE_AT[pct] === "normal") return true;
  if (MACHINE_AT[pct] === "nouns") return tier === 1;
  if (MACHINE_AT[pct] === "gap") return tier === 1 && gapRepair;
  return false;
}

// ---- Phrases (rule W5) ----

// Multi-word keys of the dictionary (overrides and places; senses later),
// indexed by their first word, longest first. Keys match case-insensitively
// across single spaces or hyphens, so "cost of living", "Cost of Living" and
// "year-on-year" all find their entry.
const PHRASE_INDEX = new WeakMap();
const splitKey = key => key.toLowerCase().split(/[\s-]+/).filter(Boolean);

export function phraseIndex(dict) {
  let idx = PHRASE_INDEX.get(dict);
  if (idx) return idx;
  idx = new Map();
  const keys = new Set([
    ...Object.keys(dict.senses || {}), ...Object.keys(dict.overrides), ...Object.keys(dict.places),
  ]);
  for (const key of keys) {
    const words = splitKey(key);
    if (words.length < 2) continue;
    if (!idx.has(words[0])) idx.set(words[0], []);
    idx.get(words[0]).push({ key, words });
  }
  for (const list of idx.values()) list.sort((a, b) => b.words.length - a.words.length);
  PHRASE_INDEX.set(dict, idx);
  return idx;
}

// The last token index of `entry` when it starts at token i, else -1.
function matchPhraseAt(tokens, i, entry) {
  let k = i;
  for (let w = 1; w < entry.words.length; w++) {
    const sep = tokens[k + 1], word = tokens[k + 2];
    if (sep !== " " && sep !== "-") return -1;
    if (!word || word.toLowerCase() !== entry.words[w]) return -1;
    k += 2;
  }
  return k;
}

// True when token i opens a sentence (or the text), so a capital there is
// not a sign of a name.
export function atSentenceStart(tokens, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (/^\s+$/.test(tokens[j])) continue;
    return /^[.!?:"“‘(\[]$/.test(tokens[j]);
  }
  return true;
}

// Teams on a sports page are not the town: "Cork City", "Galway United FC".
const CLUB_NEXT = /^(fc|afc|united|rovers|rangers|celtic|athletic|wanderers)$/i;

// Dictionary phrases in the text, left to right, longest match first, never
// overlapping. Each is { i, j, text, key, irish, source } where i..j are the
// token indices it covers; `irish === null` means "leave these words in
// English" (a senses null).
//   body: true for story text, where NEVER_TRANSLATE place words stay
//   English as before (question 5); false for headlines.
export function findPhrases(tokens, dict, ctx = {}, { body = true } = {}) {
  const idx = phraseIndex(dict);
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isWordToken(tokens[i])) continue;
    const list = idx.get(tokens[i].toLowerCase());
    if (!list) continue;
    for (const entry of list) {
      const j = matchPhraseAt(tokens, i, entry);
      if (j < 0) continue;
      const text = tokens.slice(i, j + 1).join("");
      const next = nextWord(tokens, j);
      const prev = prevWord(tokens, i);
      const hit = phraseIrish(entry.key, { ctx, prev, next, body, dict });
      if (hit === undefined) continue;
      // A capital inside the phrase, or at its start mid-sentence, means a
      // name ("Mental Health Ireland") unless the entry itself is a name.
      const caps = tokens.slice(i, j + 1).filter((t, n) => isWordToken(t) && /^\p{Lu}/u.test(t) && !(n === 0 && atSentenceStart(tokens, i)));
      if (hit.irish && caps.length && hit.source !== "place" && !/\p{Lu}/u.test(hit.irish)) continue;
      found.push({ i, j, text, key: entry.words.join(" "), ...hit });
      i = j;
      break;
    }
  }
  return found;
}

// Irish for a phrase key: place, then approved sense, then overrides.
// undefined when it should not be used here.
function phraseIrish(key, { ctx, prev, next, body, dict }) {
  const lower = key.toLowerCase();
  if (dict.places[lower] !== undefined) {
    const first = splitKey(lower)[0];
    const clubOrName = ctx.topic === "sport" || CLUB_NEXT.test(next) || /^\p{Lu}/u.test(next);
    if (!clubOrName && !(body && NEVER_TRANSLATE.has(first))) return { irish: dict.places[lower], source: "place" };
  }
  const sense = senseFor(lower, ctx, prev, dict);
  if (sense !== undefined) return { irish: sense, source: "sense" };
  if (dict.overrides[lower] !== undefined) return { irish: dict.overrides[lower], source: "dict" };
  return undefined;
}

// ---- Units ----

// Everything that could carry a marker in this text at this level: the
// dictionary phrases plus every single word that passes shouldTranslate and
// is not inside a phrase. Sorted by position. Each unit:
//   { i, j, text, key, phrase, irish?, source?, start, end }
// where start..end are word positions (a phrase spans several).
export function candidateUnits(tokens, pct, dict, ctx = {}) {
  const wordPos = new Map();
  let n = 0;
  tokens.forEach((tok, i) => { if (isWordToken(tok)) wordPos.set(i, n++); });

  const phrases = findPhrases(tokens, dict, ctx);
  const covered = new Set();
  for (const p of phrases) for (let k = p.i; k <= p.j; k++) covered.add(k);

  const units = [];
  for (const p of phrases) {
    if (p.irish === null) continue;
    units.push({ ...p, phrase: true, start: wordPos.get(p.i), end: wordPos.get(p.j) });
  }
  tokens.forEach((tok, i) => {
    if (!isWordToken(tok) || covered.has(i)) return;
    if (!shouldTranslate(tok, pct, nextWord(tokens, i), dict, { prev: prevWord(tokens, i), ctx })) return;
    units.push({ i, j: i, text: tok, key: tok.toLowerCase(), phrase: false, start: wordPos.get(i), end: wordPos.get(i) });
  });
  return units.sort((a, b) => a.i - b.i);
}

// Choose which units get marked: highest tier first, then score, and never
// two units side by side.
export function selectMarkerIndices(tokens, units, targetCount, pct, dict, ctx = {}) {
  const ranked = [];
  for (const u of units) {
    const r = rankUnit(u, tokens, pct, dict, ctx);
    if (!r || !tierAllowed(r.tier, pct)) continue;
    if (r.tier <= 1 && r.score < 0) continue;                                 // clearly not a noun
    ranked.push({ ...u, ...r });
  }
  ranked.sort((a, b) => b.tier - a.tier || b.score - a.score || a.start - b.start);

  const chosen = [];
  for (const c of ranked) {
    if (chosen.length >= targetCount) break;
    if (chosen.some(p => c.start - p.end < 2 && p.start - c.end < 2)) continue; // no side-by-side markers
    chosen.push(c);
  }
  return chosen;
}

// ---- Levels ----

// The marker text for a unit, or null when its Irish is not acceptable.
// Dictionary, place and sense Irish is trusted; machine Irish must pass
// isGoodTranslation and, after a determiner, must not read as a verb (W9).
export async function irishFor(unit, tokens, deps, ctx = {}) {
  const { onRejected } = deps;
  let hit = unit.hit;
  if (!hit) {
    let irish;
    try {
      irish = await deps.lookup(unit.text);
    } catch {
      return null;
    }
    const ok = isGoodTranslation(unit.text, irish) &&
      !(unit.afterDet && isVerbLike(unit.key, cleanTranslation(irish)));
    if (!ok) {
      if (onRejected) onRejected(unit.text, irish);
      return null;
    }
    hit = { irish, source: "machine" };
  }
  if (hit.source === "place") return `[[${hit.irish}|${unit.text}]]`;
  const irish = matchCase(unit.text, cleanTranslation(hit.irish), { trusted: hit.source !== "machine" });
  return `[[${irish}|${unit.text}]]`;
}

// Mark about pct% of the candidate units in `text` as [[irish|english]].
// deps: { dict, lookup, onRejected? }. onRejected(word, irish) is told about
// machine results that fail isGoodTranslation, for the run counters.
export async function buildLevel(text, pct, deps, { ctx = {} } = {}) {
  const { dict } = deps;
  const tokens = tokenize(text);
  const units = candidateUnits(tokens, pct, dict, ctx);
  const targetCount = Math.ceil(units.length * (pct / 100));
  const chosen = selectMarkerIndices(tokens, units, targetCount, pct, dict, ctx);

  const marked = new Map();
  for (const u of chosen) {
    const m = await irishFor(u, tokens, deps, ctx);
    if (m) marked.set(u.i, { u, m });
  }
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const hit = marked.get(i);
    if (!hit) {
      result.push(tokens[i]);
      continue;
    }
    result.push(hit.m);
    i = hit.u.j;
  }
  return result.join("");
}

// ---- Headlines ----

// Mark up to 3 headline words with Irish, using ONLY the verified dictionaries
// (overrides + places), never MyMemory, so the most visible text is always right.
export function markHeadline(title, dict) {
  const tokens = title.split(/(\s+)/);
  const candidates = [];
  tokens.forEach((tok, i) => {
    const clean = tok.replace(/[^A-Za-zÀ-ÿ'’]/g, "");
    if (!clean) return;
    const lower = clean.toLowerCase();
    // placeFor applies the same capital-letter check as the summaries, so
    // "steps down" stays English while "Down win Ulster title" is the county.
    const place = placeFor(clean, (tokens[i + 2] || "").replace(/[^A-Za-zÀ-ÿ'’]/g, ""), dict);
    if (place !== undefined) {
      candidates.push({ i, clean, irish: place, place: true });
    } else if (dict.overrides[lower] !== undefined && clean.length >= 4) {
      let irish = dict.overrides[lower];
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

// ---- Story ----

// Levels actually generated. 75 (Advanced) and 100 (As Gaeilge) are locked
// funding goals in the app: the sentence-alignment approach isn't reliable
// enough to ship, so we don't generate them at all.
export const LEVELS = [10, 25, 50];

// Everything processStory marks for one story: the article levels, the
// summary levels for the iOS app and the headline. Shared with the archive
// replay so the tests run exactly this path.
//   story: { title, text, rss, ctx }
//   deps:  { dict, lookup, onRejected? }
//   opts:  { pause?() between article levels, log?(msg), warn?(msg) }
export async function markStory({ title, text, rss, ctx }, deps, { pause, log, warn } = {}) {
  const levels = {};
  for (const pct of LEVELS) {
    if (log) log(`  Generating ${pct}% level...`);
    try {
      levels[pct] = await buildLevel(text, pct, deps, { ctx });
    } catch (err) {
      if (warn) warn(`  Failed level ${pct}: ${err.message}`);
      levels[pct] = text;
    }
    if (pause) await pause();
  }

  // Summary-only levels for the iOS app. Run after the full levels so the
  // translation cache is already warm: nearly every word in the summary has
  // just been looked up, so this costs almost no extra MyMemory calls.
  const summaryLevels = {};
  for (const pct of LEVELS) {
    try {
      summaryLevels[pct] = await buildLevel(rss, pct, deps, { ctx });
    } catch (err) {
      if (warn) warn(`  Failed summary level ${pct}: ${err.message}`);
      summaryLevels[pct] = rss;
    }
  }

  // Headline with up to three verified words marked (overrides and places
  // only, never MyMemory), so the app can make headline words tappable.
  const titleIr = markHeadline(title, deps.dict, ctx);
  return { levels, summaryLevels, titleIr };
}
