// The curated dictionaries: overrides.json (english -> trusted Irish),
// places.json (english -> properly capitalised Irish place name) and
// senses.json (english -> Irish by part of the paper, approved by Joe).
//
// Paths are resolved from this file, not the current folder, so the generator
// and the tests load the same files wherever they are run from.
import { readFileSync } from "fs";

const OVERRIDES_URL = new URL("../overrides.json", import.meta.url);
const PLACES_URL = new URL("../places.json", import.meta.url);
const SENSES_URL = new URL("../senses.json", import.meta.url);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf-8"));
}

// Overrides are the backbone of every level. A missing or empty file would
// quietly publish a day of machine-only Irish, so it stops the run instead.
export function loadOverrides(url = OVERRIDES_URL) {
  const overrides = readJson(url);
  if (!overrides || typeof overrides !== "object" || !Object.keys(overrides).length) {
    throw new Error(`No overrides loaded from ${url.pathname}`);
  }
  return overrides;
}

// Places stay optional, as before: without them place names are left in English.
export function loadPlaces(url = PLACES_URL) {
  try {
    return readJson(url);
  } catch {
    return {};
  }
}

// Context keys a senses entry may use (rule S1): the sport feeds, the site
// sections, "noun" (after a determiner) and "default".
export const SENSE_KEYS = new Set(["gaa", "soccer", "rugby", "sport", "eire", "domhan", "eile", "noun", "default"]);

// senses.json: { "pitch": { "sport": "páirc" }, "former": { "default": null } }.
// A string is approved Irish, null means "leave in English here". Only
// entries Joe has ticked are ever written to the file. A missing file is {};
// a malformed entry is skipped with a warning rather than stopping the run.
export function loadSenses(url = SENSES_URL, warn = msg => console.warn(msg)) {
  let raw;
  try {
    raw = readJson(url);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw new Error(`senses.json could not be read: ${err.message}`);
  }
  const senses = {};
  for (const [en, entry] of Object.entries(raw || {})) {
    const ok = entry && typeof entry === "object" && !Array.isArray(entry) &&
      Object.entries(entry).every(([k, v]) => SENSE_KEYS.has(k) && (v === null || (typeof v === "string" && v.trim())));
    if (!ok) {
      warn(`senses.json: skipped "${en}" (unknown key or empty Irish)`);
      continue;
    }
    senses[en.toLowerCase().trim()] = entry;
  }
  return senses;
}

// { overrides, places, senses }, the shape every function in words.js takes as `dict`.
export function loadDict() {
  return { overrides: loadOverrides(), places: loadPlaces(), senses: loadSenses() };
}
