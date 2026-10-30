// Adds RTÉ stories to today's file by link, for a story the daily run did not
// pick: too old for the feeds (a feature from last week, say) or never in one.
// Each page is read and marked exactly as the daily run does it, and added to
// the end of today's stories. The stories already there are left as they are.
//
//   node scripts/add-story.js <RTÉ link> [<RTÉ link> ...]
//
// The "Add a story" workflow runs this from the Actions tab, after the
// morning run. It refuses when today.json is not today's (the morning run has
// not finished, or failed), so it never adds to yesterday's stories.
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "fs";
import { fileURLToPath } from "url";
import { processStory, readArticle, msAgo, OUT_DIR } from "./generate.js";
import { feedById } from "./feeds.js";
import { resolveCat, linkFolders } from "./categories.js";
import { firstSentences } from "./summary.js";
import { MIN_ARTICLE_WORDS } from "./lib/pick.js";

// The feed a link would have come in on, for its defaults (gold label and tab
// when no tag decides) and for the word senses of its part of the paper.
const NEWS_FEEDS = new Set(["ireland", "politics", "business", "world"]);
const WORLD_FOLDERS = new Set(["us", "uk", "europe", "middle-east", "asia", "africa", "americas", "ukraine"]);
const GAA_FOLDERS = new Set(["gaa", "football", "hurling", "camogie", "handball", "ladies-football"]);

export function feedFor(link) {
  const [top, sub] = linkFolders(link);
  if (top === "sport") {
    if (GAA_FOLDERS.has(sub)) return "gaa";
    if (sub === "soccer" || sub === "rugby") return sub;
    return "sport";
  }
  if (top === "entertainment") return "ents";
  if (top === "lifestyle") return "life";
  if (top === "culture" || top === "brainstorm") return "culture";
  if (NEWS_FEEDS.has(sub)) return sub;
  if (WORLD_FOLDERS.has(sub)) return "world";
  return "news";
}

const sameLink = (a, b) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** The story as fetchFeed would have built it, from the page instead of the feed. */
export function storyFromPage(link, page, now = new Date()) {
  const feed = feedById(feedFor(link));
  const got = resolveCat(page.tags, link);
  const when = page.published ? new Date(page.published) : now;
  const description = (page.description || "").replace(/\s+/g, " ").trim();
  return {
    title: page.title,
    summary: description.slice(0, 300),
    rssSummary: description ? firstSentences(description) : undefined,
    link,
    category: (got && got.tag) || feed.label,
    categoryIr: got ? got.info[0] : feed.catIr,
    feed: feed.id,
    section: got ? got.info[1] : feed.section,
    published: when.toISOString(),
    timeAgo: msAgo(when),
    fullText: page.text,
  };
}

/** Links from the command line, one per argument or several in one, space separated. */
export function linksFrom(args) {
  return args.flatMap(a => String(a).split(/\s+/)).map(s => s.trim()).filter(Boolean);
}

async function main() {
  const links = linksFrom(process.argv.slice(2));
  if (!links.length) throw new Error("Give at least one RTÉ link.");
  for (const link of links) {
    if (!/^https:\/\/www\.rte\.ie\//.test(link)) throw new Error(`Not an RTÉ story link: ${link}`);
  }

  const path = `${OUT_DIR}/today.json`;
  const today = JSON.parse(readFileSync(path, "utf-8"));
  const date = new Date().toISOString().slice(0, 10);
  if (today.date !== date) {
    throw new Error(`today.json is dated ${today.date}, not ${date}: the morning run has not finished. Try again after it.`);
  }

  let added = 0;
  for (const link of links) {
    if (today.stories.some(s => sameLink(s.link, link))) {
      console.log(`Already in today's stories, skipped: ${link}`);
      continue;
    }
    console.log(`\nReading ${link}`);
    const page = await readArticle(link);
    if (!page || !page.text) throw new Error(`No article text found at ${link}`);
    if (!page.title) throw new Error(`No headline found at ${link}`);
    if (page.words < MIN_ARTICLE_WORDS) {
      console.warn(`  Only ${page.words} words of reporting (the daily run skips under ${MIN_ARTICLE_WORDS}); adding it anyway.`);
    }
    const story = storyFromPage(link, page);
    console.log(`  ${story.title}: ${story.section} (${story.categoryIr}), feed ${story.feed}`);
    const done = await processStory(story, today.stories.length);
    const beginner = (done.levels && done.levels["10"]) || "";
    if (!beginner.includes("[[")) throw new Error(`No Irish was marked in ${link}; not adding it.`);
    today.stories.push({ ...done, id: `story-${today.stories.length}` });
    added++;
  }

  if (!added) {
    console.log("Nothing new to add.");
    return;
  }
  writeFileSync(path, JSON.stringify(today, null, 2));
  console.log(`\n✓ Added ${added} to ${path} (${today.stories.length} stories)`);

  // The dated copy and the archive index follow today.json, as in generate.js.
  // Wrapped separately so an archive problem never undoes the add.
  try {
    mkdirSync(`${OUT_DIR}/archive`, { recursive: true });
    writeFileSync(`${OUT_DIR}/archive/${today.date}.json`, JSON.stringify(today, null, 2));
    const indexPath = `${OUT_DIR}/archive/index.json`;
    let index = [];
    try { index = JSON.parse(readFileSync(indexPath, "utf-8")); } catch { index = []; }
    if (!Array.isArray(index)) index = [];
    const entry = { date: today.date, generated: today.generated, stories: today.stories.map(s => ({ title: s.title, category: s.categoryIr })) };
    const at = index.findIndex(e => e.date === today.date);
    if (at === -1) index.unshift(entry);
    else index[at] = entry;
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`✓ Archive updated for ${today.date}`);
  } catch (e) {
    console.warn(`Archive step failed (today.json is fine): ${e.message}`);
  }
}

// Run only when started directly, so tests can import the helpers.
function startedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (startedDirectly()) {
  main().catch(err => {
    console.error(err.message || err);
    process.exit(1);
  });
}
