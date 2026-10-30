import { writeFileSync, readFileSync, mkdirSync, realpathSync } from "fs";
import { fileURLToPath } from "url";
import {
  activeFeeds, feedUrl, FETCH_PER_FEED,
  isUsable, dedupe, balance,
} from "./feeds.js";
import { resolveCat } from "./categories.js";
import { firstSentences, stripMarkers } from "./summary.js";
import { loadDict, verifiedKeys, focailLists } from "./lib/dict.js";
import { markStory, storyContext } from "./lib/words.js";
import { createMyMemory } from "./lib/mymemory.js";
import { pickStories, articleFromHtml, MIN_ARTICLE_WORDS } from "./lib/pick.js";
import { pageInfo } from "./lib/page.js";
// Stories actually processed. Every one of these costs a page scrape plus
// three levels of MyMemory calls, so this is the expensive number. Feeds are
// read far more widely than this and then filtered down to it.
//
// Raised from 20 to fill the section tabs on the site. The homepage only shows
// HOMEPAGE_COUNT of these; the rest live under their section. A cold run
// makes about 22 MyMemory lookups per story, well inside the daily allowance.
const STORY_COUNT = 30;

// How many paragraphs of each article to keep. Raising this makes the stories
// longer but multiplies the translation calls, so check the MyMemory line at
// the end of the run log after any change.
const PARAGRAPH_LIMIT = 6;
// Below this, something is wrong upstream (feeds down, RTÉ layout change,
// MyMemory quota) and publishing would replace a good day with a broken one.
// Failing loudly leaves yesterday's today.json in place, which is the better
// outcome, and the workflow raises an issue so it does not pass unnoticed.
const MIN_STORIES = 8;

// Where the day's files are written. Set OUT_DIR for a dry run so public/data
// is never touched.
const OUT_DIR = process.env.OUT_DIR || "public/data";

// Curated dictionary (overrides.json, places.json, senses.json) and the
// MyMemory client.
const DICT = loadDict();
const OVERRIDES = DICT.overrides;
const PLACES = DICT.places;
console.log(`Loaded ${Object.keys(OVERRIDES).length} translation overrides`);
console.log(`Loaded ${Object.keys(PLACES).length} place names`);
console.log(`Loaded ${Object.keys(DICT.senses).length} approved senses`);
console.log(`Loaded ${Object.keys(DICT.extra).length} extra words (not hand-checked)`);

const myMemory = createMyMemory();
const wordDeps = {
  dict: DICT,
  lookup: myMemory.lookup,
  onRejected: word => myMemory.noteRejected(word),
};

function msAgo(d) {
  const m = Math.floor((Date.now() - d) / 60000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Read one article page: { text, words } (articleFromHtml in lib/pick.js),
// plus what the page's meta tags say (title, description, published, tags;
// lib/page.js), or null when the page cannot be read. `text` is what is
// published; `words` is what decides whether the story is too thin to use.
async function readArticle(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DailySceal/1.0)" }
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Six paragraphs rather than four. Longer stories read better on a wide
    // screen, but every extra paragraph costs MyMemory calls across all three
    // levels and all thirty stories, so this is not a free number to raise.
    const { text, paragraphs, words } = articleFromHtml(html, { limit: PARAGRAPH_LIMIT });
    if (paragraphs) {
      console.log(`    ${paragraphs} usable paragraphs found, using ${Math.min(paragraphs, PARAGRAPH_LIMIT)} (${words} words of reporting)`);
    }
    return { text, words, ...pageInfo(html) };
  } catch (e) {
    console.warn(`  Could not scrape ${url}: ${e.message}`);
    return null;
  }
}

// The article text alone, or null.
async function scrapeArticle(url) {
  const got = await readArticle(url);
  return got ? got.text : null;
}

