import { useState, useEffect } from "react";
// Single source of truth for RTÉ categories, shared with scripts/generate.js.
// Pure ESM with no Node APIs, so Vite bundles it for the browser fine.
import { catInfo } from "../scripts/categories.js";
// The county list the generator already maintains. Vite bundles JSON directly,
// so no extra fetch, and it works for backfilled archive stories too.
import places from "../scripts/places.json";

const C = {
  navy: "#0d2137",
  amber: "#e8951e",
  bg: "#f4f1ec",
  card: "#ffffff",
  border: "#e8e2d9",
  text: "#111111",
  muted: "#6b6460",
  faint: "#a8a29a",
  blue: "#2563eb",
  blueLight: "#eff6ff",
};

// Toolbar sections. Each story falls into exactly one, which decides the tab
// it appears under. `cats` lists the Irish category labels that belong here,
// so Spórt gathers Peil, Iomáint, Sacar and Rugbaí, and Eile gathers everything
// that does not warrant its own tab. Either way each story still shows its own
// finer label in gold.
//
// Five fixed tabs, no overflow menu: they fit a 320px phone without scrolling.
// To promote something out of Eile, give it its own entry here and remove its
// categories from the eile list.
//
// generate.js writes a `section` field onto every story, so this map is only
// consulted for the built-in fallback stories and for older archive files.
// Categories and their sections live in scripts/categories.js, imported above.
const SECTIONS = [
  { id: "inniu",  label: "Inniu"  },
  { id: "eire",   label: "Éire"   },
  { id: "sport",  label: "Spórt"  },
  { id: "domhan", label: "Domhan" },
  { id: "eile",   label: "Eile"   },
];

// How many stories the Inniu tab shows.
const HOMEPAGE_COUNT = 6;

// A section tab wants at least this many stories. If today's pull is short, we
// top it up from the archive rather than showing a nearly empty tab.
const MIN_PER_SECTION = 6;
const TARGET_PER_SECTION = 8;
// How far back to look when topping up. Four days keeps things recent enough
// that a story still feels like news.
const BACKFILL_DAYS = 4;

// Eile is the catch-all, so an RTÉ category nobody has mapped yet still shows
// up somewhere sensible instead of being quietly filed under Éire.
const sectionOf = s => {
  // Written by generate.js from today onwards
  if (s.section) return s.section;
  // Archive files predate that field but do carry the raw RTÉ category, so a
  // story tagged "Europe" still reaches Domhan rather than being filed under
  // Éire because its categoryIr was baked as the generic "Nuacht".
  const info = catInfo(s.category);
  if (info) return info[1];
  return "eile";
};

// County names that are also ordinary English words or first names. A bare
// match on these produces nonsense ("stepped down" becoming An Dún), so they
// only count when the text actually says "Co" or "County" in front.
const RISKY_PLACES = new Set(["down", "clare", "bray", "lu", "sord", "laois", "ennis", "naas", "meath", "mayo"]);

// Longest first, so "londonderry" wins over "derry". Compiled once.
const PLACE_RX = Object.keys(places)
  .filter(k => k !== "ireland")
  .sort((a, b) => b.length - a.length)
  .map(k => ({
    ir: places[k],
    risky: RISKY_PLACES.has(k),
    re: new RegExp(`(^|\\s)(co |county )?${k}(\\s|$)`),
  }));

function placeIn(text) {
  if (!text) return null;
  const t = " " + text.toLowerCase().replace(/[^a-z\s]/g, " ") + " ";
  for (const p of PLACE_RX) {
    const m = t.match(p.re);
    if (m && (!p.risky || m[2])) return p.ir;
  }
  return null;
}

// Labels too broad to be worth repeating down a whole tab. When one of these
// comes up we look for a county in the story and show that instead, so Éire
// reads AN CLÁR, LIATROIM, PORT LÁIRGE rather than ÉIRE eight times over.
// Domhan is deliberately NOT here: county names are Irish, and a world story
// that happens to mention Cork should not end up labelled CORCAIGH.
const BROAD_LABELS = new Set(["Éire", "Ulaidh", "Laighin", "An Mhumhain", "Connachta", "Nuacht"]);

// Gold label on the card. Prefer the freshly resolved category so older archive
// stories show AN EORAIP rather than the generic NUACHT they were saved with,
// then sharpen a broad label into a county where the story names one.
const displayCat = s => {
  const info = catInfo(s.category);
  const label = (info && info[0]) || s.categoryIr || "Nuacht";
  if (!BROAD_LABELS.has(label)) return label;
  // Headline first; only the opening of the summary, so a passing mention
  // further down cannot hijack the label.
  return placeIn(s.title) || placeIn((s.summary || "").slice(0, 200)) || label;
};

/** Stories for a tab. Inniu gets a spread across sections, newest first. */
function storiesForSection(stories, sectionId) {
  if (sectionId !== "inniu") {
    return stories.filter(s => sectionOf(s) === sectionId).sort(byNewest);
  }
  // Round-robin the sections so the homepage is never all one topic
  const buckets = new Map();
  for (const s of [...stories].sort(byNewest)) {
    const k = sectionOf(s);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const order = SECTIONS.filter(sec => sec.id !== "inniu" && buckets.has(sec.id)).map(sec => sec.id);
  const out = [];
  for (let round = 0; out.length < HOMEPAGE_COUNT && round < 20; round++) {
    let added = false;
    for (const id of order) {
      if (out.length >= HOMEPAGE_COUNT) break;
      const item = buckets.get(id)[round];
      if (item) { out.push(item); added = true; }
    }
    if (!added) break;
  }
  return out;
}

/** Only show tabs that actually have something, plus Inniu. */
function availableSections(stories) {
  const present = new Set(stories.map(sectionOf));
  return SECTIONS.filter(sec => sec.id === "inniu" || present.has(sec.id));
}

/**
 * Top up thin sections from the archive.
 *
 * A newly-enabled feed takes a few days to build depth, and some sections are
 * just quiet. Rather than show a tab with two stories in it, we pull the last
 * few days and fill any section that is under MIN_PER_SECTION up to
 * TARGET_PER_SECTION. Today's stories always sort first, so the top of every
 * tab stays current and the older ones sit underneath with their real age.
 *
 * Runs after first paint, so it never delays today's stories appearing.
 */
async function backfillThinSections(todayStories) {
  const base = import.meta.env.BASE_URL;

  const counts = {};
  for (const s of todayStories) counts[sectionOf(s)] = (counts[sectionOf(s)] || 0) + 1;
  const thin = SECTIONS
    .filter(sec => sec.id !== "inniu" && (counts[sec.id] || 0) > 0 && (counts[sec.id] || 0) < MIN_PER_SECTION)
    .map(sec => sec.id);
  if (!thin.length) return [];

  // Don't re-add anything already on the page
  const seen = new Set();
  for (const s of todayStories) {
    if (s.link) seen.add(s.link.toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, ""));
    if (s.title) seen.add(s.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  }

  const added = [];
  const need = { ...counts };
  const today = new Date();

  for (let d = 1; d <= BACKFILL_DAYS; d++) {
    if (!thin.some(id => (need[id] || 0) < TARGET_PER_SECTION)) break;
    const dt = new Date(today);
    dt.setDate(today.getDate() - d);
    const key = dt.toISOString().slice(0, 10);
    let data;
    try {
      const r = await fetch(`${base}data/archive/${key}.json`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      data = await r.json();
    } catch { continue; }

    for (const s of data.stories || []) {
      const sec = sectionOf(s);
      if (!thin.includes(sec)) continue;
      if ((need[sec] || 0) >= TARGET_PER_SECTION) continue;
      const link = (s.link || "").toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, "");
      const title = (s.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if ((link && seen.has(link)) || (title && seen.has(title))) continue;
      if (link) seen.add(link);
      if (title) seen.add(title);
      // Re-id so React keys can't collide with today's story-N ids
      added.push({ ...s, id: `${key}-${s.id}`, published: s.published || `${key}T09:00:00.000Z` });
      need[sec] = (need[sec] || 0) + 1;
    }
  }
  return added;
}

const byNewest = (a, b) =>
  new Date(b.published || 0).getTime() - new Date(a.published || 0).getTime();

const CAT_MAP = {
  ireland: "Éire", sport: "Spórt", politics: "Polaitíocht",
  business: "Gnó", entertainment: "Siamsaíocht", world: "Domhan",
  health: "Sláinte", science: "Eolaíocht", technology: "Teicneolaíocht",
  culture: "Cultúr", weather: "Aimsir", travel: "Taisteal",
  dublin: "Baile Átha Cliath", hurling: "Iomáint", football: "Peil",
  rugby: "Rugbaí", election: "Toghchán", crime: "Coireacht",
  court: "Cúirt", housing: "Tithíocht", education: "Oideachas",
  environment: "Comhshaol", economy: "Eacnamaíocht", arts: "Ealaíon",
};

const FALLBACK_STORIES = [
  {
    id: "f1", title: "Government Announces Ambitious New Housing Plan",
    summary: "The Irish government has unveiled a major new housing strategy, promising to build fifty thousand homes over the next three years. The plan focuses heavily on affordable housing in Dublin, Cork, and Galway, where rents have reached record highs. The Taoiseach said the plan would be the largest state investment in housing since the 1970s.",
    category: "Ireland", categoryIr: "Éire", timeAgo: "2h ago",
    levels: {
      10: "The Irish [[rialtas|government]] has unveiled a major new [[straitéis|strategy]], promising to build fifty thousand [[tithe|homes]] over the next three years. The [[plean|plan]] focuses on affordable [[tithíocht|housing]] in Dublin, Cork, and Galway.",
      25: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a major new [[straitéis|strategy]], promising to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]]. The [[plean|plan]] focuses on affordable [[tithíocht|housing]] where [[cíosanna|rents]] have reached [[taifead|record]] highs.",
      50: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a major new [[straitéis|strategy]], [[gealltanas|promising]] to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]]. The [[plean|plan]] [[dírithe|focuses]] on [[tithíocht inacmhainne|affordable housing]] in Dublin, Cork, and Galway, where [[cíosanna|rents]] have reached [[taifead|record]] highs.",
      75: "Tá an [[rialtas|government]] [[Éireannach|Irish]] tar éis [[straitéis|strategy]] nua a [[nochtadh|unveil]], ag [[gealltanas|promising]] caoga míle [[teach|home]] a [[tógáil|build]] thar na trí [[blianta|years]] amach romhainn. Tá [[fócas|focus]] ar [[tithíocht inacmhainne|affordable housing]] i mBaile Átha Cliath, Corcaigh, agus Gaillimh.",
      100: "Tá an [[rialtas|government]] [[Éireannach|Irish]] tar éis [[straitéis|strategy]] mhór nua a [[nochtadh|unveil]], ag [[gealltanas|promising]] caoga míle [[teach|home]] a [[tógáil|build]] thar na trí [[blianta|years]] amach [[romhainn|ahead]]. Tá [[fócas|focus]] ar [[tithíocht inacmhainne|affordable housing]] i mBaile Átha Cliath, Corcaigh, agus Gaillimh, áit a bhfuil [[cíosanna|rents]] ag [[ardú|rising]] go [[mór|greatly]].",
    }
  },
  {
    id: "f2", title: "Leinster Rugby Reach Champions Cup Quarterfinals",
    summary: "Leinster Rugby secured their place in the Champions Cup quarterfinals with a dominant performance against Toulouse at the Aviva Stadium on Friday night. Two first-half tries put Leinster firmly in control, and despite a spirited Toulouse comeback, the Irish province held on to win by eleven points.",
    category: "Sport", categoryIr: "Spórt", timeAgo: "4h ago",
    levels: {
      10: "Leinster [[rugbaí|Rugby]] secured their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a dominant [[cluiche|performance]] against Toulouse at the Aviva [[Staidiam|Stadium]] on Friday night.",
      25: "Leinster [[rugbaí|Rugby]] [[dhaingniú|secured]] their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a [[ceannasach|dominant]] [[cluiche|performance]] against Toulouse. Two [[úide|tries]] in the first [[leath|half]] put Leinster in [[smacht|control]].",
      50: "Leinster [[rugbaí|Rugby]] [[dhaingniú|secured]] their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a [[ceannasach|dominant]] [[cluiche|performance]] against Toulouse. Two [[úide|tries]] in the first [[leath|half]] put Leinster in [[smacht|control]], and the Irish [[cúige|province]] [[coinneáil|held]] on to [[buaigh|win]] by eleven [[pointe|points]].",
      75: "[[Dhaingniú|Secured]] Leinster [[rugbaí|Rugby]] a [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[ceannasach|dominant]] in éadan Toulouse. [[Chuir|put]] dhá [[úide|try]] sa chéad [[leath|half]] Leinster i [[smacht|control]], agus [[bhuaigh|won]] an [[cúige|province]] [[Éireannach|Irish]] faoi dheireadh.",
      100: "[[Dhaingniú|Secured]] Leinster [[rugbaí|Rugby]] a [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[ceannasach|dominant]] in [[éadan|against]] Toulouse ag an Aviva [[Staidiam|Stadium]]. [[Chuir|put]] dhá [[úide|try]] sa [[chéad|first]] [[leath|half]] Leinster i [[smacht|control]], agus [[bhuaigh|won]] an [[cúige|province]] [[Éireannach|Irish]] ar [[fad|all]].",
    }
  },
  {
    id: "f3", title: "Wild Atlantic Way Voted Top European Scenic Drive",
    summary: "Ireland's Wild Atlantic Way has been voted the best scenic drive in Europe by a leading travel magazine, beating routes in Norway, Scotland, and the Amalfi Coast. The 2,500 kilometre route stretches from Donegal to Cork, passing through some of the most dramatic coastline on the continent.",
    category: "Travel", categoryIr: "Taisteal", timeAgo: "6h ago",
    levels: {
      10: "Ireland's Wild Atlantic Way has been voted the best scenic [[tiomáint|drive]] in Europe, [[buaigh|beating]] [[bealaí|routes]] in Norway, Scotland, and the Amalfi Coast.",
      25: "Ireland's Wild Atlantic Way has been [[vótáilte|voted]] the best [[radharcach|scenic]] [[tiomáint|drive]] in Europe, beating [[bealaí|routes]] in Norway, Scotland, and the Amalfi [[Cósta|Coast]].",
      50: "Ireland's Wild Atlantic Way has been [[vótáilte|voted]] the best [[radharcach|scenic]] [[tiomáint|drive]] in Europe, [[buaigh|beating]] [[bealaí|routes]] in Norway and Scotland. The [[bealach|route]] [[síneann|stretches]] from Donegal to Cork, passing through [[cósta|coastline]] [[drámatúil|dramatic]].",
      75: "Tá Wild Atlantic Way na hÉireann [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]]. [[Síneann|stretches]] an [[bealach|route]] 2,500 [[ciliméadar|kilometre]] ó Dhún na nGall go Corcaigh.",
      100: "Tá Wild Atlantic Way na [[hÉireann|Ireland]] [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]]. [[Síneann|stretches]] an [[bealach|route]] 2,500 [[ciliméadar|kilometre]] ó Dhún na nGall go Corcaigh, ag [[dul|passing]] tríd an [[gcósta|coastline]] is [[drámatúla|dramatic]] ar an [[Mór-roinn|continent]].",
    }
  },
  {
    id: "f4", title: "New Irish Language Tech Hub Opens in Galway",
    summary: "A new technology centre dedicated entirely to Irish language software and artificial intelligence has officially opened in Galway city. Over one hundred jobs have been created, with another fifty expected by the end of the year. The Minister for the Gaeltacht described it as a landmark moment for the language.",
    category: "Technology", categoryIr: "Teicneolaíocht", timeAgo: "8h ago",
    levels: {
      10: "A new [[teicneolaíocht|technology]] [[ionad|centre]] dedicated to Irish language [[bogearraí|software]] has opened in Galway. Over one hundred [[poist|jobs]] have been created.",
      25: "A new [[teicneolaíocht|technology]] [[ionad|centre]] [[dírithe|dedicated]] to Irish language [[bogearraí|software]] and [[intleacht shaorga|artificial intelligence]] has [[oscailte|opened]] in Galway, creating over one hundred new [[poist|jobs]].",
      50: "[[Osclaíodh|Opened]] [[ionad teicneolaíochta|technology centre]] nua i nGaillimh [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[intleacht shaorga|artificial intelligence]]. [[Cruthaíodh|created]] níos mó ná céad [[post|job]] nua sa [[réigiún|region]].",
      75: "[[Osclaíodh|Opened]] [[ionad|centre]] [[teicneolaíochta|technology]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[intleacht shaorga|artificial intelligence]]. [[Cruthaíodh|created]] níos mó ná céad [[post|job]] nua.",
      100: "[[Osclaíodh|Opened]] [[ionad|centre]] [[teicneolaíochta|technology]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[intleacht shaorga|artificial intelligence]]. [[Cruthaíodh|created]] níos mó ná céad [[post|job]] nua, agus [[táthar ag súil|expected]] le caoga eile [[faoi|by]] [[deireadh|end]] na [[bliana|year]].",
    }
  },
  {
    id: "f5", title: "Record Numbers Visit National Museums This Year",
    summary: "Irish national museums and galleries have recorded their highest ever visitor numbers, with more than four million people passing through their doors since January. Officials credited free admission, improved facilities, and a growing interest in Irish history and culture.",
    category: "Culture", categoryIr: "Cultúr", timeAgo: "10h ago",
    levels: {
      10: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have recorded their highest ever [[cuairteoir|visitor]] numbers, with more than four million [[daoine|people]] since January.",
      25: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have [[taifeadta|recorded]] their highest ever [[cuairteoir|visitor]] numbers, with more than four million [[daoine|people]] since January.",
      50: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]], le níos mó ná ceithre milliún [[duine|person]] ó [[Eanáir|January]].",
      75: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]] i [[mbliana|this year]]. [[Luaigh|credited]] [[oifigigh|officials]] [[iontráil saor in aisce|free admission]] agus [[suim|interest]] ag [[fás|growing]] sa [[stair|history]] [[Éireannach|Irish]].",
      100: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na [[hÉireann|Ireland]] tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]] i [[mbliana|this year]], le níos mó ná ceithre [[milliún|million]] [[duine|person]] ó [[Eanáir|January]].",
    }
  },
  {
    id: "f6", title: "Met Éireann Forecasts Warmest June in Decades",
    summary: "Met Éireann has forecast an exceptionally warm and dry June, with temperatures expected to reach twenty-six degrees in parts of the country. Meteorologists say a high pressure system over the Atlantic is responsible, and the settled spell could persist well into July.",
    category: "Weather", categoryIr: "Aimsir", timeAgo: "12h ago",
    levels: {
      10: "Met Éireann has forecast an exceptionally warm and dry [[Meitheamh|June]], with [[teochtaí|temperatures]] expected to reach twenty-six [[céim|degrees]] in parts of the [[tír|country]].",
      25: "Met Éireann has [[réamhaisnéisithe|forecast]] an exceptionally [[te|warm]] and [[tirim|dry]] [[Meitheamh|June]], with [[teochtaí|temperatures]] expected to reach twenty-six [[céim|degrees]] in [[codanna|parts]] of the [[tír|country]].",
      50: "Tá Met Éireann tar éis [[Meitheamh|June]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]].",
      75: "Tá Met Éireann tar éis [[Meitheamh|June]] [[eisceachtúil|exceptional]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]] don [[tír|country]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] na [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]].",
      100: "Tá Met Éireann tar éis [[Meitheamh|June]] [[eisceachtúil|exceptional]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]] don [[tír|country]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] na [[teochtaí|temperatures]] fiche a sé [[céim|degrees]], rud a [[dhéanfadh|would make]] é ar cheann de na [[Meitheamh|Junes]] is [[teo|hottest]] le [[scór bliain|twenty years]].",
    }
  },
];

