import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { DOMParser } from "@xmldom/xmldom";

const RSS_URL = "https://www.rte.ie/feeds/rss/?index=/news";
const LEVELS = [10, 25, 50, 75, 100];
const STORY_COUNT = 6;

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
  if (t.trim().split(/\s+/).length > 2) return false;
  if (t.length > original.length * 5) return false;
  if (/\d/.test(t) && !/\d/.test(original)) return false;
  if (/[_/\\@#$%^&*=+|<>]/.test(t)) return false;
  if (tl.includes("http") || tl.includes("www")) return false;
  // Reject suspiciously short results: a 1-2 char translation for a real word
  // is almost always junk (e.g. "south" -> "D")
  if (original.length >= 4 && t.replace(/[.,;:!?]/g, "").length <= 2) return false;
  return true;
}

// Match the casing of the original word so MyMemory can't randomly capitalise
// a mid-sentence word (e.g. "tuar" coming back as "Tuar")
function matchCase(original, translated) {
  if (!translated) return translated;
  // If the original starts lowercase, force the translation to start lowercase
  if (/^[a-z]/.test(original) && /^[A-Z]/.test(translated)) {
    return translated.charAt(0).toLowerCase() + translated.slice(1);
  }
  // If the original starts uppercase (sentence start / proper-ish), keep as-is
  return translated;
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

async function translate(word) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ga`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(`Translation failed: ${data.responseStatus}`);
}

const translationCache = {};

async function translateCached(word) {
  const key = word.toLowerCase();
  if (translationCache[key] !== undefined) return translationCache[key];
  await sleep(250);
  const result = await translate(word);
  translationCache[key] = result;
  return result;
}

function shouldTranslate(tok, pct) {
  const lower = tok.toLowerCase();
  if (NEVER_TRANSLATE.has(lower)) return false;
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
        if (isGoodTranslation(tok, irish)) {
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
        if (isGoodTranslation(tok, irish)) {
          result.push(`[[${matchCase(tok, cleanTranslation(irish))}|${tok}]]`);
        } else { result.push(tok); }
      } catch { result.push(tok); }
    } else { result.push(tok); }
  }
  return result.join("");
}

async function fetchStories() {
  console.log("Fetching RTÉ RSS...");
  const res = await fetch(RSS_URL, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
  return Array.from(xml.getElementsByTagName("item")).slice(0, STORY_COUNT).map((item, i) => {
    const g = tag => item.getElementsByTagName(tag)[0]?.textContent || "";
    const cat = g("category") || "News";
    const d = g("pubDate") ? new Date(g("pubDate")) : new Date();
    return {
      id: `story-${i}`,
      title: g("title").trim(),
      summary: g("description").replace(/<[^>]+>/g, "").trim().slice(0, 300),
      link: g("link").trim(),
      category: cat,
      categoryIr: getIrCat(cat),
      timeAgo: msAgo(d),
    };
  }).filter(s => s.title.length > 5);
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
    writeFileSync("public/data/today.json", JSON.stringify(output, null, 2));
    console.log(`\n✓ Written public/data/today.json with ${processed.length} stories`);

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
