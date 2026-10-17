// The curated dictionaries: overrides.json (english -> trusted Irish),
// places.json (english -> properly capitalised Irish place name) and
// senses.json (english -> Irish by part of the paper, approved by Joe), and
// extra-words.json (english -> Irish the translators agreed on, not checked
// by Joe: a second list that sits alongside overrides.json, never in it).
//
// Paths are resolved from this file, not the current folder, so the generator
// and the tests load the same files wherever they are run from.
import { readFileSync } from "fs";

const OVERRIDES_URL = new URL("../overrides.json", import.meta.url);
const PLACES_URL = new URL("../places.json", import.meta.url);
const SENSES_URL = new URL("../senses.json", import.meta.url);
const EXTRA_URL = new URL("../extra-words.json", import.meta.url);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf-8"));
}

// No prototype: a key such as "constructor" must find nothing, not
// Object.prototype.constructor (which would print as broken Irish).
const bare = obj => Object.assign(Object.create(null), obj);

// Overrides are the backbone of every level. A missing or empty file would
// quietly publish a day of machine-only Irish, so it stops the run instead.
export function loadOverrides(url = OVERRIDES_URL) {
  const overrides = readJson(url);
  if (!overrides || typeof overrides !== "object" || !Object.keys(overrides).length) {
    throw new Error(`No overrides loaded from ${url.pathname}`);
  }
  return bare(overrides);
}

// Places stay optional, as before: without them place names are left in English.
export function loadPlaces(url = PLACES_URL) {
  try {
    return bare(readJson(url));
  } catch {
    return bare({});
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
    if (err.code === "ENOENT") return bare({});
    throw new Error(`senses.json could not be read: ${err.message}`);
  }
  const senses = bare({});
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

// extra-words.json: { "season": "séasúr" }. Extra words count as dictionary
// words at every level (Beginner too), but overrides.json wins on a clash
// (words.js looks there first) and they never reach verified.json or
// focail.json. A missing file is {}; an unreadable file, or an entry with
// no Irish, is skipped with a warning rather than stopping the run.
export function loadExtra(url = EXTRA_URL, warn = msg => console.warn(msg)) {
  let raw;
  try {
    raw = readJson(url);
  } catch (err) {
    if (err.code !== "ENOENT") warn(`extra-words.json could not be read, no extra words used: ${err.message}`);
    return bare({});
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warn("extra-words.json is not a list of english: Irish pairs, no extra words used");
    return bare({});
  }
  const extra = bare({});
  for (const [en, ga] of Object.entries(raw)) {
    const key = en.toLowerCase().trim();
    if (!key || typeof ga !== "string" || !ga.trim() || /[\[\]|]/.test(ga)) {
      warn(`extra-words.json: skipped "${en}" (empty English or Irish, or a bracket)`);
      continue;
    }
    extra[key] = ga.trim();
  }
  return extra;
}

// { overrides, places, senses, extra }, the shape every function in words.js
// takes as `dict`.
export function loadDict() {
  return { overrides: loadOverrides(), places: loadPlaces(), senses: loadSenses(), extra: loadExtra() };
}

// What generate.js publishes as hand-checked: Joe's overrides and places
// only. Extra words are left out on purpose, so the app's verified list and
// the Focal an lae pool stay Joe's own words.
export function verifiedKeys(dict) {
  return Object.keys(dict.overrides);
}
export function focailLists(dict) {
  const placeKeys = new Set(Object.keys(dict.places));
  return {
    words: Object.entries(dict.overrides).filter(([en]) => !placeKeys.has(en)).map(([en, ga]) => ({ ga, en })),
    places: Object.entries(dict.places).map(([en, ga]) => ({ ga, en })),
  };
}
