// One RSS item from an RTÉ feed, as the daily run's story. No network and no
// XML parser here: generate.js reads the item's fields and passes them in, so
// the tests can check what happens when RTÉ changes what it sends.
import { resolveCat } from "../categories.js";
import { firstSentences } from "../summary.js";
import { decode } from "./page.js";

export function msAgo(d) {
  const m = Math.max(0, Math.floor((Date.now() - d) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
}

/** Plain text from an RSS field that may hold HTML and entities. */
export function plainText(s) {
  return decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * When the item was published. A missing date, or one that cannot be read
 * ("Tue, 4 Nov 2026 25:61"), counts as now: before, it threw and the whole
 * feed was skipped for one bad item.
 */
export function itemDate(pubDate, now = new Date()) {
  if (!pubDate || !String(pubDate).trim()) return now;
  const d = new Date(String(pubDate).trim());
  return Number.isNaN(d.getTime()) ? now : d;
}

/**
 * The story for one item: { title, description, link, pubDate, categories }
 * as read from the feed, `feed` from feeds.js and `i` its place in the feed.
 * Returns null for an item with no usable headline or link.
 */
export function storyFromItem({ title, description, link, pubDate, categories = [] }, feed, i, now = new Date()) {
  const headline = plainText(title);
  const url = String(link || "").trim();
  if (headline.length <= 5 || !/^https?:\/\//i.test(url)) return null;
  const cats = categories.map(c => plainText(c)).filter(Boolean);
  const rssCat = cats[0] || "";
  const d = itemDate(pubDate, now);
  const desc = plainText(description);
  // The item's own <category> tags are more specific than the feed it came
  // from (the /news feed tags things Ireland, Europe, Middle East, Football
  // and so on), so they decide both the gold label and the tab. Every tag
  // is tried, then the link's folders (/news/us/, /entertainment/). Only
  // when none of those says anything does the story get the feed's
  // section, and then the page's own tags get a say once it is read
  // (chooseStories in generate.js).
  const got = resolveCat(cats, url);
  return {
    id: `${feed.id}-${i}`,
    title: headline,
    summary: desc.slice(0, 300),
    // The RSS description on its own, cut at a sentence boundary. The apps
    // show this (plus a link to RTÉ), so it is kept even though `summary` is
    // overwritten with the full text later.
    rssSummary: firstSentences(desc),
    link: url,
    // The tag that decided, so the site's own catInfo agrees with it.
    category: (got && got.tag) || rssCat || feed.label,
    categoryIr: got ? got.info[0] : feed.catIr,
    feed: feed.id,
    section: got ? got.info[1] : feed.section,
    published: d.toISOString(),
    timeAgo: msAgo(d), // kept for older readers; the site works it out from `published`
    // Only while choosing: the feed decided, so the page's tags may still.
    ...(got ? {} : { fromFeed: true }),
  };
}
