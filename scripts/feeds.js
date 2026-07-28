// RTÉ section feeds.
//
// Every RTÉ feed uses one pattern:
//   https://www.rte.ie/feeds/rss/?index=<index>
//
// ---------------------------------------------------------------------------
// HOW TO CUSTOMISE
//
//   on    true/false. Whether this feed is fetched on a normal daily run.
//   max   Most stories this feed may contribute to the final list. Stops one
//         busy section filling the whole day. Raise it to bias towards a feed.
//   catIr Irish category label. Only used when the RSS item has no useful
//         <category> of its own, which happens on the section feeds.
//
// For a one-off run with a different mix, set the FEEDS env var. It overrides
// the `on` flags completely:
//
//   FEEDS=sport,gaa node scripts/generate.js
//
// The daily workflow exposes the same thing as a manual input, so on an
// All-Ireland Sunday you can trigger a sport-only run from the Actions tab.
// ---------------------------------------------------------------------------

const RTE_BASE = "https://www.rte.ie/feeds/rss/?index=";

// Toolbar sections live in scripts/categories.js, which maps every RTÉ
// category to both its Irish label and its section. Each feed still declares a
// `section` here, used only when a story's own category is a programme tag
// ("Analysis and Comment") or something unrecognised.

export const RTE_FEEDS = [
  // --- general news ---------------------------------------------------
  // /news carries its own per-item categories (Ireland, World, Business,
  // Football...) so it feeds several sections at once and stays weighted high.
  { id: "news",     label: "Top stories",   index: "/news",            catIr: "Nuacht",      section: "eire",        on: true, max: 8, verified: true },
  { id: "ireland",  label: "Ireland",       index: "/news/ireland",    catIr: "Éire",        section: "eire",        on: true, max: 5, verified: false },
  { id: "politics", label: "Politics",      index: "/news/politics",   catIr: "Polaitíocht", section: "eile",        on: true, max: 4, verified: true },
  { id: "business", label: "Business",      index: "/news/business",   catIr: "Gnó",         section: "eile",        on: true, max: 3, verified: true },
  { id: "world",    label: "World",         index: "/news/world",      catIr: "Domhan",      section: "domhan",      on: true, max: 4, verified: false },

  // --- sport ----------------------------------------------------------
  // All four land in the one Spórt tab; each story keeps its finer label
  // (Peil, Iomáint, Sacar, Rugbaí) in the gold category line.
  { id: "sport",    label: "Sport",         index: "/sport",           catIr: "Spórt",       section: "sport",       on: true, max: 4, verified: true },
  { id: "gaa",      label: "GAA",           index: "/sport/gaa",       catIr: "CLG",         section: "sport",       on: true, max: 3, verified: false },
  { id: "soccer",   label: "Soccer",        index: "/sport/soccer",    catIr: "Sacar",       section: "sport",       on: true, max: 2, verified: true },
  { id: "rugby",    label: "Rugby",         index: "/sport/rugby",     catIr: "Rugbaí",      section: "sport",       on: true, max: 2, verified: true },

  // --- culture, entertainment, lifestyle ------------------------------
  // Mixed into one Saol tab the same way sport is.
  { id: "culture",  label: "Culture",       index: "/culture",         catIr: "Cultúr",      section: "eile",        on: true, max: 2, verified: true },
  { id: "ents",     label: "Entertainment", index: "/entertainment",   catIr: "Siamsaíocht", section: "eile",        on: true, max: 2, verified: true },
  { id: "life",     label: "Lifestyle",     index: "/lifestyle",       catIr: "Saol",        section: "eile",        on: true, max: 2, verified: true },
];


/** How many items to read from each feed before filtering. */
export const FETCH_PER_FEED = 25;

/** Minimum RSS description length. RSS summaries are short, so keep this low;
 *  the full article gets scraped later anyway. Raise it if too much junk gets
 *  through, but check the "usable" count in the log before you do. */
export const MIN_SUMMARY = 90;

export const feedUrl = (feed) => RTE_BASE + feed.index;

export const feedById = (id) => RTE_FEEDS.find((f) => f.id === id);

/** Feeds to fetch this run. FEEDS env var wins over the `on` flags. */
export function activeFeeds() {
  const env = (process.env.FEEDS || "").trim();
  if (env) {
    const want = new Set(
      env.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    const picked = RTE_FEEDS.filter((f) => want.has(f.id));
    if (picked.length) {
      console.log(`FEEDS override: ${picked.map((f) => f.id).join(", ")}`);
      return picked;
    }
    console.warn(`FEEDS="${env}" matched no known feed id, using config instead`);
  }
  return RTE_FEEDS.filter((f) => f.on);
}

/**
 * Drop stories that cannot carry a decent translation before they cost us
 * a scrape and three levels of MyMemory calls.
 */
export function isUsable(story) {
  const title = (story.title || "").trim();
  const summary = (story.summary || "").trim();
  if (title.length < 20) return false;
  if (summary.length < MIN_SUMMARY) return false;
  // Live blogs, galleries and video posts have no prose to work with
  if (/^(watch|listen|live|in pictures|gallery|as it happened|recap)\b/i.test(title)) return false;
  if (/\b(live updates|as it happened)\b/i.test(title)) return false;
  // A headline that is just a quote reads badly once half of it is in Irish
  if (/^['"“']/.test(title)) return false;
  return true;
}

/** Same story often appears in /news and its section feed. Keep the first. */
export function dedupe(stories) {
  const seenLink = new Set();
  const seenTitle = new Set();
  const out = [];
  for (const s of stories) {
    const link = (s.link || "").toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
    const title = (s.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (link && seenLink.has(link)) continue;
    if (title && seenTitle.has(title)) continue;
    if (link) seenLink.add(link);
    if (title) seenTitle.add(title);
    out.push(s);
  }
  return out;
}

/**
 * Round-robin across feeds, respecting each feed's `max`, so the final list is
 * a spread rather than whatever the busiest section happened to publish.
 */
export function balance(stories, total) {
  const byFeed = new Map();
  for (const s of stories) {
    if (!byFeed.has(s.feed)) byFeed.set(s.feed, []);
    byFeed.get(s.feed).push(s);
  }
  const order = activeFeeds().map((f) => f.id).filter((id) => byFeed.has(id));
  const taken = new Map(order.map((id) => [id, 0]));
  const out = [];
  let round = 0;
  let guard = 0;

  while (out.length < total && guard++ < 500) {
    let addedThisRound = false;
    for (const id of order) {
      if (out.length >= total) break;
      const list = byFeed.get(id);
      const cap = feedById(id)?.max ?? Infinity;
      if (taken.get(id) >= cap) continue;
      const item = list[round];
      if (!item) continue;
      out.push(item);
      taken.set(id, taken.get(id) + 1);
      addedThisRound = true;
    }
    if (!addedThisRound) break;
    round++;
  }

  // If caps left us short of the budget, top up with whatever is left over
  if (out.length < total) {
    const chosen = new Set(out);
    for (const s of stories) {
      if (out.length >= total) break;
      if (!chosen.has(s)) out.push(s);
    }
  }
  return out;
}
