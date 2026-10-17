// Choosing the day's stories once their pages have been read.
//
// Some RTÉ pages carry almost no article text: live updates pages, match
// recaps, video-only and cartoon pages, list pages. Scraped, they give a
// sentence or two, which makes a thin story on the site and in the app. These
// rules skip such a story and take the next one in the balanced order, so the
// day still has STORY_COUNT stories and the feed spread stays as it was.
//
// Measured on the archive (2026-06-01 to 2026-10-12, 134 days): every story
// under 45 words of article text was one or two sentences (live pages, recaps,
// soap previews, a cartoon, a TV listing). Real short news reports start at
// 45 words (a drowning, 45; road deaths, 55 and 56), so the line sits just
// under them. About one story in three days is dropped, never more than two.

/** Fewer words of article text than this and the story is skipped. */
export const MIN_ARTICLE_WORDS = 45;

/** Most pages read beyond the day's story count, so a bad day cannot turn
 *  into a hundred scrapes. */
export const EXTRA_SCRAPES = 15;

// Titles that are a live page or a match recap whatever the page holds.
// "updates" only at the end or before a colon: "Kerry ... as it updates
// targets" is a real story. "live" and "leaderboard" are left out on purpose:
// "3.4% rise in Live Register claimants" and "Maura Higgins tops women's
// leaderboard" are real stories.
const THIN_TITLES = [
  [/\brecap\b/i, "recap"],
  [/\bupdates\s*(:|$)/i, "updates"],
  [/\bresults and reports\b/i, "results and reports"],
  [/\b(as it happened|live updates|live blog)\b/i, "live page"],
];

// Addresses RTÉ gives its live pages and results tables. Every archive story
// with one of these was under 45 words. Plural "updates" only: "-trading-update"
// is a business story.
const THIN_LINKS = [
  [/-(live-)?updates\/?$/i, "live updates page"],
  [/-tracker\/?$/i, "live tracker page"],
  [/-live-blog\/?$/i, "live blog"],
  [/\/sport\/results\//i, "results table"],
];

/** Why a story is a live page or recap from its title or address, or null. */
export function thinPattern(story) {
  for (const [re, why] of THIN_TITLES) if (re.test(story.title || "")) return `title: ${why}`;
  for (const [re, why] of THIN_LINKS) if (re.test(story.link || "")) return `link: ${why}`;
  return null;
}

export function wordCount(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

/**
 * Read pages in balanced order and keep the first `total` with enough text.
 *
 *   pool     every usable story, best first within each feed
 *   balance  (stories, total) -> the day's selection (feeds.js balance)
 *   scrape   async (url) -> article text, or null
 *
 * The selection is always balance() over the pool minus the stories already
 * skipped, so a skipped story is replaced exactly as if it had never been in
 * its feed: by the next story from the same feed while that feed is under
 * its cap. Stories already read are not read again. Returns the stories in
 * selection order, each with `fullText`, plus the skipped ones.
 */
export async function pickStories(pool, {
  total,
  balance,
  scrape,
  minWords = MIN_ARTICLE_WORDS,
  extra = EXTRA_SCRAPES,
  log = () => {},
}) {
  const skipped = new Set();
  const skippedList = [];
  const texts = new Map();
  const budget = total + extra;
  let scrapes = 0;
  let outOfBudget = false;
  let chosen = [];

  const skip = (story, reason, words) => {
    skipped.add(story);
    skippedList.push({ title: story.title, feed: story.feed, link: story.link, reason, words });
    const count = words == null ? "not read" : `${words} words`;
    log(`  Skipped (${reason}, ${count}): ${story.title}`);
  };

  for (;;) {
    chosen = balance(pool.filter(s => !skipped.has(s)), total);
    let changed = false;
    for (const story of chosen) {
      if (texts.has(story)) continue;
      const why = thinPattern(story);
      if (why) {
        skip(story, why, null);
        changed = true;
        continue;
      }
      if (scrapes >= budget) {
        outOfBudget = true;
        break;
      }
      scrapes++;
      const text = await scrape(story.link);
      const words = wordCount(text);
      if (!text || words < minWords) {
        skip(story, text ? `under ${minWords} words` : "no article text", words);
        changed = true;
        continue;
      }
      texts.set(story, text);
    }
    if (outOfBudget || !changed) break;
  }

  if (outOfBudget) log(`  Stopped after ${scrapes} pages (limit ${budget})`);
  const stories = chosen.filter(s => texts.has(s)).map(s => ({ ...s, fullText: texts.get(s) }));
  return { stories, skipped: skippedList, scrapes };
}
