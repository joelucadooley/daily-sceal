// ---------------------------------------------------------------------------
// RTÉ category map.
//
// One row per category RTÉ actually publishes: [Irish label, toolbar section].
// Built from an audit of every story in the archive, so the keys are real
// strings seen in the feed rather than guesses.
//
// Why this exists: the old map only knew 24 broad words and fell back to
// "Nuacht" for anything else, and "Nuacht" was hard-mapped to Éire. That sent
// 184 of ~400 archived stories to the wrong tab, including every Middle East,
// Europe, UK, Ukraine and US story.
//
// Keys are lowercase. Lookup is exact first, then longest-substring, so
// "World Cup 2026" resolves to soccer rather than matching "world".
// ---------------------------------------------------------------------------
export const RTE_CAT = {
  // --- Ireland ------------------------------------------------------
  "ireland":            ["Éire", "eire"],
  "northern ireland":   ["Tuaisceart Éireann", "eire"],
  "dublin":             ["Baile Átha Cliath", "eire"],
  "belfast":            ["Béal Feirste", "eire"],
  "ulster":             ["Ulaidh", "eire"],
  "leinster":           ["Laighin", "eire"],
  "munster":            ["An Mhumhain", "eire"],
  "connacht":           ["Connachta", "eire"],
  "crime":              ["Coireacht", "eire"],
  "courts":             ["Cúirt", "eire"],
  "court":              ["Cúirt", "eire"],
  "housing":            ["Tithíocht", "eire"],
  "education":          ["Oideachas", "eire"],
  "leaving cert":       ["Ardteist", "eire"],
  // Domestic in all but name: an RTÉ story tagged politics, health or weather
  // is about Ireland nearly every time, and routing these to Eile was leaving
  // Éire thin enough to trigger the archive backfill on a normal news day.
  "politics":           ["Polaitíocht", "eire"],
  "eu presidency":      ["Polaitíocht", "eire"],
  "election":           ["Toghchán", "eire"],
  "health":             ["Sláinte", "eire"],
  "weather":            ["Aimsir", "eire"],

  // --- World --------------------------------------------------------
  "world":              ["Domhan", "domhan"],
  "europe":             ["An Eoraip", "domhan"],
  "middle east":        ["An Meánoirthear", "domhan"],
  "ukraine":            ["An Úcráin", "domhan"],
  "asia":               ["An Áise", "domhan"],
  "africa":             ["An Afraic", "domhan"],
  "us":                 ["Meiriceá", "domhan"],
  "americas":           ["Meiriceá", "domhan"],
  "uk":                 ["Domhan", "domhan"],
  "britain":            ["Domhan", "domhan"],
  "iran":               ["Domhan", "domhan"],
  "venezuela":          ["Domhan", "domhan"],
  "russia":             ["Domhan", "domhan"],
  "gaza":               ["Domhan", "domhan"],
  "israel":             ["Domhan", "domhan"],

  // --- Sport --------------------------------------------------------
  // "world cup" must sit here so it beats the "world" key on substring match
  "world cup":          ["Sacar", "sport"],
  "sport":              ["Spórt", "sport"],
  "gaa":                ["CLG", "sport"],
  "gaelic games":       ["CLG", "sport"],
  "gaelic football":    ["Peil", "sport"],
  "football":           ["Peil", "sport"],
  "hurling":            ["Iomáint", "sport"],
  "camogie":            ["Camógaíocht", "sport"],
  "handball":           ["Liathróid Láimhe", "sport"],
  "soccer":             ["Sacar", "sport"],
  "rugby":              ["Rugbaí", "sport"],
  "boxing":             ["Dornálaíocht", "sport"],
  "snooker":            ["Snúcar", "sport"],
  "golf":               ["Galf", "sport"],
  "racing":             ["Rásaíocht", "sport"],
  "athletics":          ["Lúthchleasaíocht", "sport"],
  "cycling":            ["Rothaíocht", "sport"],
  "tennis":             ["Leadóg", "sport"],

  // --- Everything else (Eile tab) -----------------------------------
  // Business, economy, environment and climate stay here on purpose: those
  // split between domestic and international and the tag alone cannot tell
  // you which.
  "business":           ["Gnó", "eile"],
  "economy":            ["Eacnamaíocht", "eile"],
  "environment":        ["Comhshaol", "eile"],
  "climate change":     ["Athrú Aeráide", "eile"],
  "climate":            ["Athrú Aeráide", "eile"],
  "science":            ["Eolaíocht", "eile"],
  "technology":         ["Teicneolaíocht", "eile"],
  "artificial intelligence": ["Intleacht Shaorga", "eile"],
  "culture":            ["Cultúr", "eile"],
  "entertainment":      ["Siamsaíocht", "eile"],
  "music":              ["Ceol", "eile"],
  "movies":             ["Scannáin", "eile"],
  "film":               ["Scannáin", "eile"],
  "books":              ["Leabhair", "eile"],
  "arts":               ["Ealaíon", "eile"],
  "travel":             ["Taisteal", "eile"],
  "lifestyle":          ["Saol", "eile"],
  "food":               ["Bia", "eile"],
};

// Programme and format tags. These describe the show, not the subject, so they
// tell us nothing about where a story belongs. Anything tagged with one of
// these falls through to the section of the feed it arrived on.
export const PROGRAMME_TAGS = new Set([
  "analysis and comment",
  "prime time",
  "clarity",
  "rté investigates",
  "rte investigates",
  "the late debate",
  "upfront",
  "opinion",
  "comment",
  "explainer",
  "features",
]);

// Longest keys first, so "world cup" wins over "world" and
// "northern ireland" over "ireland".
const CAT_KEYS = Object.keys(RTE_CAT).sort((a, b) => b.length - a.length);

/**
 * Resolve an RTÉ category string to [irishLabel, sectionId].
 * Returns null when the category is missing, a programme tag, or unknown,
 * which means "let the feed decide".
 */
export function catInfo(raw) {
  if (!raw) return null;
  const k = String(raw).toLowerCase().trim();
  if (!k) return null;
  if (PROGRAMME_TAGS.has(k)) return null;
  if (RTE_CAT[k]) return RTE_CAT[k];
  for (const key of CAT_KEYS) if (k.includes(key)) return RTE_CAT[key];
  return null;
}
