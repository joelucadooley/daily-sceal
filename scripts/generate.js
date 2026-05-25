import { writeFileSync, mkdirSync } from "fs";
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

// Words that should never be sent to translation API
const NEVER_TRANSLATE = new Set([
  "ireland", "irish", "dublin", "cork", "galway", "limerick", "belfast",
  "donegal", "kerry", "mayo", "wicklow", "wexford", "kilkenny", "tipperary",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december",
  "euro", "euros", "rte", "garda", "gardaí", "taoiseach", "tánaiste", "dáil",
  "leinster", "munster", "connacht", "ulster",
]);

// Function words — skipped at low levels, included at higher levels
const FUNCTION_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","has","have","had","will","would",
  "could","should","may","might","this","that","these","those","it","its",
  "he","she","they","we","you","his","her","their","our","my","your",
  "as","by","from","not","no","so","if","than","then","when","which","who",
  "over","into","after","before","about","up","out","also","just","more",
]);

// Strings that mean MyMemory returned garbage
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
  const t = raw.trim();
  if (!t) return false;
  // Same as original — didn't translate
  if (t.toLowerCase() === original.toLowerCase()) return false;
  // Whitespace inside (newlines, tabs)
  if (/[\n\r\t]/.test(t)) return false;
  // Contains brackets — error message
  if (/[\[\](){}]/.test(t)) return false;
  // Bad markers — case insensitive
  const tl = t.toLowerCase();
  if (BAD_MARKERS.some(m => tl.includes(m))) return false;
  // Too long — more than 2 words means it's a phrase explanation not a word
  if (t.trim().split(/\s+/).length > 2) return false;
  // Way too many characters
  if (t.length > original.length * 5) return false;
  // Contains digits when original didn't
  if (/\d/.test(t) && !/\d/.test(original)) return false;
  // Contains punctuation other than fada letters and hyphens
  if (/[_/\\@#$%^&*=+|<>]/.test(t)) return false;
  // Contains "http" or "www"
  if (tl.includes("http") || tl.includes("www")) return false;
  return true;
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

// Cache translations to avoid translating the same word twice
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
  // Never translate proper nouns or known Irish words
  if (NEVER_TRANSLATE.has(lower)) return false;
  // Never translate capitalised words (names like Emily, Paul, Logan)
  if (/^[A-Z]/.test(tok)) return false;
  // Never translate numbers
  if (/^\d+$/.test(tok)) return false;
  // At beginner/elementary levels, skip function words and short words
  if (pct <= 50) {
    if (FUNCTION_WORDS.has(lower)) return false;
    if (tok.length <= 3) return false;
  }
  // At intermediate level, skip function words but allow short content words
  if (pct <= 75) {
    if (FUNCTION_WORDS.has(lower)) return false;
    if (tok.length <= 2) return false;
  }
  // At 100%, translate everything including function words (but still skip length <= 1)
  if (tok.length <= 1) return false;
  return true;
}

async function buildLevel(sentence, pct) {
  const tokens = sentence.match(/(\w[\w']*|[^\w\s]|\s+)/g) || [];

  // Find all translatable candidate tokens
  const candidates = tokens
    .map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))
    .filter(({ tok, isWord }) => isWord && shouldTranslate(tok, pct));

  // Pick how many to actually translate based on percentage
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
                    result.push(`[[${irish.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim()}|${tok}]]`);
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
  } catch (err) {
    console.error("Generation failed:", err);
    process.exit(1);
  }
}

main();
