// Shared test setup: network off, the archive, and fake MyMemory answers.
//
// Import this module FIRST (before anything from scripts/), so the fetch stub
// is in place before any code that might call the network is loaded. Only
// api.mymemory.translated.net/get is answered, and only while a mode is set;
// any other URL throws and is recorded in `net.blocked`.
import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

// ---- Network off ----

export const MYMEMORY_HOST = "api.mymemory.translated.net";
export const net = { calls: 0, blocked: [], respond: null, onAsk: null };

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.hostname !== MYMEMORY_HOST || url.pathname !== "/get" || !net.respond) {
    net.blocked.push(String(input));
    throw new Error(`Network blocked in tests: ${url.origin}${url.pathname}`);
  }
  net.calls++;
  const q = url.searchParams.get("q");
  if (net.onAsk) net.onAsk(q);
  const { status, text } = net.respond(q);
  return {
    ok: true,
    json: async () => ({ responseStatus: status, responseData: { translatedText: text } }),
  };
};

// ---- Archive ----

export const LEVELS = [10, 25, 50];
export const MARKER = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
export const TABLE_FROM = "2026-06-01";

export function archiveDir(args = process.argv.slice(2)) {
  const i = args.indexOf("--archive");
  return i >= 0 && args[i + 1]
    ? args[i + 1]
    : fileURLToPath(new URL("../../public/data/archive/", import.meta.url));
}

export function loadArchive({ dir = archiveDir(), from = "2026-09-11" } = {}) {
  const dayFiles = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const readDay = f => JSON.parse(readFileSync(`${dir}/${f}`, "utf-8"));

  // MyMemory stand-in: every [[irish|english]] marker at levels 10/25/50 (75
  // and 100 glosses are misaligned), english lowercased -> its most frequent
  // Irish. Ties go to the alphabetically first Irish so the table is stable.
  const counts = new Map();
  for (const f of dayFiles.filter(f => f.slice(0, 10) >= TABLE_FROM)) {
    for (const s of readDay(f).stories || []) {
      for (const block of [s.levels, s.summaryLevels]) {
        for (const pct of LEVELS) {
          const text = block?.[pct];
          if (typeof text !== "string") continue;
          for (const m of text.matchAll(MARKER)) {
            const en = m[2].toLowerCase();
            if (!counts.has(en)) counts.set(en, new Map());
            const c = counts.get(en);
            c.set(m[1], (c.get(m[1]) || 0) + 1);
          }
        }
      }
    }
  }
  const table = new Map();
  for (const [en, c] of counts) {
    const best = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
    table.set(en, best);
  }

  // Stories: unique by link, first appearance wins. `days` keeps every
  // story-day (link per day) for the per-day MyMemory count.
  const stories = [];
  const byLink = new Map();
  const days = [];
  const replayFiles = dayFiles.filter(f => f.slice(0, 10) >= from);
  for (const f of replayFiles) {
    const links = [];
    for (const s of readDay(f).stories || []) {
      if (!s.link) continue;
      links.push(s.link);
      if (byLink.has(s.link)) continue;
      byLink.set(s.link, stories.length);
      stories.push({ day: f.slice(0, 10), story: s });
    }
    days.push({ day: f.slice(0, 10), links });
  }
  return { dir, dayFiles, replayFiles, table, stories, byLink, days, readDay };
}

// ---- MyMemory answers ----

export function makeAnswers(table) {
  const unknownWords = new Set();
  function tableAnswer(q) {
    const hit = table.get(q.toLowerCase());
    if (hit === undefined) {
      unknownWords.add(q.toLowerCase());
      return { status: 200, text: q };   // rejected by isGoodTranslation, as live junk would be
    }
    return { status: 200, text: hit };
  }
  // Stable per word, so every run sees the same answer whatever order it asks in.
  const bucket = q => createHash("sha1").update(q.toLowerCase()).digest()[0] % 20;
  // Odd capitals, stray punctuation, junk notes, hyphen fragments, quota
  // status and thrown errors.
  function noisyAnswer(q) {
    const base = tableAnswer(q);
    switch (bucket(q)) {
      case 0: return { status: 200, text: base.text.toUpperCase() };
      case 1: return { status: 200, text: ` ${base.text}.` };
      case 2: return { status: 200, text: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" };
      case 3: return { status: 429, text: "" };
      case 4: throw new Error("socket hang up");
      case 5: return { status: 200, text: `${base.text}-` };
      case 6: return { status: 200, text: undefined };
      default: return base;
    }
  }
  function outageAnswer() {
    throw new Error("fetch failed");
  }
  return { tableAnswer, noisyAnswer, outageAnswer, unknownWords };
}

// The context processStory builds for a story (feed, section, topic).
export const SPORT_FEEDS = new Set(["sport", "gaa", "soccer", "rugby"]);
export function ctxOf(s) {
  const topic = s.section === "sport" || SPORT_FEEDS.has(s.feed) ? "sport" : s.section;
  return { feed: s.feed, section: s.section, topic };
}
