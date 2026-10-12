// Category mapping check: every distinct RTÉ category in the archive, mapped
// the old way (any substring) and the new way (whole words, categories.js).
// Prints only the categories whose label or section changes, for Joe.
//
//   node scripts/test/categories.mjs [--archive <dir>]
import { readFileSync, readdirSync } from "fs";
import { archiveDir } from "./archive.mjs";
import { RTE_CAT, PROGRAMME_TAGS, catInfo } from "../categories.js";

// The lookup as it was before whole-word matching (categories.js:135).
const KEYS = Object.keys(RTE_CAT).sort((a, b) => b.length - a.length);
function oldCatInfo(raw) {
  if (!raw) return null;
  const k = String(raw).toLowerCase().trim();
  if (!k || PROGRAMME_TAGS.has(k)) return null;
  if (RTE_CAT[k]) return RTE_CAT[k];
  for (const key of KEYS) if (k.includes(key)) return RTE_CAT[key];
  return null;
}

const dir = archiveDir();
const seen = new Map();
for (const f of readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  for (const s of JSON.parse(readFileSync(`${dir}/${f}`, "utf-8")).stories || []) {
    if (!s.category) continue;
    const e = seen.get(s.category) || { n: 0, feeds: new Set() };
    e.n++;
    e.feeds.add(s.feed);
    seen.set(s.category, e);
  }
}

const show = r => (r ? `${r[0]} (${r[1]})` : "feed decides");
const changed = [...seen].filter(([c]) => JSON.stringify(oldCatInfo(c)) !== JSON.stringify(catInfo(c)));
console.log(`${seen.size} distinct categories in the archive, ${changed.length} change:`);
for (const [c, e] of changed.sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${c} (${e.n} stories, feed ${[...e.feeds].join("/")}): ${show(oldCatInfo(c))} -> ${show(catInfo(c))}`);
}
