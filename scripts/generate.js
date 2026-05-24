// scripts/generate.js
// Runs once daily via GitHub Actions.
// Fetches top 6 RTÉ news stories, scrapes full article text from each story page,
// translates key words into Irish at 5 preset levels using the free MyMemory API,
// then writes public/data/today.json for the app to serve statically.
// Zero cost. No API key required.

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

// Scrape full article text from an RTÉ story page
async function scrapeArticle(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DailySceal/1.0)" }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // RTÉ article body is in <p> tags inside the article element
    // Extract all paragraph text and join into a readable article
    const paragraphs = [];
    const pRegex = /<p[^>]*>(.*?)<\/p>/gs;
    let match;
    while ((match = pRegex.exec(html)) !== null) {
      const text = match[1]
        .replace(/<[^>]+>/g, "") // strip inner tags
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, "")
        .replace(/&[a-z]+;/g, "")
        .trim();
      // Only keep substantial paragraphs, skip nav/footer text
      if (text.length > 60 && !text.includes("RTÉ") && !text.includes("cookie") && !text.includes("javascript")) {
        paragraphs.push(text);
      }
    }

    // Take the first 4 good paragraphs and join them
    const article = paragraphs.slice(0, 4).join(" ");
    return article.length > 100 ? article : null;
  } catch (e) {
    console.warn(`  Could not scrape ${url}: ${e.message}`);
    return null;
  }
}

// MyMemory free translation API — no key, no signup, 5000 words/day free
async function translate(text, langPair = "en|ga") {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(`Translation failed: ${data.responseStatus}`);
}

// Build a version of the text with Irish words woven in at the target density
async function buildLevel(sentence, pct) {
  const FUNCTION_WORDS = new Set([
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","has","have","had","will","would",
    "could","should","may","might","this","that","these","those","it","its",
    "he","she","they","we","you","i","his","her","their","our","my","your",
    "as","by","from","not","no","so","if","than","then","when","which","who",
    "over","into","after","before","about","up","out","said","says","new","also",
    "been","its","than","more","also","just","been","have",
  ]);

  const tokens = sentence.match(/(\w[\w']*|[^\w\s]|\s+)/g) || [];
  const contentTokens = tokens
    .map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))
    .filter(({ tok, isWord }) => isWord && !FUNCTION_WORDS.has(tok.toLowerCase()) && tok.length > 3);

  const targetCount = Math.ceil(contentTokens.length * (pct / 100));
  const step = contentTokens.length / Math.max(targetCount, 1);
  const toTranslate = new Set(
    Array.from({ length: targetCount }, (_, k) => contentTokens[Math.min(Math.round(k * step), contentTokens.length - 1)]?.i)
      .filter(i => i !== undefined)
  );

  const result = [];
  for (const { tok, i, isWord } of tokens.map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))) {
    if (isWord && toTranslate.has(i)) {
      try {
        await sleep(250);
        const irish = await translate(tok);
        if (irish && irish.toLowerCase() !== tok.toLowerCase() && !/^\[/.test(irish) && irish.length < tok.length * 4) {
          result.push(`[[${irish}|${tok}]]`);
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
  const items = Array.from(xml.getElementsByTagName("item")).slice(0, STORY_COUNT);

  return items.map((item, i) => {
    const g = tag => item.getElementsByTagName(tag)[0]?.textContent || "";
    const cat = g("category") || "News";
    const pubDate = g("pubDate");
    const d = pubDate ? new Date(pubDate) : new Date();
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

  // Try to scrape the full article, fall back to summary
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
    await sleep(500);
  }

  return { ...story, summary: baseText, levels };
}

async function main() {
  try {
    const stories = await fetchStories();
    console.log(`Fetched ${stories.length} stories`);

    const processed = [];
    for (let i = 0; i < stories.length; i++) {
      const story = await processStory(stories[i], i);
      processed.push(story);
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