const VISIBLE_LEVELS = ["10", "25", "50"];
const SNAP_LEVELS = [10, 25, 50];
const LEVELS_CONFIG = [
  { pct: 10, label: "Beginner", color: "#16a34a", bg: "#f0fdf4", tip: "Key nouns only" },
  { pct: 25, label: "Foundation", color: "#2563eb", bg: "#eff6ff", tip: "Nouns and verbs" },
  { pct: 50, label: "Intermediate", color: "#d97706", bg: "#fffbeb", tip: "Most content words" },
];
// Locked levels shown as funding goals (slider positions 3 and 4)
const LOCKED_LEVELS = [
  { pct: 75, label: "Advanced" },
  { pct: 100, label: "As Gaeilge" },
];

const getLevel = pct => LEVELS_CONFIG.find(l => l.pct === pct) || LEVELS_CONFIG[0];
const getIrCat = c => { if (!c) return "Nuacht"; const l = c.toLowerCase(); for (const [k, v] of Object.entries(CAT_MAP)) if (l.includes(k)) return v; return "Nuacht"; };
const msAgo = d => { const m = Math.floor((Date.now() - d) / 60000); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };

// Compute "time ago" live from a story's publish time so it stays accurate
// however long after generation the page is viewed. Falls back to the stored
// string for older data that has no `published` field.
const storyTimeAgo = s => {
  if (s.published) {
    const t = new Date(s.published).getTime();
    if (!isNaN(t)) return msAgo(t);
  }
  return s.timeAgo || "";
};

function parseText(text) {
  const parts = [], re = /\[\[([^\|]+)\|([^\]]+)\]\]/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "en", v: text.slice(last, m.index) });
    parts.push({ t: "ir", irish: m[1], english: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "en", v: text.slice(last) });
  return parts;
}

function speakWord(word) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "ga-IE"; u.rate = 0.8;
  window.speechSynthesis.speak(u);
}

async function fetchTodayContent() {
  // today.json keeps the same filename every day, so unlike the content-hashed
  // JS bundle it will happily sit in the browser and CDN cache after a deploy,
  // leaving people looking at yesterday's stories. "no-cache" does not disable
  // caching, it forces a revalidation: a cheap 304 when nothing has changed,
  // and fresh data the moment the morning run has been.
  const r = await fetch(`${import.meta.env.BASE_URL}data/today.json`, {
    cache: "no-cache",
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error("not found");
  return await r.json();
}

// ---------------------------------------------------------------------
// Posted-story record
//
// The export page knows exactly which story went to Instagram and exactly
// which corrected words appeared on the card, but until now it threw that
// away as soon as the PNGs were generated. We keep it instead, keyed by
// date, so Focail na Seachtaine reads back seven posts rather than seven
// days of thirty unposted stories.
//
// localStorage is the working copy. public/data/posted.json is the durable
// copy: download the records and commit that file so the history survives a
// cleared browser or a different machine.
// ---------------------------------------------------------------------
const POSTED_KEY = "ds-posted";

function loadPostedLocal() {
  try { return JSON.parse(localStorage.getItem(POSTED_KEY) || "{}"); } catch { return {}; }
}

function savePostedLocal(date, record) {
  const all = loadPostedLocal();
  all[date] = record;
  try { localStorage.setItem(POSTED_KEY, JSON.stringify(all)); } catch {}
}

function lastNDateKeys(days) {
  const keys = [];
  const today = new Date();
  for (let d = 0; d < days; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - d);
    keys.push(dt.toISOString().slice(0, 10));
  }
  return keys;
}

// A word is only worth offering if it survives these. Same spirit as the old
// archive filters, but multi-word English is allowed through now, since merged
// adjective plus noun pairs are exactly the ones worth teaching.
function usableWord(irish, english, places) {
  if (!irish || !english) return false;
  if (/\d/.test(irish) || /\d/.test(english)) return false;
  if (WEEK_STOP.has(english.toLowerCase())) return false;
  if (english.length < 4 || irish.length < 3) return false;
  if (irish.toLowerCase() === english.toLowerCase()) return false;
  if (/[()[\]{}]/.test(irish)) return false;
  if (english.split(/\s+/).length > 3) return false;
  if (places.has(english.toLowerCase())) return false;   // county and place names
  return true;
}

const WEEK_STOP = new Set(["the","a","an","to","of","in","on","at","by","for","and","or","but","with","as","is","are","was","were","be","been","has","had","have","it","its","this","that","these","those","about","from","into","over","under","after","before","they","them","their","he","she","his","her","you","we","our","i"]);

// Rank the words that actually went out this week. A word that carried the
// headline, or turned up across several days, has earned its slide.
function wordsFromRecords(records, verified, places) {
  const seen = new Map();
  records.forEach(rec => {
    const headline = new Set((rec.headlineWords || []).map(s => s.toLowerCase()));
    (rec.words || []).forEach(w => {
      const irish = (w.irish || "").trim();
      const english = (w.english || "").trim();
      if (!usableWord(irish, english, places)) return;
      const k = irish.toLowerCase();
      const prev = seen.get(k);
      if (prev) {
        prev.days += 1;
        prev.inHeadline = prev.inHeadline || headline.has(k);
      } else {
        seen.set(k, {
          irish, english,
          verified: verified.has(english.toLowerCase()),
          days: 1,
          inHeadline: headline.has(k),
          date: rec.date,
          title: rec.title,
        });
      }
    });
  });
  return [...seen.values()].sort((a, b) =>
    (b.inHeadline - a.inHeadline) ||
    (b.days - a.days) ||
    (b.verified - a.verified) ||
    a.irish.localeCompare(b.irish)
  );
}

// Pull the last `days` archived story files and collect unique Irish words used.
// Marks each word verified if its English appears in the published overrides list.
async function fetchWeekWords(days = 7) {
  const base = import.meta.env.BASE_URL;
  let verified = new Set();
  let places = new Set();
  try {
    const vr = await fetch(`${base}data/verified.json`, { cache: "no-cache", signal: AbortSignal.timeout(5000) });
    if (vr.ok) (await vr.json()).forEach(s => verified.add(s.toLowerCase()));
  } catch {}
  try {
    const pr = await fetch(`${base}data/places.json`, { cache: "no-cache", signal: AbortSignal.timeout(5000) });
    if (pr.ok) Object.keys(await pr.json()).forEach(s => places.add(s.toLowerCase()));
  } catch {}

  // Committed history first, then this browser's records on top of it.
  let posted = {};
  try {
    const rr = await fetch(`${base}data/posted.json`, { cache: "no-cache", signal: AbortSignal.timeout(5000) });
    if (rr.ok) posted = await rr.json();
  } catch {}
  posted = { ...posted, ...loadPostedLocal() };

  const records = lastNDateKeys(days).map(k => posted[k]).filter(Boolean);
  if (records.length) {
    return { source: "posted", days: records.length, words: wordsFromRecords(records, verified, places) };
  }

  // Nothing recorded yet, so fall back to the old archive sweep.
  verified = new Set([...verified, ...places]);
  return { source: "archive", days: 0, words: await scanArchiveWords(days, verified, base) };
}

async function scanArchiveWords(days, verified, base) {

  // Common English function words we never want as "words of the week"
  const STOP = new Set(["the","a","an","to","of","in","on","at","by","for","and","or","but","with","as","is","are","was","were","be","been","has","had","have","it","its","this","that","these","those","about","from","into","over","under","after","before","they","them","their","he","she","his","her","you","we","our","i"]);

  const seen = new Map(); // irish(lower) -> {irish, english, verified}
  const today = new Date();
  for (let d = 0; d < days; d++) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - d);
    const key = dt.toISOString().slice(0, 10);
    try {
      const r = await fetch(`${base}data/archive/${key}.json`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const data = await r.json();
      (data.stories || []).forEach(story => {
        // Only the levels the site actually shows. Older archive files also
        // carry 75 and 100, produced by a generator whose word alignment was
        // off by one, so every gloss in them is attached to the wrong word.
        // Reading those would poison the word suggestions.
        VISIBLE_LEVELS.forEach(lv => {
          const levelText = (story.levels || {})[lv];
          if (!levelText) return;
          const re = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
          let m;
          while ((m = re.exec(levelText)) !== null) {
            const irish = m[1].trim(), english = m[2].trim();
            const k = irish.toLowerCase();
            const ek = english.toLowerCase();
            // Quality filters: skip numbers, stop-words, too-short, and junk
            if (!irish || !english) continue;
            if (/\d/.test(irish) || /\d/.test(english)) continue;       // numbers like "1970idí"
            if (STOP.has(ek)) continue;                                  // function words
            if (english.length < 4 || irish.length < 3) continue;       // too short to be useful
            if (irish.toLowerCase() === ek) continue;                    // untranslated
            if (/[()\[\]{}]/.test(irish)) continue;                      // leftover junk
            if (english.split(/\s+/).length > 1) continue;              // single words only
            if (!seen.has(k)) {
              seen.set(k, { irish, english, verified: verified.has(ek) });
            }
          }
        });
      });
    } catch {}
  }
  // Verified first, then alphabetical
  return [...seen.values()].sort((a, b) => (b.verified - a.verified) || a.irish.localeCompare(b.irish));
}

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ display: "inline-block", width: 28, height: 28, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.navy}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

