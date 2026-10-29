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
  { id: "news",     label: "Top stories",   index: "/news",            catIr: "Nuacht",      section: "eire",        on: true, max: 7, verified: true },
  { id: "ireland",  label: "Ireland",       index: "/news/ireland",    catIr: "Éire",        section: "eire",        on: true, max: 9, verified: false },
  { id: "politics", label: "Politics",      index: "/news/politics",   catIr: "Polaitíocht", section: "eile",        on: true, max: 4, verified: true },
  { id: "business", label: "Business",      index: "/news/business",   catIr: "Gnó",         section: "eile",        on: true, max: 3, verified: true },
  { id: "world",    label: "World",         index: "/news/world",      catIr: "Domhan",      section: "domhan",      on: true, max: 6, verified: false },

  // --- sport ----------------------------------------------------------
  // All four land in the one Spórt tab; each story keeps its finer label
  // (Peil, Iomáint, Sacar, Rugbaí) in the gold category line.
  { id: "sport",    label: "Sport",         index: "/sport",           catIr: "Spórt",       section: "sport",       on: true, max: 4, verified: true },
  { id: "gaa",      label: "GAA",           index: "/sport/gaa",       catIr: "CLG",         section: "sport",       on: true, max: 4, verified: false },
  { id: "soccer",   label: "Soccer",        index: "/sport/soccer",    catIr: "Sacar",       section: "sport",       on: true, max: 2, verified: true },
  { id: "rugby",    label: "Rugby",         index: "/sport/rugby",     catIr: "Rugbaí",      section: "sport",       on: true, max: 2, verified: true },

  // --- culture, entertainment, lifestyle ------------------------------
  // Mixed into one Saol tab the same way sport is.
  { id: "culture",  label: "Culture",       index: "/culture",         catIr: "Cultúr",      section: "eile",        on: true, max: 3, verified: true },
  { id: "ents",     label: "Entertainment", index: "/entertainment",   catIr: "Siamsaíocht", section: "eile",        on: true, max: 2, verified: true },
  { id: "life",     label: "Lifestyle",     index: "/lifestyle",       catIr: "Saol",        section: "eile",        on: true, max: 3, verified: true },
];


/** How many items to read from each feed before filtering. */
export const FETCH_PER_FEED = 100;   // the whole feed: RTÉ's order is not date order

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

/** A story at most this old counts as today's news (hours before the run). */
export const FRESH_HOURS = 24;

/**
 * Places per site tab in a day of 30, about what the feeds' caps gave before
 * (two weeks to 2026-10-29: Éire 7, Domhan 4.4, Spórt 9, Eile 9.5). Scaled
 * for any other total.
 */
export const SECTION_SHARE = { eire: 7, domhan: 5, sport: 9, eile: 9 };

const ageHours = (s, now) => {
  const t = Date.parse(s.published);
  return Number.isNaN(t) ? 0 : (now - t) / 36e5;   // no date: treat as fresh
};

/**
 * The day's selection: each tab gets its share, from today's news first.
 *
 * RTÉ's feeds are in its own editorial order, not date order, and a quiet
 * feed (GAA in the off season) can be days old all the way down. For each
 * tab (the story's own section, as on the site), in turn:
 *   1. round-robin across the feeds with stories for it, each up to its
 *      `max`, taking only stories from the last FRESH_HOURS, in RTÉ's order;
 *   2. then any feed's fresh stories past its `max` (a quiet GAA week gives
 *      its places to /sport and /sport/soccer).
 * Then, for a tab still short, older stories newest first; then fresh
 * stories from any tab; then anything. The list comes back in round-robin
 * order across feeds, as before, so the day still opens on /news.
 */
export function balance(stories, total, { now = Date.now() } = {}) {
  const fresh = s => ageHours(s, now) <= FRESH_HOURS;
  const sectionOf = s => s.section || feedById(s.feed)?.section || "eile";
  const order = activeFeeds().map((f) => f.id);
  const cap = id => feedById(id)?.max ?? Infinity;

  // Each feed's stories, fresh first in RTÉ's order, then older by age.
  const byFeed = new Map();
  for (const s of stories) {
    if (!byFeed.has(s.feed)) byFeed.set(s.feed, []);
    byFeed.get(s.feed).push(s);
  }
  for (const [id, list] of byFeed) {
    const older = list.filter(s => !fresh(s)).sort((a, b) => ageHours(a, now) - ageHours(b, now));
    byFeed.set(id, [...list.filter(fresh), ...older]);
    if (!order.includes(id)) order.push(id);
  }
  const feeds = order.filter(id => byFeed.has(id));

  // Shares scaled to `total`, rounding so they add up.
  const shares = {};
  const sum = Object.values(SECTION_SHARE).reduce((a, b) => a + b, 0);
  let left = total;
  const secs = Object.keys(SECTION_SHARE);
  secs.forEach((sec, i) => {
    shares[sec] = i === secs.length - 1 ? left : Math.round(SECTION_SHARE[sec] * total / sum);
    left -= shares[sec];
  });

  const chosen = new Set();
  const taken = new Map(feeds.map(id => [id, 0]));
  const inSection = new Map();
  const add = s => {
    chosen.add(s);
    taken.set(s.feed, taken.get(s.feed) + 1);
    inSection.set(sectionOf(s), (inSection.get(sectionOf(s)) || 0) + 1);
  };
  const full = () => chosen.size >= total;
  const roundRobin = (ok, room) => {
    let added = true;
    while (!full() && added) {
      added = false;
      for (const id of feeds) {
        if (full()) break;
        if (!room(id)) continue;
        const next = byFeed.get(id).find(s => !chosen.has(s) && ok(s));
        if (next) { add(next); added = true; }
      }
    }
  };
  const under = sec => (inSection.get(sec) || 0) < (shares[sec] ?? 0);

  for (const sec of secs) {
    const mine = s => sectionOf(s) === sec && under(sec);
    roundRobin(s => fresh(s) && mine(s), id => taken.get(id) < cap(id));      // 1
    roundRobin(s => fresh(s) && mine(s), () => true);                          // 2
  }
  for (const sec of secs) {
    roundRobin(s => sectionOf(s) === sec && under(sec), id => taken.get(id) < cap(id));
  }
  roundRobin(fresh, () => true);
  roundRobin(() => true, () => true);

  // Back into round-robin order across feeds, as the day used to come out.
  const rank = new Map();
  for (const id of feeds) byFeed.get(id).filter(s => chosen.has(s)).forEach((s, i) => rank.set(s, i));
  const out = [...chosen].sort((a, b) =>
    rank.get(a) - rank.get(b) || feeds.indexOf(a.feed) - feeds.indexOf(b.feed));
  return out;
}