// Read one feed. A dead or slow feed logs a warning and returns nothing rather
// than taking the whole run down with it.
async function fetchFeed(feed) {
  try {
    // Loaded here rather than at the top so the file can be imported (tests,
    // dry runs) on a machine without @xmldom/xmldom installed.
    const { DOMParser } = await import("@xmldom/xmldom");
    const res = await fetch(feedUrl(feed), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`  ${feed.id}: HTTP ${res.status}, skipped`);
      return [];
    }
    const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
    const items = Array.from(xml.getElementsByTagName("item")).slice(0, FETCH_PER_FEED);
    return items.map((item, i) => {
      const g = tag => item.getElementsByTagName(tag)[0]?.textContent || "";
      const cats = Array.from(item.getElementsByTagName("category"))
        .map(c => (c.textContent || "").trim())
        .filter(Boolean);
      const rssCat = cats[0] || "";
      const link = g("link").trim();
      const d = g("pubDate") ? new Date(g("pubDate")) : new Date();
      // The item's own <category> tags are more specific than the feed it came
      // from (the /news feed tags things Ireland, Europe, Middle East, Football
      // and so on), so they decide both the gold label and the tab. Every tag
      // is tried, then the link's folders (/news/us/, /entertainment/). Only
      // when none of those says anything does the story get the feed's
      // section, and then the page's own tags get a say once it is read
      // (chooseStories): the Iowa midterms piece came in on Top stories tagged
      // only "Analysis and Comment", and Top stories defaults to Éire.
      const got = resolveCat(cats, link);
      const categoryIr = got ? got.info[0] : feed.catIr;
      const section = got ? got.info[1] : feed.section;
      return {
        id: `${feed.id}-${i}`,
        title: g("title").trim(),
        summary: g("description").replace(/<[^>]+>/g, "").trim().slice(0, 300),
        // The RSS description on its own, cut at a sentence boundary. The iOS
        // app shows only this (plus a link to RTÉ), never the scraped article,
        // so it is kept even though `summary` is overwritten with the full
        // text further down.
        rssSummary: firstSentences(g("description").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()),
        link,
        // The tag that decided, so the site's own catInfo agrees with it.
        category: (got && got.tag) || rssCat || feed.label,
        categoryIr,
        feed: feed.id,
        // Toolbar section on the site, resolved above from the item's own
        // category where possible, else from the feed.
        section,
        published: d.toISOString(),
        timeAgo: msAgo(d), // kept for backwards-compatibility; app recomputes live from `published`
        // Only while choosing: the feed decided, so the page's tags may still.
        ...(got ? {} : { fromFeed: true }),
      };
    }).filter(s => s.title.length > 5);
  } catch (e) {
    console.warn(`  ${feed.id}: ${e.message}, skipped`);
    return [];
  }
}

async function fetchItems() {
  const feeds = activeFeeds();
  console.log(`Fetching ${feeds.length} RTÉ feed(s): ${feeds.map(f => f.id).join(", ")}`);

  const all = [];
  for (const feed of feeds) {
    const items = await fetchFeed(feed);
    console.log(`  ${feed.id}: ${items.length} items`);
    all.push(...items);
  }
  return all;
}

// Every story worth considering today, best first within each feed. Only
// STORY_COUNT of these are used; the rest stand by in case a page turns out
// to have no article text.
function buildPool(all) {
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
  return pool;
}

// Read pages in the balanced order and keep the first STORY_COUNT with real
// article text (scripts/lib/pick.js). Live pages, recaps and one-sentence
// pages are skipped and logged, and the next story in the order takes their
// place.
async function chooseStories(pool, scrape) {
  console.log(`\nReading article pages (skipping any under ${MIN_ARTICLE_WORDS} words)...`);
  const { stories, skipped, scrapes } = await pickStories(pool, {
    total: STORY_COUNT,
    balance,
    scrape,
    log: msg => console.log(msg),
  });
  const spread = {};
  stories.forEach(s => { spread[s.feed] = (spread[s.feed] || 0) + 1; });
  console.log(`Selected ${stories.length} after reading ${scrapes} pages, ${skipped.length} skipped:`, spread);

  // Re-id sequentially so the app's React keys stay stable and predictable
  return stories.map((s, i) => ({ ...placeByPage(s), id: `story-${i}` }));
}

// A story the feed placed (no tag or folder said where) takes its section from
// the page's own tags when one of them resolves. Drops the working fields.
function placeByPage(story) {
  const { fromFeed, pageTags, ...s } = story;
  if (!fromFeed || !pageTags) return s;
  const got = resolveCat(pageTags, null);
  if (!got) return s;
  console.log(`  Placed by its page tags (${got.tag}): ${s.title} -> ${got.info[1]}`);
  return { ...s, category: got.tag, categoryIr: got.info[0], section: got.info[1] };
}