function WordChip({ part, active, onToggle }) {
  const [hover, setHover] = useState(false);
  // Only real mice hover. A tap on a touchscreen fires a mouse event too, and
  // acting on it would pop the tooltip open before the click is registered.
  const show = active || hover;
  return (
    <span style={{ position: "relative", display: "inline" }}>
      <span onClick={onToggle}
        onPointerEnter={e => { if (e.pointerType === "mouse") setHover(true); }}
        onPointerLeave={() => setHover(false)}
        style={{
        cursor: "pointer",
        color: show ? "#1d4ed8" : C.blue,
        fontWeight: 600,
        textDecoration: "underline",
        textDecorationColor: show ? "#1d4ed8" : "#93c5fd",
        textDecorationThickness: "1.5px",
        textUnderlineOffset: "3px",
        background: show ? C.blueLight : "transparent",
        borderRadius: 3,
        padding: "0 2px",
        transition: "all 0.1s",
      }}>
        {part.irish}
      </span>
      {show && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: C.navy, color: "#fff", borderRadius: 8, padding: "8px 12px",
          whiteSpace: "nowrap", zIndex: 20, boxShadow: "0 8px 32px rgba(13,33,55,0.2)",
          fontSize: "0.82rem", fontFamily: "system-ui, sans-serif",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontWeight: 600 }}>{part.english}</span>
          <button onClick={e => { e.stopPropagation(); speakWord(part.irish); }}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer", color: "#fff", fontSize: "0.8rem" }}>
            🔊
          </button>
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `5px solid ${C.navy}` }} />
        </span>
      )}
    </span>
  );
}

/**
 * Section toolbar. Five fixed tabs, sized to their content and spread across
 * the width, so it fits a 320px phone with no sideways scroll and nothing
 * moves around between taps.
 */
