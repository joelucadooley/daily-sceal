import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";
import {
  activeFeeds, feedUrl, FETCH_PER_FEED,
  isUsable, dedupe, balance,
} from "./feeds.js";
import { catInfo } from "./categories.js";
// Levels actually generated. 75 (Advanced) and 100 (As Gaeilge) are locked
// funding goals in the app — the sentence-alignment approach isn't reliable
// enough to ship, so we don't generate them at all.
const LEVELS = [10, 25, 50];
// Stories actually processed. Every one of these costs a page scrape plus
// three levels of MyMemory calls, so this is the expensive number. Feeds are
// read far more widely than this and then filtered down to it.
//
// Raised from 20 to fill the section tabs on the site. The homepage only shows
// HOMEPAGE_COUNT of these; the rest live under their section. At ~50 lookups
// per story this is still well inside MyMemory's daily allowance.
const STORY_COUNT = 30;
// Below this, something is wrong upstream (feeds down, RTÉ layout change,
// MyMemory quota) and publishing would replace a good day with a broken one.
// Failing loudly leaves yesterday's today.json in place, which is the better
// outcome, and the workflow raises an issue so it does not pass unnoticed.
const MIN_STORIES = 8;

const CAT_MAP = {
  ireland: "Éire", sport: "Spórt", politics: "Polaitíocht",
  business: "Gnó", entertainment: "Siamsaíocht", world: "Domhan",
  health: "Sláinte", science: "Eolaíocht", technology: "Teicneolaíocht",
  culture: "Cultúr", weather: "Aimsir", travel: "Taisteal",
  dublin: "Baile Átha Cliath", hurling: "Iomáint", football: "Peil",
};

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

function getIrCat(c) {
  if (!c) return "Nuacht";
  const l = c.toLowerCase();
  for (const [k, v] of Object.entries(CAT_MAP)) if (l.includes(k)) return v;
  return "Nuacht";
}

function msAgo(d) {
  const m = Math.floor((Date.now() - d) / 60000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// A small set of common real Irish words we trust outright (helps avoid
// over-rejecting good short words). Not exhaustive — just a safety net.
const KNOWN_GOOD = new Set([
  "rialtas","tithíocht","cíosanna","teach","tithe","scéal","nuacht","lá",
  "bliain","blianta","tír","domhan","airgead","obair","duine","daoine",
  "rud","áit","cúirt","dlí","sláinte","scoil","oideachas","aimsir","báisteach",
]);

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

async function scrapeArticle(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DailySceal/1.0)" }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const paragraphs = [];
    const pRegex = /<p[^>]*>(.*?)<\/p>/gs;
    let match;
    while ((match = pRegex.exec(html)) !== null) {
      const text = match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "")
        .trim();
      if (text.length > 60 && !text.includes("RTÉ") && !text.includes("cookie") && !text.includes("javascript")) {
        paragraphs.push(text);
      }
    }
    const article = paragraphs.slice(0, 4).join(" ");
    return article.length > 100 ? article : null;
  } catch (e) {
    console.warn(`  Could not scrape ${url}: ${e.message}`);
    return null;
  }
}

// Curated overrides: english (lowercase) -> trusted Irish. Checked before MyMemory.
// Grows over time as corrections are made — every fix here is permanent.
let OVERRIDES = {};
try {
  OVERRIDES = JSON.parse(readFileSync("scripts/overrides.json", "utf-8"));
  console.log(`Loaded ${Object.keys(OVERRIDES).length} translation overrides`);
} catch {
  console.log("No overrides file found, continuing without");
}

