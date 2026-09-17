// One-off backfill for the iOS app.
//
// Archive days written before summaryLevels existed only carry the full-text
// levels. This derives a summary-only version from them by keeping the first
// sentences within the summary budget (the same sentences the RSS description
// carries), so the app has seven days of readable stories immediately rather
// than waiting a week. Also adds the marked headline (titleIr) using the
// verified dictionaries only, and writes focail.json.
//
// Usage: node scripts/backfill-summaries.js [days]   (default 7)
// Safe to re-run: days that already have summaryLevels are left alone.

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { firstSentences, stripMarkers } from "./summary.js";

const DAYS = parseInt(process.argv[2] || "7", 10);
const OVERRIDES = JSON.parse(readFileSync("scripts/overrides.json", "utf-8"));
const PLACES = JSON.parse(readFileSync("scripts/places.json", "utf-8"));

// Same rules as markHeadline in generate.js.
function markHeadline(title) {
  const tokens = title.split(/(\s+)/);
  const candidates = [];
  tokens.forEach((tok, i) => {
    const clean = tok.replace(/[^A-Za-zÀ-ÿ'’]/g, "");
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (PLACES[lower] !== undefined) {
      candidates.push({ i, clean, irish: PLACES[lower], place: true });
    } else if (OVERRIDES[lower] !== undefined && clean.length >= 4) {
      let irish = OVERRIDES[lower];
      if (/^[A-Z]/.test(clean)) irish = irish.charAt(0).toUpperCase() + irish.slice(1);
      candidates.push({ i, clean, irish, place: false });
    }
  });
  candidates.sort((a, b) => (b.place ? 1 : 0) - (a.place ? 1 : 0) || b.clean.length - a.clean.length);
  for (const c of candidates.slice(0, 3)) {
    tokens[c.i] = tokens[c.i].replace(c.clean, `[[${c.irish}|${c.clean}]]`);
  }
  return tokens.join("");
}

function backfillStory(s) {
  if (s.summaryLevels && s.rssSummary) return { story: s, changed: false };
  const levels = s.levels || {};
  const summaryLevels = {};
  for (const [pct, text] of Object.entries(levels)) {
    summaryLevels[pct] = firstSentences(text);
  }
  const base = levels["50"] || levels["25"] || levels["10"] || s.summary || "";
  const rssSummary = firstSentences(stripMarkers(base));
  return {
    story: { ...s, rssSummary, summaryLevels, titleIr: s.titleIr || markHeadline(s.title) },
    changed: true,
  };
}

const files = readdirSync("public/data/archive")
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .slice(-DAYS);

let touched = 0;
for (const f of files) {
  const path = `public/data/archive/${f}`;
  const day = JSON.parse(readFileSync(path, "utf-8"));
  let changed = false;
  day.stories = (day.stories || []).map(s => {
    const r = backfillStory(s);
    changed ||= r.changed;
    return r.story;
  });
  if (changed) {
    writeFileSync(path, JSON.stringify(day, null, 2));
    touched++;
    console.log(`backfilled ${f} (${day.stories.length} stories)`);
  }
  // today.json is a copy of the newest archive day; keep them in step.
  try {
    const today = JSON.parse(readFileSync("public/data/today.json", "utf-8"));
    if (today.date === day.date && changed) {
      writeFileSync("public/data/today.json", JSON.stringify(day, null, 2));
      console.log("updated today.json to match");
    }
  } catch {}
}

const placeKeys = new Set(Object.keys(PLACES));
const focail = {
  generated: new Date().toISOString(),
  words: Object.entries(OVERRIDES).filter(([en]) => !placeKeys.has(en)).map(([en, ga]) => ({ ga, en })),
  places: Object.entries(PLACES).map(([en, ga]) => ({ ga, en })),
};
writeFileSync("public/data/focail.json", JSON.stringify(focail, null, 2));
console.log(`wrote focail.json (${focail.words.length} words, ${focail.places.length} places); ${touched} day(s) backfilled`);