function SectionBar({ sections, active, onSelect }) {
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50, margin: "0 -20px",
      background: "rgba(255,255,255,0.97)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        maxWidth: 640, margin: "0 auto", display: "flex",
        alignItems: "stretch", justifyContent: "space-between",
        padding: "0 8px",
      }}>
        {sections.map(sec => {
          const on = active === sec.id;
          return (
            <button key={sec.id} onClick={() => onSelect(sec.id)}
              style={{
                // Natural width, not equal shares: equal shares ellipsise the
                // longer labels on a narrow phone.
                flex: "0 1 auto", minWidth: 0, background: "none", border: "none",
                padding: "13px 6px 11px", cursor: "pointer", position: "relative",
                fontFamily: "system-ui, sans-serif", fontSize: "clamp(0.56rem,2.5vw,0.68rem)",
                fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                color: on ? C.navy : C.faint,
                whiteSpace: "nowrap", transition: "color 0.15s",
              }}>
              {sec.label}
              {on && <span style={{
                position: "absolute", left: 6, right: 6, bottom: 0,
                height: 3, background: C.amber, borderRadius: "2px 2px 0 0",
              }} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// One story in the list. Identical on mobile whatever its position; on desktop
// the lead gets a bigger headline and the grid cells drop their summary, both
// driven by CSS classes on the containers rather than by measuring the window.
/**
 * Cut a summary at the last sentence that fits. RTÉ summaries run anywhere from
 * 500 to 3,000 characters, so the lead needs a limit, but ending mid-word on an
 * ellipsis looks broken. Ending on a full stop reads as a paragraph.
 */
function trimToSentence(text, max) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (end > max * 0.4) return cut.slice(0, end + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut) + "…";
}

function StoryRow({ story, index, onClick, showSummary = true, noBorder = false, fullSummary = false, lead = false }) {
  return (
    <div className="ds-story" onClick={() => onClick(story)}
      style={{
        padding: "20px 0",
        borderBottom: noBorder ? "none" : `1px solid ${C.border}`,
        cursor: "pointer",
        animation: `fadeIn ${0.1 + index * 0.04}s ease`,
      }}
      onMouseEnter={e => e.currentTarget.querySelector("h3").style.color = C.blue}
      onMouseLeave={e => e.currentTarget.querySelector("h3").style.color = C.text}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: "0.65rem", fontFamily: "system-ui, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: C.amber }}>{displayCat(story)}</span>
        <span style={{ color: C.faint, fontSize: "0.7rem", fontFamily: "system-ui, sans-serif" }}>{storyTimeAgo(story)}</span>
      </div>
      <h3 style={{
        margin: "0 0 10px",
        fontSize: lead ? "clamp(1.15rem, 3.4vw, 2.5rem)" : "clamp(1rem,2.8vw,1.15rem)",
        lineHeight: lead ? 1.12 : 1.3,
        letterSpacing: lead ? "-0.015em" : "normal",
        fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", transition: "color 0.15s",
      }}>{story.title}</h3>
      {lead && showSummary && (
        <p className="ds-summary" style={{ margin: 0, fontSize: "0.82rem", color: C.muted, lineHeight: 1.6, fontFamily: "system-ui, sans-serif" }}>
          {trimToSentence(story.summary, 460)}
        </p>
      )}
      {!lead && showSummary && (
        <p className="ds-summary" style={{
          margin: 0, fontSize: "0.82rem", color: C.muted, lineHeight: 1.6, fontFamily: "system-ui, sans-serif",
          ...(fullSummary
            ? {}
            : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }),
        }}>{story.summary}</p>
      )}
    </div>
  );
}

function FeedView({ stories, loading, onStoryClick, sectionLabel, highlights = false }) {
  const [lead, ...rest] = stories;

  return (
    <div className={highlights ? "ds-highlights" : undefined}>
      {loading && <Spinner />}

      {!loading && stories.length === 0 && (
        <div style={{ padding: "56px 10px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontSize: "1.6rem", marginBottom: 10 }}>📭</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "1rem", color: C.navy, fontWeight: 700, marginBottom: 6 }}>
            Faic anseo inniu
          </div>
          <div style={{ fontSize: "0.82rem", color: C.muted, lineHeight: 1.6 }}>
            No {sectionLabel} stories in today's pull. Try another section.
          </div>
        </div>
      )}

      {!loading && lead && (
        <>
          <div className="ds-lead-title-wrap">
            <StoryRow story={lead} index={0} onClick={onStoryClick} fullSummary lead />
          </div>

          <div className="ds-grid">
            {rest.map((s, i) => (
              <StoryRow key={s.id} story={s} index={i + 1} onClick={onStoryClick} />
            ))}
          </div>
        </>
      )}

      <div style={{ paddingTop: 32, textAlign: "center", fontFamily: "system-ui, sans-serif", fontSize: "0.7rem", color: C.faint, lineHeight: 1.9 }}>
        <div>News from RTÉ · Updated daily</div>
        <div>Created by <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer" style={{ color: C.navy, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>Joe Luca Dooley</a></div>
        <div style={{ height: "1rem" }} />
      </div>
    </div>
  );
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Find the largest font size (within a range) where the headline fits in maxLines
function fitHeadline(ctx, text, maxWidth, maxLines, maxSize, minSize, weight = "bold") {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px Georgia, serif`;
    const lines = wrapCanvasText(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return { size, lines, lineHeight: Math.round(size * 1.18) };
    }
  }
  // Doesn't fit even at min size — use min and clamp the lines
  ctx.font = `${weight} ${minSize}px Georgia, serif`;
  return { size: minSize, lines: wrapCanvasText(ctx, text, maxWidth).slice(0, maxLines), lineHeight: Math.round(minSize * 1.18) };
}

// Cover slide — opening card with date and the lead headline (keeps the grid varied)
// Cover slide. headlineParts is an array of {text, irish:bool} segments so we can
// render a few Irish words in amber within an otherwise English headline.
function makeCoverCanvas(leadStory, headlineParts) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d2137";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  // Logo centred near top
  ctx.font = "bold 72px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.fillText("Daily ", startX, 200);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 200);

  // Date
  const dateStr = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
  ctx.textAlign = "center";
  ctx.font = "32px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText(dateStr, W / 2, 250);

  // Tagline
  ctx.font = "italic 42px Georgia, serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Cad é an scéal?", W / 2, 372);
  ctx.font = "26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("Today's news, as Gaeilge", W / 2, 414);
  ctx.textAlign = "left";

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 480, W - 160, 1);

  // Headline. Build a flat word list with colour from headlineParts (or plain title).
  const parts = (headlineParts && headlineParts.length)
    ? headlineParts
    : [{ text: leadStory.title, irish: false }];
  const words = [];
  parts.forEach(p => {
    p.text.split(/(\s+)/).forEach(tok => {
      if (!tok || /^\s+$/.test(tok)) return;
      words.push({ token: tok, irish: p.irish });
    });
  });

  // Find a font size where the headline fits in up to 6 lines
  const maxW = W - 160;
  let size = 66, lineHeight = 78, lines = [];
  for (size = 66; size >= 40; size -= 2) {
    ctx.font = `bold ${size}px Georgia, serif`;
    lineHeight = Math.round(size * 1.18);
    lines = [];
    let cur = [];
    let curW = 0;
    for (const w of words) {
      const wW = ctx.measureText(w.token + " ").width;
      if (curW + wW > maxW && cur.length) { lines.push(cur); cur = []; curW = 0; }
      cur.push(w); curW += wW;
    }
    if (cur.length) lines.push(cur);
    if (lines.length <= 6) break;
  }

  // Draw the headline lines, colouring Irish words amber
  ctx.font = `bold ${size}px Georgia, serif`;
  const startY = 620;
  lines.forEach((line, li) => {
    let x = 80;
    const y = startY + li * lineHeight;
    line.forEach(w => {
      ctx.fillStyle = w.irish ? "#e8951e" : "#ffffff";
      ctx.fillText(w.token, x, y);
      x += ctx.measureText(w.token + " ").width;
    });
  });

  // Swipe hint
  ctx.textAlign = "center";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Swipe to translate  →", W / 2, H - 110);
  ctx.textAlign = "left";

  return canvas;
}

// Parse a headline written with [[irish|english]] markers into coloured parts.
// Plain text (no markers) just becomes one English part.
function parseHeadlineParts(text) {
  const parts = [];
  let last = 0;
  const re = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), irish: false });
    parts.push({ text: m[1], irish: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), irish: false });
  return parts;
}


// Closing slide — single call to action
function makeClosingCanvas() {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d2137";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.textAlign = "center";

  // Logo
  ctx.font = "bold 72px Georgia, serif";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Daily ", startX, 480);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 480);
  ctx.textAlign = "center";

  // Main CTA
  ctx.font = "44px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Read the full stories at", W / 2, 620);
  ctx.fillText("your own level of Irish.", W / 2, 680);

  // URL
  ctx.font = "bold 38px Arial, sans-serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("joelucadooley.github.io/daily-sceal", W / 2, 800);

  // Follow line
  ctx.font = "30px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Follow @dailysceal for a little Irish each day", W / 2, 900);

  ctx.textAlign = "left";
  return canvas;
}

// Weekly recap — cover slide (cream background to distinguish from daily news)
function makeWeeklyCoverCanvas() {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.font = "bold 72px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.fillText("Daily ", startX, 200);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 200);

  ctx.textAlign = "center";
  ctx.font = "italic 56px Georgia, serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Focail na Seachtaine", W / 2, 620);
  ctx.font = "34px Arial, sans-serif";
  ctx.fillStyle = "rgba(13,33,55,0.55)";
  ctx.fillText("Words from this week's news", W / 2, 685);

  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillStyle = "#0d2137";
  ctx.fillText("Can you guess them?  →", W / 2, H - 120);
  ctx.textAlign = "left";
  return canvas;
}

// Weekly recap — a "guess" slide (Irish word alone) or "reveal" slide (with English)
function makeWordSlideCanvas(word, index, reveal) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  // Small logo top-left
  ctx.font = "bold 38px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  const d1 = ctx.measureText("Daily ").width;
  ctx.fillText("Daily ", 80, 90);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", 80 + d1, 90);

  ctx.textAlign = "center";

  // The Irish word/phrase sits centred. Multi-word phrases wrap to lines at a
  // readable size; a single long word shrinks to fit instead.
  const IRISH_Y = 560;
  const maxW = W - 140;

  // Fit text: step down font sizes; at each size wrap into lines and use the
  // first size where every wrapped line fits within maxW.
  function fitLines(text, startSize, minSize, weight) {
    for (let size = startSize; size >= minSize; size -= 4) {
      ctx.font = `${weight} ${size}px Georgia, serif`;
      const words = text.split(/\s+/);
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      if (lines.every(l => ctx.measureText(l).width <= maxW)) return { size, lines };
    }
    ctx.font = `${weight} ${minSize}px Georgia, serif`;
    return { size: minSize, lines: text.split(/\s+/) };
  }

  const fit = fitLines(word.irish, 92, 36, "bold");
  ctx.font = `bold ${fit.size}px Georgia, serif`;
  ctx.fillStyle = "#e8951e";
  const irishLH = Math.round(fit.size * 1.15);
  const irishStartY = IRISH_Y - ((fit.lines.length - 1) * irishLH) / 2;
  fit.lines.forEach((l, i) => ctx.fillText(l, W / 2, irishStartY + i * irishLH));
  const irishBottom = irishStartY + (fit.lines.length - 1) * irishLH;

  if (reveal) {
    ctx.fillStyle = "rgba(13,33,55,0.12)";
    ctx.fillRect(W / 2 - 120, irishBottom + 60, 240, 2);
    const ef = fitLines(word.english, 58, 28, "");
    ctx.font = `${ef.size}px Georgia, serif`;
    ctx.fillStyle = "#0d2137";
    const engLH = Math.round(ef.size * 1.15);
    ef.lines.forEach((l, i) => ctx.fillText(l, W / 2, irishBottom + 180 + i * engLH));
  } else {
    ctx.font = "32px Arial, sans-serif";
    ctx.fillStyle = "rgba(13,33,55,0.45)";
    ctx.fillText("What does it mean?", W / 2, irishBottom + 140);
    ctx.font = "bold 30px Arial, sans-serif";
    ctx.fillStyle = "#0d2137";
    ctx.fillText("Swipe to reveal  →", W / 2, H - 120);
  }

  ctx.textAlign = "left";
  return canvas;
}

// Weekly recap — closing slide (cream background)
function makeWeeklyClosingCanvas() {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.textAlign = "center";
  ctx.font = "bold 64px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.textAlign = "left";
  ctx.fillText("Daily ", startX, 520);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 520);
  ctx.textAlign = "center";

  ctx.font = "44px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  ctx.fillText("A new story every day,", W / 2, 660);
  ctx.fillText("as Gaeilge.", W / 2, 720);

  ctx.font = "30px Arial, sans-serif";
  ctx.fillStyle = "rgba(13,33,55,0.5)";
  ctx.fillText("Follow @dailysceal · link in bio", W / 2, 840);
  ctx.textAlign = "left";
  return canvas;
}


// Standalone share-card generator, used by both the article page and the export page
function makeShareCanvas(story, parts, levelLabel) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d2137";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.font = "bold 56px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Daily ", 80, 118);
  const dw = ctx.measureText("Daily ").width;
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", 80 + dw, 118);

  const dateStr = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
  ctx.font = "30px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText(dateStr, 80, 162);

  ctx.textAlign = "right";
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Cad é an scéal?", W - 80, 110);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 188, W - 160, 1);

  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText((story.categoryIr || "Nuacht").toUpperCase(), 80, 244);

  ctx.font = "bold 60px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  const fitted = fitHeadline(ctx, story.title, W - 160, 4, 60, 38);
  ctx.font = `bold ${fitted.size}px Georgia, serif`;
  fitted.lines.forEach((l, i) => ctx.fillText(l, 80, 316 + i * fitted.lineHeight));
  const headBottom = 316 + fitted.lines.length * fitted.lineHeight;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, headBottom + 14, W - 160, 1);

  const textY = headBottom + 60;
  const lineH = 56;
  const maxLines = Math.floor((H - textY - 150) / lineH);
  ctx.font = "36px Georgia, serif";

  const words = [];
  parts.forEach((part, pi) => {
    const isIrish = part.t === "ir";
    const raw = isIrish ? part.irish : (part.v || "");
    for (const token of raw.split(/(\s+)/)) {
      if (!token || /^\s+$/.test(token)) continue;
      words.push({ token, isIrish, pi });
    }
  });

  let fitCount = 0, simX = 80, simLines = 0;
  for (let i = 0; i < words.length; i++) {
    const w = ctx.measureText(words[i].token + " ").width;
    if (simX + w > W - 80) { simX = 80; simLines++; if (simLines >= maxLines) break; }
    simX += w;
    fitCount = i + 1;
  }

  let endIndex = fitCount;
  for (let i = fitCount - 1; i >= 0; i--) {
    if (/[.!?]$/.test(words[i].token)) { endIndex = i + 1; break; }
  }

  // Record which Irish parts actually appear on the card, so callers can
  // limit word lists and captions to visible words only
  const visible = new Set();
  for (let i = 0; i < endIndex; i++) {
    if (words[i].isIrish) visible.add(words[i].pi);
  }
  canvas._visibleIrishParts = visible;

  let x = 80, y = textY;
  for (let i = 0; i < endIndex; i++) {
    const { token, isIrish } = words[i];
    const w = ctx.measureText(token + " ").width;
    if (x + ctx.measureText(token).width > W - 80) { x = 80; y += lineH; }
    ctx.fillStyle = isIrish ? "#e8951e" : "rgba(255,255,255,0.82)";
    ctx.fillText(token, x, y);
    x += w;
  }

  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(levelLabel, 80, H - 72);
  ctx.textAlign = "right";
  ctx.font = "26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText("joelucadooley.github.io/daily-sceal", W - 80, H - 72);
  ctx.textAlign = "left";

  return canvas;
}

function ReadingView({ story, onBack }) {
  const [pct, setPct] = useState(10);
  const [activeWord, setActiveWord] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const level = getLevel(pct);
  const locked = pct >= 75;
  const parts = parseText(story.levels[pct] || story.summary);
  const irishCount = parts.filter(p => p.t === "ir").length;

  async function generateShareImage() {
    const levelName = pct === 100 ? "As Gaeilge" : (level?.label || "Beginner");
    return makeShareCanvas(story, parts, levelName);
  }

  async function handleShare() {
    setShareLoading(true);
    try {
      const canvas = await generateShareImage();
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      const file = new File([blob], "daily-sceal.png", { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: story.title });
      } else {
        // Desktop: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "daily-sceal.png"; a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Fallback to URL share
      try {
        if (navigator.share) await navigator.share({ title: story.title, url: story.link || "https://joelucadooley.github.io/daily-sceal" });
        else await navigator.clipboard?.writeText(story.link || "https://joelucadooley.github.io/daily-sceal");
      } catch {}
    } finally {
      setShareLoading(false);
    }
  }

  // Unique Irish words in the order they appear, for the desktop side panel.
  const panelWords = [];
  const panelSeen = new Set();
  parts.forEach(p => {
    if (p.t !== "ir") return;
    const k = p.irish.toLowerCase();
    if (panelSeen.has(k)) return;
    panelSeen.add(k);
    panelWords.push({ irish: p.irish, english: p.english });
  });

  return (
    <div className="ds-read" style={{ animation: "fadeIn 0.2s ease" }}>
     <div className="ds-read-head">
      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
          ← Nuacht
        </button>
      </div>

      {/* Headline */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: "0.65rem", fontFamily: "system-ui, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: C.amber, marginBottom: 10 }}>{story.categoryIr}</div>
        <h1 style={{ margin: "0 0 8px", color: C.navy, fontSize: "clamp(1.3rem,4vw,1.75rem)", lineHeight: 1.2, fontFamily: "Georgia, serif", fontWeight: 700 }}>{story.title}</h1>
        <div style={{ fontSize: "0.72rem", color: C.faint, fontFamily: "system-ui, sans-serif" }}>{storyTimeAgo(story)}</div>
      </div>
     </div>

     <div className="ds-article">
      {/* Level selector */}
      <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 700, color: locked ? "#9ca3af" : level.color }}>{pct === 100 ? "As Gaeilge" : pct === 75 ? "Advanced" : level.label}</span>
          <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.72rem", color: C.faint }}>{locked ? "A funding goal" : level.tip}</span>
        </div>
        <div style={{ position: "relative", marginBottom: 10, display: "flex", alignItems: "center" }}>
          <input type="range" min={0} max={4} step={1}
            value={pct === 100 ? 4 : pct === 75 ? 3 : SNAP_LEVELS.indexOf(pct)}
            onChange={e => {
              const val = +e.target.value;
              if (val === 4) setPct(100);
              else if (val === 3) setPct(75);
              else setPct(SNAP_LEVELS[val]);
              setActiveWord(null);
            }}
            style={{ width: "100%", cursor: "pointer" }}
            className="sceal-range" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "system-ui, sans-serif", fontSize: "0.63rem", color: C.faint, marginBottom: 12 }}>
          <span>More English</span><span>More Irish</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {LEVELS_CONFIG.map(l => (
            <button key={l.pct}
              onClick={() => { setPct(l.pct); setActiveWord(null); }}
              style={{
                flex: "1 1 auto",
                background: pct === l.pct ? l.bg : "transparent",
                color: pct === l.pct ? l.color : C.faint,
                border: `1px solid ${pct === l.pct ? l.color + "60" : C.border}`,
                borderRadius: 6, padding: "6px 2px", cursor: "pointer",
                fontFamily: "system-ui, sans-serif", fontSize: "0.62rem", fontWeight: 600,
                transition: "all 0.12s",
              }}>
              {l.label}
            </button>
          ))}
          {LOCKED_LEVELS.map(l => (
            <button key={l.pct}
              onClick={() => { setPct(l.pct); setActiveWord(null); }}
              style={{
                flex: "1 1 auto",
                background: pct === l.pct ? "#f3f4f6" : "transparent",
                color: pct === l.pct ? "#6b7280" : "#d1d5db",
                border: `1px dashed ${pct === l.pct ? "#9ca3af" : "#e5e7eb"}`,
                borderRadius: 6, padding: "6px 2px", cursor: "pointer",
                fontFamily: "system-ui, sans-serif", fontSize: "0.62rem", fontWeight: 600,
                transition: "all 0.12s",
              }}>
              🔒 {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Article */}
      {locked ? (
        <>
          <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 0", filter: "blur(4px)", userSelect: "none", pointerEvents: "none", opacity: 0.5, maxHeight: "4.5rem", overflow: "hidden" }}>
              <div style={{ fontSize: "clamp(1rem,2.3vw,1.06rem)", lineHeight: 2, color: C.text, fontFamily: "Georgia, serif" }}>
                {parseText(story.levels[50] || story.summary).map((p, i) =>
                  p.t === "en" ? <span key={i}>{p.v}</span> :
                    <span key={i} style={{ color: C.blue, fontWeight: 600 }}>{p.irish}</span>
                )}
              </div>
            </div>
            <div style={{ padding: "24px 24px 28px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 12 }}>🔒</div>
              <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: "1.05rem", color: C.navy, fontWeight: 700 }}>{pct === 100 ? "As Gaeilge" : "Advanced"}</h3>
              <p style={{ margin: "0 0 16px", fontFamily: "Georgia, serif", fontSize: "0.88rem", color: C.muted, lineHeight: 1.7 }}>
                Accurate Irish at this level requires specialist linguistic resources that are currently beyond the scope of this project. It is a goal I am actively seeking support to reach.
              </p>
              <a href="https://ko-fi.com/joelucadooley" target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", background: C.amber, color: "#fff", borderRadius: 8, padding: "10px 20px", fontFamily: "system-ui, sans-serif", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none" }}>
                Support the project
              </a>
            </div>
            <div style={{ padding: "16px 20px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none", opacity: 0.5, maxHeight: "6rem", overflow: "hidden" }}>
              <div style={{ fontSize: "clamp(1rem,2.3vw,1.06rem)", lineHeight: 2, color: C.text, fontFamily: "Georgia, serif" }}>
                {parseText(story.levels[50] || story.summary).map((p, i) =>
                  p.t === "en" ? <span key={i}>{p.v}</span> :
                    <span key={i} style={{ color: C.blue, fontWeight: 600 }}>{p.irish}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ height: "1.5rem" }} />
        </>
      ) : (
        <>
          <div className="ds-body-card" style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "22px 20px" }} key={pct}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.72rem", color: C.muted }}>
                <span style={{ color: C.blue, fontWeight: 600 }}>{irishCount}</span> Irish {irishCount === 1 ? "word" : "words"} in this story
              </span>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.68rem", color: C.faint, fontStyle: "italic" }}>focail Ghaeilge</span>
            </div>
            <div style={{ fontSize: "clamp(1rem,2.3vw,1.06rem)", lineHeight: 2, color: C.text, fontFamily: "Georgia, serif", marginBottom: 18 }}>
              {parts.map((p, i) =>
                p.t === "en" ? <span key={i}>{p.v}</span> :
                  <WordChip key={i} part={p} active={activeWord === i} onToggle={() => setActiveWord(a => a === i ? null : i)} />
              )}
            </div>
            <div style={{ paddingTop: 14, borderTop: `1px solid ${C.border}`, fontFamily: "system-ui, sans-serif", fontSize: "0.73rem", color: C.faint }}>
              Tap any <span style={{ color: C.blue, fontWeight: 600 }}>blue word</span> to see the English and hear it spoken
            </div>
          </div>
          <button className="ds-share" onClick={handleShare} disabled={shareLoading}
            style={{ width: "100%", marginTop: 14, background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontFamily: "system-ui, sans-serif", fontSize: "0.88rem", fontWeight: 600, cursor: shareLoading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: shareLoading ? 0.6 : 1 }}>
            {shareLoading ? "Ag ullmhú..." : "Roinn · Share ↗"}
          </button>
          {story.link && (
            <a href={story.link} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, color: C.muted, fontFamily: "system-ui, sans-serif", fontSize: "0.78rem", textDecoration: "none" }}>
              Léigh ar RTÉ →
            </a>
          )}
          <div className="ds-tail" style={{ height: "1.5rem" }} />
        </>
      )}
     </div>

      {/* Desktop only. A running list of the Irish in this story, English
          hidden until you ask, so you can read straight through and check
          without losing your place in the text. */}
      <WordPanel words={panelWords} />
    </div>
  );
}

/**
 * The translations panel. Rebuilt whenever the level changes, since the words
 * in the story change with it. Hidden below 1000px by CSS, so the phone never
 * renders it.
 */
function WordPanel({ words }) {
  const [shown, setShown] = useState({});
  const [allOpen, setAllOpen] = useState(false);

  // A new level means a new word list, so forget what was revealed.
  useEffect(() => { setShown({}); setAllOpen(false); }, [words.map(w => w.irish).join("|")]);

  if (!words.length) return null;

  const isOpen = i => allOpen || !!shown[i];

  return (
    <aside className="ds-panel">
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, overflow: "hidden" }}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: "Georgia, serif", color: C.navy, fontSize: "0.95rem" }}>Focail an scéil</div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.68rem", color: C.faint, marginTop: 3 }}>
            {words.length} {words.length === 1 ? "word" : "words"} · click to reveal
          </div>
        </div>

        <div style={{ maxHeight: "52vh", overflowY: "auto" }}>
          {words.map((w, i) => (
            <div key={w.irish + i} onClick={() => setShown(o => ({ ...o, [i]: !o[i] }))}
              style={{
                padding: "10px 16px",
                borderBottom: i === words.length - 1 ? "none" : `1px solid ${C.border}`,
                cursor: "pointer",
                background: isOpen(i) ? C.blueLight : "transparent",
                transition: "background 0.12s",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: C.blue, fontWeight: 600, fontSize: "0.88rem", fontFamily: "Georgia, serif" }}>{w.irish}</span>
                <button onClick={e => { e.stopPropagation(); speakWord(w.irish); }}
                  title={`Éist le ${w.irish}`}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", padding: 0, opacity: 0.55 }}>
                  🔊
                </button>
              </div>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: isOpen(i) ? "0.78rem" : "0.72rem", color: isOpen(i) ? C.muted : C.faint, fontStyle: isOpen(i) ? "normal" : "italic", marginTop: 2 }}>
                {isOpen(i) ? w.english : "click to reveal"}
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => { setAllOpen(o => !o); setShown({}); }}
          style={{ width: "100%", background: "#fdfcfa", border: "none", borderTop: `1px solid ${C.border}`, padding: "11px 16px", fontFamily: "system-ui, sans-serif", fontSize: "0.73rem", color: C.muted, cursor: "pointer", textAlign: "left" }}>
          {allOpen ? "Hide all" : "Reveal all"}
        </button>
      </div>
    </aside>
  );
}

function AboutView() {
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      <div style={{ paddingBottom: 28, borderBottom: `1px solid ${C.border}`, marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: "1.5rem", color: C.navy, fontWeight: 700, letterSpacing: "-0.01em" }}>Faoi Daily Scéal</h2>
        <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: "1rem", color: C.muted, lineHeight: 1.7, fontStyle: "italic" }}>
          Irish as it appears in the real world, every morning.
        </p>
      </div>

      <div style={{ fontFamily: "Georgia, serif", fontSize: "0.95rem", color: "#333", lineHeight: 1.85, marginBottom: 28 }}>
        <p style={{ margin: "0 0 16px" }}>
          Daily Scéal takes real news from RTÉ and lets you read it at whatever level of Irish you like. A slider moves the balance from mostly English at one end towards fully Irish at the other. Tap any blue word to see what it means and hear it spoken.
        </p>
        <p style={{ margin: 0 }}>
          The idea behind the slider comes from research into how people pick up languages. You learn best when you can follow most of what you are reading but still meet enough new words to stretch you. Each level is built around that.
        </p>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "0.95rem", color: C.navy, marginBottom: 8 }}>Lean ar Instagram</div>
        <p style={{ margin: "0 0 16px", fontFamily: "Georgia, serif", fontSize: "0.9rem", color: C.muted, lineHeight: 1.7 }}>
          A story from the day, as Gaeilge, posted daily. Follow along for a little Irish in your feed.
        </p>
        <a href="https://instagram.com/dailysceal" target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", background: C.navy, color: "#fff", borderRadius: 8, padding: "10px 18px", fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
          @dailysceal →
        </a>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "0.95rem", color: C.navy, marginBottom: 8 }}>Free and open</div>
        <p style={{ margin: "0 0 16px", fontFamily: "Georgia, serif", fontSize: "0.9rem", color: C.muted, lineHeight: 1.7 }}>
          Daily Scéal is free to use and built by Joe Luca Dooley. The code is open for anyone to see on GitHub. If you would like to help it grow, you can support the project below.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: C.navy, color: "#fff", borderRadius: 8, padding: "10px 18px", fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
            View on GitHub →
          </a>
          <a href="https://ko-fi.com/joelucadooley" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: C.amber, color: "#fff", borderRadius: 8, padding: "10px 18px", fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
            Support Joe Luca 🍻
          </a>
        </div>
      </div>

      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.7rem", color: C.faint, lineHeight: 1.9, paddingBottom: 8 }}>
        News sourced from RTÉ · New stories daily
      </div>
    </div>
  );
}

function ExportView({ stories }) {
  // --- Daily single-story workflow ---
  const [pct, setPct] = useState(10);
  const [storyIdx, setStoryIdx] = useState(0);
  // Which section tab the picker is filtered to. "all" shows everything.
  const [pickSection, setPickSection] = useState("all");
  const [cardText, setCardText] = useState("");
  const [textCopied, setTextCopied] = useState(false);
  const [bothCopied, setBothCopied] = useState(false);
  const [pasteOk, setPasteOk] = useState(false);
  const [coverHeadline, setCoverHeadline] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [hook, setHook] = useState("");
  const [cards, setCards] = useState([]);
  const [copiedCard, setCopiedCard] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // --- Weekly recap state ---
  const [enText, setEnText] = useState("");
  const [gaText, setGaText] = useState("");
  const [wordPairs, setWordPairs] = useState([]);
  const [weeklyImages, setWeeklyImages] = useState([]);
  const [translating, setTranslating] = useState(false);
  const [weekSuggestions, setWeekSuggestions] = useState([]);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [picked, setPicked] = useState({});
  const [verifiedEng, setVerifiedEng] = useState(new Set());
  const [weekSource, setWeekSource] = useState(null);
  const [postedCount, setPostedCount] = useState(0);

  useEffect(() => { setPostedCount(Object.keys(loadPostedLocal()).length); }, []);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    (async () => {
      const set = new Set();
      try {
        const vr = await fetch(`${base}data/verified.json`, { cache: "no-cache", signal: AbortSignal.timeout(5000) });
        if (vr.ok) (await vr.json()).forEach(s => set.add(s.toLowerCase()));
      } catch {}
      try {
        const pr = await fetch(`${base}data/places.json`, { cache: "no-cache", signal: AbortSignal.timeout(5000) });
        if (pr.ok) Object.keys(await pr.json()).forEach(s => set.add(s.toLowerCase()));
      } catch {}
      setVerifiedEng(set);
    })();
  }, []);
  const levelLabel = LEVELS_CONFIG.find(l => l.pct === pct)?.label || "Beginner";

  // ---------------------------------------------------------------------
  // Caption building
  //
  // Everything below is seeded from the day of the year, so regenerating on
  // the same day gives the same caption, but tomorrow's is different. The
  // pools are stepped by different offsets so the cover line, the closing CTA
  // and the hashtags don't all rotate in lockstep.
  // ---------------------------------------------------------------------
  const daySeed = () => {
    const now = new Date();
    return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  };
  const pickFor = (arr, offset) => arr[(daySeed() + offset) % arr.length];

  // Slide 1. Deliberately does NOT restate the headline: it is already on the
  // image, so repeating it wastes the one line people actually read. No link
  // push here either, that lives on slide 3.
  const HOOK_SUGGESTIONS = [
    "One story, a few new focail. That's the deal.",
    "Today's scéal, and the words to go with it.",
    "A bit of Irish hiding in today's news.",
    "Read the news, pick up a few words on the way.",
    "Today's story, at whatever level of Irish suits you.",
    "Some focail worth stealing from today's headlines.",
    "Your daily bit of Gaeilge, straight from the news.",
  ];
  const defaultHook = () => pickFor(HOOK_SUGGESTIONS, 0);

  // Build slide 1's line out of the story itself without restating the
  // headline. Two ingredients, both already to hand: the place the story is
  // about (via the same place list the gold labels use, so it comes out in
  // Irish) and the strongest noun from the markers. Whichever are available
  // decide which pool of templates we draw from; the plain lines above are
  // the fallback when a story offers neither.
  function storyHook(story, words) {
    const w = (words && words.length) ? keyWords(words, 1)[0] : null;
    const ir = w && w.irish;
    const en = w && w.english;
    const place = placeIn((story && story.title) || "");

    if (place && ir) {
      return pickFor([
        `${place} in the news today, and ${ir} is the word to take from it.`,
        `Today's scéal comes from ${place}. Start with ${ir}, meaning ${en}.`,
        `${place} today. One word worth keeping: ${ir} (${en}).`,
        `Something from ${place} this morning, plus ${ir} for the notebook.`,
      ], 1);
    }
    if (ir) {
      // two of these open the sentence with the Irish word, so it needs a capital
      const Ir = ir.charAt(0).toUpperCase() + ir.slice(1);
      return pickFor([
        `New word from today's news: ${ir}, meaning ${en}.`,
        `${Ir} means ${en}. Here's the story it turned up in.`,
        `One to take away from today's scéal: ${ir} (${en}).`,
        `Today's story, and the word ${ir} to go with it.`,
        `${Ir} (${en}) is doing the heavy lifting in today's story.`,
      ], 1);
    }
    return defaultHook();
  }

  // Slide 2 tail. Mentions the site but leaves the actual CTA to slide 3.
  const TRANS_TAILS = [
    "Every other word is glossed on the site.",
    "The rest of the translations are waiting on the site.",
    "More words in the full story on the site.",
    "The whole piece is glossed, word by word, on the site.",
    "Every marker in the article is translated on the site.",
  ];

  // Slide 3. The only slide carrying the link.
  const CLOSING_CTAS = [
    "That's one of today's stories. The rest are on the site, at whatever level of Irish you like. Link in bio 🔗",
    "Every story and every translation is on the site. Slide from Béarla to as Gaeilge. Link in bio 🔗",
    "A new scéal every day, glossed word by word. Pick your level on the site. Link in bio 🔗",
    "There's more where this came from. Real news, your level of Irish. Link in bio 🔗",
    "Today's other stories are all up on the site, translated as you read. Link in bio 🔗",
    "Read the whole thing as Gaeilge, or half of it. Your call. Link in bio 🔗",
  ];

  // Hashtags: never more than 5. Two always-on, then anything topical for the
  // story's category, then the rotating pool fills the rest.
  const CORE_TAGS = ["#gaeilge", "#dailyscéal"];
  const ROTATING_TAGS = [
    "#irishlanguage", "#ireland", "#nuacht", "#foghlaimgaeilge",
    "#gaeilgegachlá", "#irish", "#éire", "#learnirish",
  ];
  const TOPICAL_TAGS = {
    "Spórt": ["#spórt"], "Peil": ["#peil", "#gaa"], "Iomáint": ["#iomáint", "#gaa"],
    "CLG": ["#gaa"], "Camógaíocht": ["#camógaíocht", "#gaa"], "Sacar": ["#sacar"],
    "Rugbaí": ["#rugbaí"], "Dornálaíocht": ["#dornálaíocht"],
    "Polaitíocht": ["#polaitíocht"], "Gnó": ["#gnó"], "Eacnamaíocht": ["#gnó"],
    "Domhan": ["#domhan"], "An Eoraip": ["#eoraip"], "An Meánoirthear": ["#domhan"],
    "Cultúr": ["#cultúr"], "Ceol": ["#ceol"], "Siamsaíocht": ["#siamsaíocht"],
    "Sláinte": ["#sláinte"], "Aimsir": ["#aimsir"], "Comhshaol": ["#comhshaol"],
    "Baile Átha Cliath": ["#bac"],
  };
  function hashtagsFor(story) {
    const out = [...CORE_TAGS];
    for (const t of (TOPICAL_TAGS[story && story.categoryIr] || [])) {
      if (out.length < 4 && !out.includes(t)) out.push(t);
    }
    for (let i = 0; out.length < 5 && i < ROTATING_TAGS.length; i++) {
      const t = pickFor(ROTATING_TAGS, i * 3);
      if (!out.includes(t)) out.push(t);
    }
    return out.slice(0, 5).join(" ");
  }

  // Prefer nouns for the three words on slide 2. A concrete noun is worth more
  // to a learner than a participle or a function word, and it reads better in
  // a caption. Order is always the order they appear in the story.
  const CAPTION_STOP = new Set([
    "the", "a", "an", "and", "or", "but", "with", "as", "at", "by", "for",
    "from", "in", "into", "of", "on", "to", "over", "under", "between",
    "already", "also", "always", "never", "today", "later", "now", "then",
    "more", "most", "much", "many", "very", "just", "still", "here", "there",
    "this", "that", "these", "those", "which", "while", "when", "where",
    "is", "are", "was", "were", "be", "been", "has", "had", "have", "will",
    // single-word prepositions and connectives: grammar, not vocabulary
    "within", "without", "through", "throughout", "during", "across",
    "among", "against", "before", "after", "since", "until", "upon",
    "toward", "towards", "above", "below", "beyond", "despite", "per",
    "ahead", "instead", "rather", "together", "anymore", "eventually",
    // Bare verb forms. -ing and -ed are caught by pattern below, but these
    // are not, and a verb makes a poorer caption word than a noun. Purely a
    // heuristic list: extend it when a verb slips through.
    "say", "says", "said", "take", "takes", "took", "make", "makes", "made",
    "give", "gives", "gave", "get", "gets", "got", "go", "goes", "went",
    "come", "comes", "came", "run", "runs", "ran", "win", "wins", "won",
    "put", "puts", "keep", "keeps", "kept", "know", "knows", "knew",
    "seal", "close", "miss", "hurt", "grow", "grows", "set", "sets",
    "publish", "increase", "announce", "announces", "remain", "remains",
    "become", "becomes", "operate", "operates", "mandate", "mandates",
    "fly", "flies", "flew", "hold", "holds", "held", "buy", "buys", "bought",
  ]);
  // English phrases ending in a preposition are grammatical scaffolding
  // ("due to", "ahead of", "look forward to"), never the word a learner wants.
  const TRAILING_PREP = /\b(to|of|for|with|on|in|at|from|than|by|into|onto|about)$/;
  function looksLikeNoun(w) {
    const e = (w.english || "").toLowerCase().trim();
    const ir = (w.irish || "").toLowerCase().trim();
    if (!e) return false;
    if (CAPTION_STOP.has(e)) return false;
    if (TRAILING_PREP.test(e)) return false;
    if (/^(ag|a|i|le|ar|do|de|chun|seachas)\s/.test(ir)) return false; // verbal noun / prep phrase
    if (/^(at\u00e1|t\u00e1|is|n\u00edl|ba)\s/.test(ir)) return false;          // relative / copula forms
    if (/(ing|ed)$/.test(e)) return false;                             // participles
    if (e.split(/\s+/).length > 2) return false;                       // long phrases read badly
    return true;
  }
  function keyWords(words, n = 3) {
    const nouny = words.filter(looksLikeNoun);
    const rest = words.filter(w => !looksLikeNoun(w));
    const chosen = [...nouny, ...rest].slice(0, n);
    // present them in the order they appear in the story, not by preference
    return chosen.sort((a, b) => words.indexOf(a) - words.indexOf(b));
  }

  const SUNDAY_CAPTIONS = [
    "Focail na seachtaine ☘️\n\nA few words from this week's news. Can you guess them before the reveal? Comment your score 💚\n\nRead the news at your own level. Link in bio 🔗",
    "Focail na seachtaine ☘️\n\nSeven days of news, boiled down to a handful of words. How many do you know? 💚\n\nEvery story is on the site. Link in bio 🔗",
    "Focail na seachtaine ☘️\n\nThis week's words. Guess before you swipe, no cheating 💚\n\nRead them in context on the site. Link in bio 🔗",
  ];
  const SUNDAY_CAPTION = pickFor(SUNDAY_CAPTIONS, 0) + "\n\n" + hashtagsFor(stories[storyIdx]);

  function loadStoryText() {
    const story = stories[storyIdx];
    if (!story) return;
    setLoaded(true);
    const text = story.levels[pct] || story.summary;
    setCardText(text);
    setCards([]);
    // Derive the caption line from this story's own markers rather than the
    // headline, which is already on the image.
    const markers = parseText(text)
      .filter(p => p.t === "ir")
      .map(p => ({ irish: p.irish, english: p.english }));
    setHook(storyHook(story, markers));
    // Automatically add Irish to the headline (editable after)
    prepareCoverHeadline();
  }

  function copyCheckText() {
    navigator.clipboard?.writeText(cardText).then(() => {
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 2000);
    });
  }

  // Headline and story in one copy, blank line between them. That blank line is
  // the whole convention: first block is the slide 1 headline, everything after
  // is the slide 2 story. Nothing else about the workflow changes.
  function copyBoth() {
    const both = `${coverHeadline.trim()}\n\n${cardText.trim()}`;
    navigator.clipboard?.writeText(both).then(() => {
      setBothCopied(true);
      setTimeout(() => setBothCopied(false), 2000);
    });
  }

  // Paste the corrected pair back in one go. Splits on the first blank line, so
  // it round-trips whatever copyBoth produced. If there's no blank line we treat
  // the first line as the headline, which is what a lightly-reformatted paste
  // usually looks like.
  function pasteBoth(raw) {
    const text = raw.replace(/\r\n/g, "\n").trim();
    if (!text) return;
    // Split at the first line break of any kind. Taking the first BLANK line
    // would be wrong whenever the pasted headline is followed by a single
    // newline and the story itself contains paragraph breaks: the split would
    // land inside the story instead of after the headline.
    const nl = text.indexOf("\n");
    if (nl === -1) return;            // one line only: nothing to split
    const head = text.slice(0, nl).trim();
    const body = text.slice(nl + 1).trim();
    if (!head || !body) return;
    setCoverHeadline(head);
    setCardText(body);
    setPasteOk(true);
    setTimeout(() => setPasteOk(false), 2000);
  }

  function coverCaption() {
    return `Scéalta an lae ☘️\n\n${(hook || defaultHook()).trim()}\n\n${hashtagsFor(stories[storyIdx])}`;
  }

  function translationsCaption(words) {
    // Nouns preferred, but always listed in the order they appear in the story
    const lines = keyWords(words, 3).map(w => `${w.irish} (${w.english})`).join("\n");
    return `TRANSLATIONS ⬇️\n\n${lines}\n\n${pickFor(TRANS_TAILS, 2)}`;
  }

  function generateCards() {
    const story = stories[storyIdx];
    if (!story || !cardText.trim()) return;
    const coverParts = coverHeadline ? parseHeadlineParts(coverHeadline) : null;
    const parts = parseText(cardText);
    const storyCanvas = makeShareCanvas(story, parts, levelLabel);
    const visible = storyCanvas._visibleIrishParts || new Set();
    const seen = new Set();
    const words = [];
    parts.forEach((p, pi) => {
      if (p.t !== "ir" || !visible.has(pi)) return;
      const k = p.irish.toLowerCase();
      if (!seen.has(k)) { seen.add(k); words.push({ irish: p.irish, english: p.english }); }
    });
    // This is the moment the day's choice is actually made, so write it down.
    // `words` here is the corrected text as it appeared on the card, not
    // generator output, which is what makes the weekly recap trustworthy.
    const dateKey = new Date().toISOString().slice(0, 10);
    savePostedLocal(dateKey, {
      date: dateKey,
      storyId: story.id,
      title: story.title,
      link: story.link,
      level: levelLabel,
      cardText: cardText.trim(),
      headline: coverHeadline || "",
      headlineWords: (coverParts || []).filter(p => p.irish).map(p => p.text.trim().toLowerCase()),
      words,
    });
    setPostedCount(Object.keys(loadPostedLocal()).length);

    setCards([
      { id: "cover", title: "1 · Cover", url: makeCoverCanvas(story, coverParts).toDataURL("image/png"), caption: coverCaption() },
      { id: "story", title: "2 · Story", url: storyCanvas.toDataURL("image/png"), caption: translationsCaption(words) },
      { id: "closing", title: "3 · Closing", url: makeClosingCanvas().toDataURL("image/png"), caption: pickFor(CLOSING_CTAS, 4) },
    ]);
  }

  function copyCardCaption(card) {
    navigator.clipboard?.writeText(card.caption).then(() => {
      setCopiedCard(card.id);
      setTimeout(() => setCopiedCard(null), 2000);
    });
  }

  async function translateOne(word, from, to) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${from}|${to}&de=joelucadooley@gmail.com`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.responseStatus === 200) {
        return data.responseData.translatedText.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim();
      }
    } catch {}
    return "";
  }

  async function translateWords() {
    setTranslating(true);
    const pairs = [];
    for (const line of enText.split("\n").map(s => s.trim()).filter(Boolean)) {
      const irish = await translateOne(line, "en", "ga");
      pairs.push({ english: line.toLowerCase(), irish: (irish || "?").toLowerCase() });
    }
    for (const line of gaText.split("\n").map(s => s.trim()).filter(Boolean)) {
      const english = await translateOne(line, "ga", "en");
      pairs.push({ irish: line.toLowerCase(), english: (english || "?").toLowerCase() });
    }
    setWordPairs(pairs);
    setTranslating(false);
  }

  function updatePair(i, field, value) {
    setWordPairs(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }

  async function prepareCoverHeadline() {
    const story = stories[storyIdx];
    if (!story) return;
    setCoverBusy(true);
    const title = story.title;
    let places = {};
    try {
      const pr = await fetch(`${import.meta.env.BASE_URL}data/places.json`, { cache: "no-cache", signal: AbortSignal.timeout(5000) });
      if (pr.ok) places = await pr.json();
    } catch {}

    const tokens = title.split(/(\s+)/);
    const candidates = [];
    tokens.forEach((tok, i) => {
      const clean = tok.replace(/[^A-Za-z]/g, "");
      const lower = clean.toLowerCase();
      if (places[lower]) {
        candidates.push({ i, clean, place: places[lower] });
      } else if (clean.length >= 5 && /^[a-z]/.test(clean)) {
        candidates.push({ i, clean });
      }
    });
    candidates.sort((a, b) => (b.place ? 1 : 0) - (a.place ? 1 : 0) || b.clean.length - a.clean.length);
    const chosen = candidates.slice(0, 2);
    for (const c of chosen) {
      if (c.place) {
        tokens[c.i] = tokens[c.i].replace(c.clean, `[[${c.place}|${c.clean}]]`);
        continue;
      }
      const irish = await translateOne(c.clean, "en", "ga");
      const ga = (irish || "").toLowerCase().trim();
      const ok = ga && ga !== c.clean.toLowerCase()
        && ga.split(/\s+/).length <= 2
        && !/[()\[\]{}]/.test(ga)
        && !/optional|name|probably|translat|quota/.test(ga)
        && ga.length <= c.clean.length * 4;
      if (ok) {
        tokens[c.i] = tokens[c.i].replace(c.clean, `[[${ga}|${c.clean.toLowerCase()}]]`);
      }
    }
    setCoverHeadline(tokens.join(""));
    setCoverBusy(false);
  }

  async function loadWeekWords() {
    setLoadingWeek(true);
    const res = await fetchWeekWords(7);
    setWeekSuggestions(res.words);
    setWeekSource(res);
    setLoadingWeek(false);
  }

  // Optional backup. On a phone this opens the share sheet, so the file can go
  // to Files, Notes, iCloud or anywhere else in a couple of taps. Not part of
  // the daily routine, just a safety net if the phone storage ever gets wiped.
  async function backupRecords() {
    const json = JSON.stringify(loadPostedLocal(), null, 2);
    const file = new File([json], "posted.json", { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Daily Scéal posts" }); return; } catch {}
    }
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "posted.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function generateWeekly() {
    const pickedWords = weekSuggestions.filter(w => picked[w.irish.toLowerCase()])
      .map(w => ({ irish: w.irish.toLowerCase(), english: w.english.toLowerCase() }));
    const manualWords = wordPairs.filter(w => w.irish && w.english && w.irish !== "?" && w.english !== "?");
    const seen = new Set();
    const words = [...pickedWords, ...manualWords].filter(w => {
      const k = w.irish.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    if (!words.length) return;
    const out = [];
    out.push({ id: "w-cover", title: "Cover", url: makeWeeklyCoverCanvas().toDataURL("image/png") });
    words.forEach((w, i) => {
      out.push({ id: `w-${i}-guess`, title: `${w.irish} (guess)`, url: makeWordSlideCanvas(w, i + 1, false).toDataURL("image/png") });
      out.push({ id: `w-${i}-reveal`, title: `${w.irish} (reveal)`, url: makeWordSlideCanvas(w, i + 1, true).toDataURL("image/png") });
    });
    out.push({ id: "w-closing", title: "Closing", url: makeWeeklyClosingCanvas().toDataURL("image/png") });
    setWeeklyImages(out);
  }

  // Sections present in today's pull, with counts, so the buttons only offer
  // what actually exists and you can see at a glance where the stories are.
  const pickCounts = SECTIONS.filter(sec => sec.id !== "inniu").map(sec => ({
    id: sec.id,
    label: sec.label,
    n: stories.filter(st => sectionOf(st) === sec.id).length,
  })).filter(sec => sec.n > 0);

  // Keep the original index so storyIdx still points into `stories`
  const pickList = stories
    .map((st, i) => ({ st, i }))
    .filter(({ st }) => pickSection === "all" || sectionOf(st) === pickSection);

  // If the current story is filtered out, move to the first one showing
  useEffect(() => {
    if (pickList.length && !pickList.some(v => v.i === storyIdx)) {
      setStoryIdx(pickList[0].i);
      setCardText(""); setCards([]); setCoverHeadline(""); setLoaded(false);
    }
  }, [pickSection]);

  const selectedStory = stories[storyIdx];

  return (
    <div style={{ padding: "20px 0 40px", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ fontFamily: "Georgia, serif", color: C.navy, fontSize: "1.3rem", margin: "0 0 4px" }}>Card Export</h2>
      <p style={{ color: C.muted, fontSize: "0.82rem", margin: "0 0 18px" }}>Private tool. Pick a story, check the text, then generate the three cards and their captions.</p>

      {/* Step 1: story + level */}
      <div style={{ background: "#f8fafc", border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: "0.78rem", color: C.navy, marginBottom: 10 }}>1 · Pick the story</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {LEVELS_CONFIG.map(l => (
            <button key={l.pct} onClick={() => setPct(l.pct)}
              style={{ flex: "1 1 auto", background: pct === l.pct ? l.bg : "transparent", color: pct === l.pct ? l.color : C.faint, border: `1px solid ${pct === l.pct ? l.color + "60" : C.border}`, borderRadius: 6, padding: "7px 2px", cursor: "pointer", fontSize: "0.66rem", fontWeight: 600 }}>
              {l.label}
            </button>
          ))}
        </div>
        {/* Filter the list by section. Counts come from today's pull, so an
            empty section simply does not appear. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {[{ id: "all", label: "Gach ceann", n: stories.length }, ...pickCounts].map(sec => {
            const on = pickSection === sec.id;
            return (
              <button key={sec.id} onClick={() => setPickSection(sec.id)}
                style={{
                  background: on ? C.navy : "transparent",
                  color: on ? "#fff" : C.muted,
                  border: `1px solid ${on ? C.navy : C.border}`,
                  borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                  fontFamily: "system-ui, sans-serif", fontSize: "0.64rem",
                  fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.12s",
                }}>
                {sec.label} {sec.n}
              </button>
            );
          })}
        </div>

        <select value={storyIdx} onChange={e => { setStoryIdx(+e.target.value); setCardText(""); setCards([]); setCoverHeadline(""); setLoaded(false); }}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.8rem", marginBottom: 12, background: "#fff", color: C.text, fontFamily: "system-ui, sans-serif" }}>
          {pickList.map(({ st, i }) => (
            <option key={st.id} value={i}>{st.categoryIr} · {st.title}</option>
          ))}
        </select>
        <button onClick={loadStoryText}
          style={{ width: "100%", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
          Load story text
        </button>
      </div>

      {/* Step 2: check the translations. Headline and story live together now,
          because the copy and paste buttons act on both at once and splitting
          them across two panels made the buttons look like they only applied
          to the story. */}
      {loaded && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", color: "#854d0e", marginBottom: 4 }}>2 · Check the translations</div>
          <div style={{ fontSize: "0.72rem", color: "#a16207", marginBottom: 10 }}>Irish is added automatically. Copy both out to check them, then paste the corrected version back. Irish words use <code>[[irish|english]]</code>.</div>

          {/* Headline and story in one copy, blank line between them. */}
          <button onClick={copyBoth}
            style={{ width: "100%", background: bothCopied ? "#16a34a" : C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", marginBottom: 6 }}>
            {bothCopied ? "Copied ✓" : "Copy headline + story"}
          </button>

          {/* Paste the corrected pair straight back into both boxes. */}
          <button onClick={() => navigator.clipboard?.readText().then(pasteBoth).catch(() => {})}
            style={{ width: "100%", background: pasteOk ? "#16a34a" : "transparent", color: pasteOk ? "#fff" : "#854d0e", border: `1px solid ${pasteOk ? "#16a34a" : "#fde68a"}`, borderRadius: 8, padding: "9px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
            {pasteOk ? "Pasted into both ✓" : "Paste corrected version back"}
          </button>

          {/* --- headline --- */}
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#854d0e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Headline · slide 1</div>
          {coverBusy ? (
            <div style={{ fontSize: "0.78rem", color: C.faint, padding: "8px 0" }}>Adding Irish to the headline...</div>
          ) : (
            <>
              <textarea value={coverHeadline} onChange={e => setCoverHeadline(e.target.value)}
                rows={2}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #fde68a", fontSize: "0.8rem", fontFamily: "monospace", marginBottom: 6, resize: "vertical", boxSizing: "border-box", background: "#fff" }} />
              {(() => {
                const irishWords = parseHeadlineParts(coverHeadline).filter(p => p.irish);
                return irishWords.length > 0 ? (
                  <div style={{ fontSize: "0.72rem", marginBottom: 12 }}>
                    {irishWords.map((p, i) => (
                      <a key={i} href={`https://www.teanglann.ie/en/fgb/${encodeURIComponent(p.text)}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: C.amber, fontWeight: 700, textDecoration: "none", marginRight: 12, borderBottom: `1px solid ${C.border}` }}>
                        {p.text} ↗
                      </a>
                    ))}
                  </div>
                ) : <div style={{ marginBottom: 12 }} />;
              })()}
            </>
          )}

          {/* --- story --- */}
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#854d0e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>Story · slide 2</div>
          <textarea value={cardText} onChange={e => setCardText(e.target.value)}
            rows={8}
            style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #fde68a", fontSize: "0.78rem", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", background: "#fff" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 10 }}>
            <a href="https://github.com/joelucadooley/daily-sceal/edit/main/scripts/overrides.json" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: "0.72rem", color: "#854d0e", fontWeight: 600, textDecoration: "none", borderBottom: "1px solid #fde68a" }}>
              Add permanent fixes to overrides.json ↗
            </a>
            <button onClick={copyCheckText}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "0.72rem", color: textCopied ? "#16a34a" : "#a16207", fontWeight: 600 }}>
              {textCopied ? "Copied ✓" : "Copy story only"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: caption line + generate */}
      {loaded && (
        <div style={{ background: "#f8fafc", border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: "0.78rem", color: C.navy, marginBottom: 4 }}>3 · Slide 1 caption line</div>
          <div style={{ fontSize: "0.72rem", color: C.muted, marginBottom: 8 }}>Auto-filled from the story. Edit to give it a hook, e.g. a question.</div>
          <input value={hook} onChange={e => setHook(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.8rem", boxSizing: "border-box", marginBottom: 12 }} />
          <button onClick={generateCards}
            style={{ width: "100%", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer" }}>
            Generate the 3 cards
          </button>
        </div>
      )}

      {cards.map(card => (
        <div key={card.id} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: "0.7rem", color: C.faint, marginBottom: 6 }}>{card.title}</div>
          <img src={card.url} alt={card.title} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <a href={card.url} download={`daily-sceal-${card.id}.png`}
              style={{ flex: 1, textAlign: "center", color: C.navy, fontSize: "0.76rem", fontWeight: 600, textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 0" }}>
              Download ↓
            </a>
            <button onClick={() => copyCardCaption(card)}
              style={{ flex: 1, background: copiedCard === card.id ? "#16a34a" : C.navy, color: "#fff", border: "none", borderRadius: 6, padding: "7px 0", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer" }}>
              {copiedCard === card.id ? "Copied ✓" : "Copy caption"}
            </button>
          </div>
          <pre style={{ margin: "8px 0 0", background: "#f8fafc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px", fontSize: "0.72rem", color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{card.caption}</pre>
        </div>
      ))}

      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `2px solid ${C.border}` }}>
        <h2 style={{ fontFamily: "Georgia, serif", color: C.navy, fontSize: "1.15rem", margin: "0 0 4px" }}>Focail na Seachtaine</h2>
        <p style={{ color: C.muted, fontSize: "0.8rem", margin: "0 0 14px" }}>Sunday recap carousel. Pick words from this week's stories below, or add your own. Three or four works best.</p>

        <button onClick={() => navigator.clipboard?.writeText(SUNDAY_CAPTION)}
          style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.navy, borderRadius: 8, padding: "9px", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
          Copy Sunday caption
        </button>

        <button onClick={loadWeekWords} disabled={loadingWeek}
          style={{ width: "100%", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: "0.84rem", fontWeight: 600, cursor: loadingWeek ? "wait" : "pointer", marginBottom: 14, opacity: loadingWeek ? 0.6 : 1 }}>
          {loadingWeek ? "Loading this week..." : "Load words from this week's posts"}
        </button>

        {weekSource && (
          <p style={{ fontSize: "0.72rem", color: C.muted, margin: "-6px 0 12px" }}>
            {weekSource.source === "posted"
              ? `From ${weekSource.days} recorded ${weekSource.days === 1 ? "post" : "posts"}. Headline words first, then words that came up on more than one day.`
              : "No posts recorded for this week yet, so this is the old sweep of every archived story. Generate a card and the recap will narrow itself."}
          </p>
        )}

        {postedCount > 0 && (
          <button onClick={backupRecords}
            style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, padding: "8px", fontSize: "0.72rem", cursor: "pointer", marginBottom: 14 }}>
            Back up {postedCount} saved {postedCount === 1 ? "post" : "posts"}
          </button>
        )}

        {weekSuggestions.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16, maxHeight: 320, overflowY: "auto" }}>
            <div style={{ fontSize: "0.72rem", color: C.muted, marginBottom: 8 }}>
              Tick the words you want. <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ verified</span> means it's from your trusted dictionary.
            </div>
            {weekSuggestions.map((w, i) => {
              const key = w.irish.toLowerCase();
              return (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                  <input type="checkbox" checked={!!picked[key]}
                    onChange={e => setPicked(p => ({ ...p, [key]: e.target.checked }))}
                    style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "0.84rem" }}>
                    <span style={{ color: C.amber, fontWeight: 700 }}>{w.irish}</span>
                    <span style={{ color: C.muted }}> · {w.english}</span>
                  </span>
                  {w.verified
                    ? <span style={{ fontSize: "0.66rem", color: "#16a34a", fontWeight: 700, whiteSpace: "nowrap" }}>✓ verified</span>
                    : <a href={`https://www.focloir.ie/en/dictionary/ei/${encodeURIComponent(w.english)}?q=${encodeURIComponent(w.english)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.66rem", color: C.navy, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>check ↗</a>}
                </label>
              );
            })}
          </div>
        )}

        <details style={{ marginBottom: 14 }}>
          <summary style={{ fontSize: "0.78rem", color: C.muted, cursor: "pointer", fontWeight: 600 }}>Or add words manually</summary>
          <div style={{ paddingTop: 12 }}>
        <label style={{ display: "block", fontSize: "0.72rem", color: C.muted, marginBottom: 4, fontWeight: 600 }}>English words (→ Irish)</label>
        <textarea value={enText} onChange={e => setEnText(e.target.value)}
          rows={3} placeholder={"government\nhousing\ntrial"}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.85rem", marginBottom: 12, resize: "vertical", boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: "0.72rem", color: C.muted, marginBottom: 4, fontWeight: 600 }}>Irish words (→ English)</label>
        <textarea value={gaText} onChange={e => setGaText(e.target.value)}
          rows={3} placeholder={"rialtas\ntithíocht"}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.85rem", marginBottom: 12, resize: "vertical", boxSizing: "border-box" }} />

        <button onClick={translateWords} disabled={translating}
          style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: "0.85rem", fontWeight: 600, cursor: translating ? "wait" : "pointer", marginBottom: 16, opacity: translating ? 0.6 : 1 }}>
          {translating ? "Translating..." : "Translate"}
        </button>

        {wordPairs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "0.72rem", color: C.muted, marginBottom: 8 }}>Check and edit if needed:</p>
            {wordPairs.map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input value={w.irish} onChange={e => updatePair(i, "irish", e.target.value)}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: "0.82rem", color: C.amber, fontWeight: 600 }} />
                <input value={w.english} onChange={e => updatePair(i, "english", e.target.value)}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: "0.82rem" }} />
              </div>
            ))}
          </div>
        )}
          </div>
        </details>

        <button onClick={generateWeekly}
          style={{ width: "100%", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer", marginBottom: 20 }}>
          Generate weekly carousel
        </button>

        {weeklyImages.map((img, i) => (
          <div key={img.id} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: "0.7rem", color: C.faint, marginBottom: 6 }}>{i + 1}. {img.title}</div>
            <img src={img.url} alt={img.title} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
            <a href={img.url} download={`daily-sceal-week-${i + 1}.png`}
              style={{ display: "inline-block", marginTop: 8, color: C.navy, fontSize: "0.78rem", fontWeight: 600, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>
              Download slide {i + 1} ↓
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DailySceal() {
  const [view, setView] = useState("feed");
  const [stories, setStories] = useState(FALLBACK_STORIES);
  // Today's pull on its own. The public feed may also contain older stories
  // pulled in to pad thin sections, but the export tool must only ever offer
  // today's, or you could end up posting a three-day-old story.
  const [todayOnly, setTodayOnly] = useState(FALLBACK_STORIES);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState(null);
  const [section, setSection] = useState("inniu");
  const isExport = typeof window !== "undefined" && (window.location.hash === "#export" || window.location.search.includes("export=1"));

  useEffect(() => {
    let cancelled = false;
    fetchTodayContent()
      .then(data => {
        if (cancelled || !data?.stories?.length) return;
        const todayStories = data.stories;
        setStories(todayStories);
        setTodayOnly(todayStories);
        // Top up thin sections in the background. Today's stories are already
        // on screen by this point, so this only ever adds depth further down.
        backfillThinSections(todayStories)
          .then(extra => {
            if (cancelled || !extra.length) return;
            setStories([...todayStories, ...extra]);
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sections = availableSections(stories);
  const shown = storiesForSection(stories, section);
  const sectionLabel = SECTIONS.find(s => s.id === section)?.label || "";

  // If today's pull has nothing for the selected section, fall back to Inniu
  useEffect(() => {
    if (!sections.some(s => s.id === section)) setSection("inniu");
  }, [stories]);

  function pickSection(id) {
    setSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openStory(story) {
    setActiveStory(story);
    setView("reading");
    window.scrollTo(0, 0);
  }

  const todayFmt = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 3px; background: ${C.border}; border-radius: 2px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: ${C.navy}; border-radius: 50%; cursor: pointer; border: 2px solid #fff; box-shadow: 0 1px 6px rgba(13,33,55,0.2); }
        .sceal-range { background: linear-gradient(to right, ${C.border} 0%, ${C.border} 80%, #ede8e0 80%, #f0ede8 100%) !important; }
        .sceal-sections::-webkit-scrollbar { display: none; }
        button:active { opacity: 0.7; }
        a:hover { opacity: 0.75; }

        /* ------------------------------------------------------------------
           Desktop only. Everything below 1000px is left exactly as it was, so
           the phone layout is untouched. Above it the shell widens, the feed
           becomes a lead story plus a grid, and the story page grows a panel.
           ------------------------------------------------------------------ */
        .ds-shell { max-width: 640px; margin: 0 auto; }
        .ds-panel { display: none; }

        @media (min-width: 1000px) {
          /* Fill the screen rather than sitting in a cream frame. Capped so it
             stops growing on very large monitors, where the white would
             otherwise run edge to edge. */
          .ds-shell { max-width: min(1600px, 94vw); }

          /* Header padding matches the sheet's inner padding at this width, so
             the wordmark and the first headline share a left edge. */
          .ds-head-pad { padding: 18px 40px !important; }

          /* The lead runs the full width as a band across the top; every other
             story sits in the grid below it. */
          .ds-lead-title-wrap .ds-story { padding-top: 26px; }
          .ds-lead-title-wrap .ds-story h3 { font-size: 1.85rem; line-height: 1.18; color: ${C.navy}; }
          /* The lead runs its full summary at a readable measure, so the block
             fills its column instead of trailing off into an ellipsis. */
          /* Set the lead summary in columns rather than one 68ch line that left
             the rest of the band looking like an empty column. The column width
             is fixed and the count follows the space, so it is two columns on a
             laptop and three on a wide monitor. */
          /* Headline on the left, summary in a single readable column on the
             right, so the band fills without breaking the text into stubs. */
          /* Summary sits under the headline as a standfirst: larger than the
             card summaries and set wide, so it reads as part of the lead rather
             than as a narrow column with a gap beside it. */
          .ds-lead-title-wrap .ds-story h3 { margin-bottom: 14px; }
          .ds-lead-title-wrap .ds-summary {
            font-size: 1.05rem; line-height: 1.65; color: ${C.muted}; max-width: 82ch;
          }
          .ds-lead-title-wrap .ds-story { padding-bottom: 26px; }
          .ds-lead-side .ds-story h3 { font-size: 1rem; }
          .ds-lead-side .ds-story:first-child { padding-top: 0; }
          /* Same track count and same gap as the lead row above it. */
          .ds-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 28px; }

          /* Inniu is a set of highlights rather than a full section, so its
             stories run larger and keep their summaries. The section tabs stay
             on the denser grid above. */
          .ds-highlights .ds-grid { grid-template-columns: repeat(2, 1fr); column-gap: 48px; }
          .ds-highlights .ds-grid .ds-story { padding: 30px 0; }
          .ds-highlights .ds-grid .ds-story h3 { font-size: 1.6rem; line-height: 1.22; letter-spacing: -0.012em; }
          .ds-highlights .ds-grid .ds-summary { display: -webkit-box; font-size: 0.92rem; line-height: 1.65; -webkit-line-clamp: 3; }
          /* Five stories in two columns leaves one on its own, so the odd one
             out runs the full width rather than sitting in a half-empty row. */
          .ds-highlights .ds-grid .ds-story:last-child:nth-child(odd) { grid-column: 1 / -1; }
          .ds-highlights .ds-grid .ds-story:last-child:nth-child(odd) h3 { font-size: 1.75rem; }
          .ds-grid .ds-summary { display: none; }

          /* The article column is sized in characters rather than fractions, so
             the line length stays readable however wide the sheet gets, and the
             pair is centred inside it instead of stranded on the left. */
          .ds-read {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 288px;
            grid-template-areas: "head head" "body panel";
            column-gap: 56px; align-items: start;
          }
          .ds-read-head { grid-area: head; }
          .ds-article { grid-area: body; }
          /* The panel ends short of the sheet's edge, so Reveal all is not sitting
             on the boundary when the word list is long enough to scroll. */
          .ds-panel { grid-area: panel; display: block; position: sticky; top: 20px; margin-bottom: 30px; }

          /* Put the breathing room between the story and the buttons rather than
             below the buttons, so the actions sit just above the sheet's edge. */
          .ds-article .ds-share { margin-top: 42px !important; }
          .ds-article .ds-tail { height: 30px !important; }

          /* The article already sits on a white sheet, so the inner card just
             drew a box inside a box. Flatten it on desktop. */
          .ds-article .ds-body-card {
            background: transparent !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 6px 0 0 !important;
          }
          /* Longer measure and a little more air now the box is gone. */
          .ds-article .ds-body-card > div:nth-child(2) {
            font-size: 1.1rem !important;
            line-height: 2.05 !important;
          }

          /* A story page is prose, so the sheet narrows to fit it rather than
             leaving a wide white field with a column of text in one corner. */
          .ds-shell-read { max-width: min(1260px, 94vw); }
        }

        /* Wide monitors: a fourth column rather than three very wide ones. */
        @media (min-width: 1500px) {
          .ds-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* Header */}
      <header style={{ background: C.navy, borderBottom: `3px solid ${C.amber}` }}>
        <div className="ds-shell ds-head-pad" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div onClick={() => { setSection("inniu"); setView("feed"); }} style={{ cursor: "pointer" }}>
            <div style={{ fontSize: "clamp(1.2rem,3.5vw,1.5rem)", fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Daily <span style={{ color: C.amber }}>Scéal</span>
            </div>
            <div style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.4)", fontFamily: "system-ui, sans-serif", marginTop: 3, letterSpacing: "0.03em" }}>{todayFmt}</div>
          </div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.03em" }}>Cad é an scéal?</div>
        </div>
      </header>

      {/* Content */}
      <main className={`ds-shell${view === "reading" ? " ds-shell-read" : ""}`} style={{ padding: "0 20px 120px" }}>
        <div style={{ background: view === "about" || isExport ? "transparent" : C.card, borderLeft: isExport ? "none" : `1px solid ${C.border}`, borderRight: isExport ? "none" : `1px solid ${C.border}`, borderBottom: isExport ? "none" : `1px solid ${C.border}`, borderRadius: "0 0 12px 12px", padding: "0 20px", minHeight: 400 }}>
          {isExport && <ExportView stories={todayOnly} />}
          {!isExport && view === "feed" && (
            <>
              <SectionBar sections={sections} active={section} onSelect={pickSection} />
              <FeedView stories={shown} loading={loading} onStoryClick={openStory} sectionLabel={sectionLabel} highlights={section === "inniu"} />
            </>
          )}
          {!isExport && view === "reading" && activeStory && (
            <div style={{ paddingTop: 20 }}>
              <ReadingView story={activeStory} onBack={() => setView("feed")} />
            </div>
          )}
          {!isExport && view === "about" && (
            <div style={{ paddingTop: 28 }}>
              <AboutView />
            </div>
          )}
        </div>
      </main>

      {/* Bottom nav */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.96)", borderTop: `1px solid ${C.border}`, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {[
            { id: "feed", label: "Nuacht", icon: "📰" },
            { id: "about", label: "Faoi", icon: "🍀" },
          ].map(tab => {
            const active = view === tab.id || (tab.id === "feed" && view === "reading");
            return (
            <button key={tab.id} onClick={() => {
                if (tab.id === "feed" && view === "feed") pickSection("inniu");
                setView(tab.id);
              }}
              style={{ background: "none", border: "none", padding: "11px 0 9px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}
            >
              {active && <span style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: C.navy, borderRadius: "0 0 2px 2px" }} />}
              <span style={{ fontSize: "1.1rem" }}>{tab.icon}</span>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: active ? C.navy : C.faint, transition: "color 0.15s" }}>{tab.label}</span>
            </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
