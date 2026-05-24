// scripts/generate.js
// Runs once daily via GitHub Actions.
// Fetches top 6 RTÉ news stories, translates key words into Irish
// at 5 preset levels using the free MyMemory translation API,
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

// MyMemory free translation API — no key, no signup, 5000 words/day free
async function translate(text, langPair = "en|ga") {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(`Translation failed: ${data.responseStatus}`);
}

// Sleep to stay within MyMemory rate limits
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Extract content words from a sentence based on target density.
// Returns the sentence with Irish translations woven in as [[irish|english]] markers.
async function buildLevel(sentence, pct) {
  // Split into words, preserving punctuation
  const tokens = sentence.match(/(\w[\w']*|[^\w\s]|\s+)/g) || [];

  // Common English function words to always keep in English
  const FUNCTION_WORDS = new Set([
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "is","are","was","were","be","been","has","have","had","will","would",
    "could","should","may","might","this","that","these","those","it","its",
    "he","she","they","we","you","i","his","her","their","our","my","your",
    "as","by","from","not","no","so","if","than","then","when","which","who",
    "over","into","after","before","about","up","out","said","says","new",
  ]);

  // Get content word candidates based on level
  const contentTokens = tokens
    .map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))
    .filter(({ tok, isWord }) => isWord && !FUNCTION_WORDS.has(tok.toLowerCase()) && tok.length > 2);

  // How many words to translate at this level
  const targetCount = Math.ceil(contentTokens.length * (pct / 100));
  // Pick evenly-spaced indices for a natural distribution
  const step = contentTokens.length / Math.max(targetCount, 1);
  const toTranslate = new Set(
    Array.from({ length: targetCount }, (_, k) => contentTokens[Math.round(k * step)]?.i)
      .filter(i => i !== undefined)
  );

  // Build translated output
  const result = [];
  for (const { tok, i, isWord } of tokens.map((tok, i) => ({ tok, i, isWord: /^\w/.test(tok) }))) {
    if (isWord && toTranslate.has(i)) {
      try {
        await sleep(200); // gentle rate limiting
        const irish = await translate(tok);
        // Only use if it actually came back different and looks like Irish
        if (irish && irish.toLowerCase() !== tok.toLowerCase() && !/^\[/.test(irish)) {
          result.push(`[[${irish}|${tok}]]`);
        } else {
          result.push(tok);
        }
      } catch {
        result.push(tok); // fallback to English if translation fails
      }
    } else {
      result.push(tok);
    }
  }

  return result.join("");
}

async function fetchStories() {
  console.log("Fetching RTÉ RSS...");
  const res = await fetch(RSS_URL);
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
  const levels = {};

  // Use the summary as the base text (it's the right length — 1-3 sentences)
  const baseText = story.summary;

  for (const pct of LEVELS) {
    console.log(`  Generating ${pct}% level...`);
    try {
      levels[pct] = await buildLevel(baseText, pct);
    } catch (err) {
      console.warn(`  Failed level ${pct}, falling back to English: ${err.message}`);
      levels[pct] = baseText; // graceful fallback
    }
    await sleep(500);
  }

  return { ...story, levels };
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