// Verified Irish place names (english lowercase -> properly-capitalised Irish).
// These are translated even though they're proper nouns, and keep their capitals.
let PLACES = {};
try {
  PLACES = JSON.parse(readFileSync("scripts/places.json", "utf-8"));
  console.log(`Loaded ${Object.keys(PLACES).length} place names`);
} catch {
  console.log("No places file found, continuing without");
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

function placeFor(word) {
  const key = word.toLowerCase();
  if (PLACES[key] === undefined) return undefined;
  if (RISKY_PLACE_KEYS.has(key) && word[0] !== word[0].toUpperCase()) return undefined;
  return PLACES[key];
}

async function translateCached(word) {
  const key = word.toLowerCase();
  // Verified place names win first, with their proper capitalisation
  const place = placeFor(word);
  if (place !== undefined) return place;
  // Curated overrides win over MyMemory
  if (OVERRIDES[key] !== undefined) return OVERRIDES[key];
  if (translationCache[key] !== undefined) return translationCache[key];
  await sleep(250);
  const result = await translate(word);
  translationCache[key] = result;
  return result;
}

function shouldTranslate(tok, pct) {
  const lower = tok.toLowerCase();
  if (NEVER_TRANSLATE.has(lower)) return false;
  // Place names are proper nouns but we DO want to translate them (from PLACES)
  if (PLACES[lower] !== undefined) return true;
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

async function buildLevel(sentence, pct) {
  // For Advanced (75%), translate the whole sentence at once for much better Irish density
  if (pct >= 75) {
    return await buildAdvancedLevel(sentence);
  }

  const tokens = sentence.match(/(\w[\w']*|[^\w\s]|\s+)/g) || [];

  const candidates = tokens
    .map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))
    .filter(({ tok, isWord }) => isWord && shouldTranslate(tok, pct));

  const targetCount = Math.ceil(candidates.length * (pct / 100));
  const step = candidates.length / Math.max(targetCount, 1);
  const toTranslateIndices = new Set(
    Array.from({ length: targetCount }, (_, k) =>
      candidates[Math.min(Math.round(k * step), candidates.length - 1)]?.i
    ).filter(i => i !== undefined)
  );

  const result = [];
  for (const { tok, i, isWord } of tokens.map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))) {
    if (isWord && toTranslateIndices.has(i)) {
      try {
        const irish = await translateCached(tok);
        const lower = tok.toLowerCase();
        const isPlace = placeFor(tok) !== undefined;
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

// Translate a full sentence to Irish, then pair each translated word with its English source
async function buildAdvancedLevel(sentence) {
  try {
    // Split into manageable chunks at sentence boundaries
    const chunks = sentence.match(/[^.!?]+[.!?]*/g) || [sentence];
    const resultParts = [];

    for (const chunk of chunks) {
      await sleep(400);
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk.trim())}&langpair=en|ga`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (data.responseStatus !== 200) {
        resultParts.push(chunk);
        continue;
      }

      const irishSentence = data.responseData.translatedText;

      // Check it's actually Irish and not garbage
      if (!irishSentence || irishSentence.toLowerCase() === chunk.toLowerCase()) {
        resultParts.push(chunk);
        continue;
      }

      // Align English words with Irish words to create [[irish|english]] pairs
      const englishWords = chunk.trim().split(/\s+/);
      const irishWords = irishSentence.trim().split(/\s+/);

      // If word counts are similar, pair them up
      if (irishWords.length >= englishWords.length * 0.6 && irishWords.length <= englishWords.length * 1.8) {
        const paired = [];
        const maxLen = Math.max(englishWords.length, irishWords.length);
        for (let i = 0; i < englishWords.length; i++) {
          const eng = englishWords[i];
          const ire = irishWords[i];
          // Keep proper nouns, numbers, punctuation-only tokens in English
          if (!ire || /^[A-Z]/.test(eng) || /^\d/.test(eng) || !/\w/.test(eng)) {
            paired.push(eng);
          } else {
            const cleanEng = eng.replace(/[.,;:!?"]/g, "");
            const cleanIre = ire.replace(/[.,;:!?"]/g, "");
            const punct = eng.match(/[.,;:!?"]+$/)?.[0] || "";
            if (cleanIre && cleanIre.toLowerCase() !== cleanEng.toLowerCase()) {
              paired.push(`[[${matchCase(cleanEng, cleanIre)}|${cleanEng}]]${punct}`);
            } else {
              paired.push(eng);
            }
          }
        }
        resultParts.push(paired.join(" "));
      } else {
        // Word counts too different — just use the full Irish sentence without word markers
        // so at least the sentence is in Irish even if untappable
        resultParts.push(irishSentence);
      }
    }

    return resultParts.join(" ");
  } catch (e) {
    console.warn(`  Advanced translation failed: ${e.message}, falling back to word-by-word`);
    // Fall back to aggressive word-by-word
    return buildLevelWordByWord(sentence, 75);
  }
}

async function buildLevelWordByWord(sentence, pct) {
  const tokens = sentence.match(/(\w[\w']*|[^\w\s]|\s+)/g) || [];
  const candidates = tokens
    .map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))
    .filter(({ tok, isWord }) => isWord && shouldTranslate(tok, pct));
  const targetCount = Math.ceil(candidates.length * (pct / 100));
  const step = candidates.length / Math.max(targetCount, 1);
  const toTranslateIndices = new Set(
    Array.from({ length: targetCount }, (_, k) =>
      candidates[Math.min(Math.round(k * step), candidates.length - 1)]?.i
    ).filter(i => i !== undefined)
  );
  const result = [];
  for (const { tok, i, isWord } of tokens.map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))) {
    if (isWord && toTranslateIndices.has(i)) {
      try {
        const irish = await translateCached(tok);
        const lower = tok.toLowerCase();
        const isPlace = placeFor(tok) !== undefined;
        const isOverride = OVERRIDES[lower] !== undefined;
        if (isPlace) {
          result.push(`[[${irish}|${tok}]]`);
        } else if (isOverride || isGoodTranslation(tok, irish)) {
          result.push(`[[${matchCase(tok, cleanTranslation(irish))}|${tok}]]`);
        } else { result.push(tok); }
      } catch { result.push(tok); }
    } else { result.push(tok); }
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
    if (PLACES[lower] !== undefined) {
      candidates.push({ i, clean, irish: PLACES[lower], place: true });
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

// Read one feed. A dead or slow feed logs a warning and returns nothing rather
// than taking the whole run down with it.
async function fetchFeed(feed) {
  try {
    const res = await fetch(feedUrl(feed), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`  ${feed.id}: HTTP ${res.status}, skipped`);
      return [];
    }
    const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
    const items = Array.from(xml.getElementsByTagName("item")).slice(0, FETCH_PER_FEED);
    return items.map((item, i) => {
      const g = tag => item.getElementsByTagName(tag)[0]?.textContent || "";
      const rssCat = g("category").trim();
      const d = g("pubDate") ? new Date(g("pubDate")) : new Date();
      // The item's own <category> is more specific than the feed it came from
      // (the /news feed tags things Ireland, Europe, Middle East, Football and
      // so on), so it decides both the gold label and the tab. catInfo returns
      // null for programme tags like "Analysis and Comment" and for anything
      // unrecognised, and only then does the feed decide.
      const info = catInfo(rssCat);
      const categoryIr = info ? info[0] : feed.catIr;
      const section = info ? info[1] : feed.section;
      return {
        id: `${feed.id}-${i}`,
        title: g("title").trim(),
        summary: g("description").replace(/<[^>]+>/g, "").trim().slice(0, 300),
        link: g("link").trim(),
        category: rssCat || feed.label,
        categoryIr,
        feed: feed.id,
        // Toolbar section on the site, resolved above from the item's own
        // category where possible, else from the feed.
        section,
        published: d.toISOString(),
        timeAgo: msAgo(d), // kept for backwards-compatibility; app recomputes live from `published`
      };
    }).filter(s => s.title.length > 5);
  } catch (e) {
    console.warn(`  ${feed.id}: ${e.message}, skipped`);
    return [];
  }
}

async function fetchStories() {
  const feeds = activeFeeds();
  console.log(`Fetching ${feeds.length} RTÉ feed(s): ${feeds.map(f => f.id).join(", ")}`);

  const all = [];
  for (const feed of feeds) {
    const items = await fetchFeed(feed);
    console.log(`  ${feed.id}: ${items.length} items`);
    all.push(...items);
  }

  if (!all.length) throw new Error("No stories from any feed");

  const unique = dedupe(all);
  const usable = unique.filter(isUsable);
  console.log(`${all.length} fetched, ${unique.length} unique, ${usable.length} usable`);

  // If the filters were too aggressive, fall back to unfiltered rather than
  // publishing a nearly empty day.
  const pool = usable.length >= STORY_COUNT ? usable : unique;
  if (pool !== usable) {
    console.warn(`Only ${usable.length} passed the quality filter, using all ${unique.length}`);
  }

  const chosen = balance(pool, STORY_COUNT);
  const spread = {};
  chosen.forEach(s => { spread[s.feed] = (spread[s.feed] || 0) + 1; });
  console.log(`Selected ${chosen.length}:`, spread);

  // Re-id sequentially so the app's React keys stay stable and predictable
  return chosen.map((s, i) => ({ ...s, id: `story-${i}` }));
}

async function processStory(story, index) {
  console.log(`\nProcessing story ${index + 1}: ${story.title}`);
  console.log(`  Scraping full article...`);
  const fullText = await scrapeArticle(story.link);
  const baseText = fullText || story.summary;
  console.log(`  Using ${fullText ? "full article" : "summary"} (${baseText.length} chars)`);

  const levels = {};
  for (const pct of LEVELS) {
    console.log(`  Generating ${pct}% level...`);
    try {
      levels[pct] = await buildLevel(baseText, pct);
    } catch (err) {
      console.warn(`  Failed level ${pct}: ${err.message}`);
      levels[pct] = baseText;
    }
    await sleep(300);
  }

  return { ...story, summary: baseText, levels };
}

async function main() {
  try {
    const stories = await fetchStories();
    console.log(`Fetched ${stories.length} stories`);
    const processed = [];
    for (let i = 0; i < stories.length; i++) {
      processed.push(await processStory(stories[i], i));
    }
    const output = {
      date: new Date().toISOString().slice(0, 10),
      generated: new Date().toISOString(),
      stories: processed,
    };
    mkdirSync("public/data", { recursive: true });
    if (output.stories.length < MIN_STORIES) {
      throw new Error(
        `Only ${output.stories.length} stories survived (minimum ${MIN_STORIES}). ` +
        `Refusing to publish; yesterday's file stays live.`
      );
    }

    writeFileSync("public/data/today.json", JSON.stringify(output, null, 2));
    console.log(`\n✓ Written public/data/today.json with ${processed.length} stories`);

    // Publish the list of verified (override) English keys so the export page
    // can mark which weekly-recap words come from the trusted dictionary.
    try {
      writeFileSync("public/data/verified.json", JSON.stringify(Object.keys(OVERRIDES), null, 2));
    } catch (e) {
      console.warn("Could not write verified.json:", e.message);
    }

    // Publish place names so the cover-headline tool can translate them correctly.
    try {
      writeFileSync("public/data/places.json", JSON.stringify(PLACES, null, 2));
    } catch (e) {
      console.warn("Could not write places.json:", e.message);
    }

    // Archive — save a dated copy and update the index.
    // Wrapped separately so any archive problem can never break today.json or the site.
    try {
      mkdirSync("public/data/archive", { recursive: true });
      writeFileSync(`public/data/archive/${output.date}.json`, JSON.stringify(output, null, 2));

      const indexPath = "public/data/archive/index.json";
      let index = [];
      try { index = JSON.parse(readFileSync(indexPath, "utf-8")); } catch { index = []; }
      if (!Array.isArray(index)) index = [];
      // Remove any existing entry for this date (handles re-runs), then add newest first
      index = index.filter(e => e.date !== output.date);
      index.unshift({
        date: output.date,
        generated: output.generated,
        stories: output.stories.map(s => ({ title: s.title, category: s.categoryIr })),
      });
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
      console.log(`✓ Archived ${output.date} (${index.length} days in archive)`);
    } catch (archiveErr) {
      console.warn(`Archive step failed (site unaffected): ${archiveErr.message}`);
    }
  } catch (err) {
    console.error("Generation failed:", err);
    process.exit(1);
  }
}

main();