// `fullText` is the article already read by chooseStories. Without it (a
// story passed in directly) the page is read here, as before.
async function processStory(story, index) {
  const { fullText: readText, ...rest } = story;
  story = rest;
  console.log(`\nProcessing story ${index + 1}: ${story.title}`);
  let fullText = readText;
  if (fullText == null) {
    console.log(`  Scraping full article...`);
    fullText = await scrapeArticle(story.link);
  }
  const baseText = fullText || story.summary;
  console.log(`  Using ${fullText ? "full article" : "summary"} (${baseText.length} chars)`);

  const rssSummary = story.rssSummary || firstSentences(stripMarkers(baseText));
  // Feed, section and topic, so a word can take the Irish its part of the
  // paper needs (senses.json): pitch on a sport page is not airde.
  const ctx = storyContext(story);
  const { levels, summaryLevels, titleIr } = await markStory(
    { title: story.title, text: baseText, rss: rssSummary, ctx },
    wordDeps,
    { pause: () => sleep(300), log: msg => console.log(msg), warn: msg => console.warn(msg) },
  );

  return { ...story, summary: baseText, rssSummary, levels, summaryLevels, titleIr };
}

// The whole day: read feeds, choose and read pages, mark the stories, write
// the files. Throws on failure so the caller decides what happens. The tests
// pass their own feed items, page reader and story marker; the daily run
// uses the real ones.
async function run({
  loadItems = fetchItems,
  scrape = readArticle,
  process: markOne = processStory,
} = {}) {
  const stories = await chooseStories(buildPool(await loadItems()), scrape);
  console.log(`Fetched ${stories.length} stories`);
  // Checked again after marking below. Checking here as well saves a full
  // round of MyMemory calls on a day that cannot be published anyway.
  if (stories.length < MIN_STORIES) {
    throw new Error(
      `Only ${stories.length} stories with article text (minimum ${MIN_STORIES}). ` +
      `Refusing to publish; yesterday's file stays live.`
    );
  }
  const processed = [];
  for (let i = 0; i < stories.length; i++) {
    processed.push(await markOne(stories[i], i));
  }
  console.log(`\n${myMemory.summary()}`);
  const output = {
    date: new Date().toISOString().slice(0, 10),
    generated: new Date().toISOString(),
    stories: processed,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  if (output.stories.length < MIN_STORIES) {
    throw new Error(
      `Only ${output.stories.length} stories survived (minimum ${MIN_STORIES}). ` +
      `Refusing to publish; yesterday's file stays live.`
    );
  }

  writeFileSync(`${OUT_DIR}/today.json`, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${OUT_DIR}/today.json with ${processed.length} stories`);

  // Publish the list of verified (override) English keys so the export page
  // can mark which weekly-recap words come from the trusted dictionary.
  // Extra words are not hand-checked, so they are never in this list.
  try {
    writeFileSync(`${OUT_DIR}/verified.json`, JSON.stringify(verifiedKeys(DICT), null, 2));
  } catch (e) {
    console.warn("Could not write verified.json:", e.message);
  }

  // Publish the verified dictionary itself (Irish and English pairs) for the
  // iOS app: it decides which words count as verified for flashcards and
  // gap fill, and the focal of the day widget only ever picks from `words`.
  // Place names are listed separately so they count as verified in the
  // reader but never become the focal of the day. Extra words stay out.
  try {
    const focail = { generated: new Date().toISOString(), ...focailLists(DICT) };
    writeFileSync(`${OUT_DIR}/focail.json`, JSON.stringify(focail, null, 2));
    console.log(`✓ Written ${OUT_DIR}/focail.json (${focail.words.length} words, ${focail.places.length} places)`);
  } catch (e) {
    console.warn("Could not write focail.json:", e.message);
  }

  // Publish place names so the cover-headline tool can translate them correctly.
  try {
    writeFileSync(`${OUT_DIR}/places.json`, JSON.stringify(PLACES, null, 2));
  } catch (e) {
    console.warn("Could not write places.json:", e.message);
  }

  // Archive — save a dated copy and update the index.
  // Wrapped separately so any archive problem can never break today.json or the site.
  try {
    mkdirSync(`${OUT_DIR}/archive`, { recursive: true });
    writeFileSync(`${OUT_DIR}/archive/${output.date}.json`, JSON.stringify(output, null, 2));

    const indexPath = `${OUT_DIR}/archive/index.json`;
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
  return output;
}

async function main() {
  try {
    await run();
  } catch (err) {
    console.error("Generation failed:", err);
    process.exit(1);
  }
}

export { processStory, scrapeArticle, readArticle, run, main, msAgo, STORY_COUNT, MIN_STORIES, OUT_DIR };

// Run only when started directly (node scripts/generate.js), so the tests can
// import this file without fetching feeds or writing anything.
function startedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedDirectly()) main();
