// The curated dictionaries: overrides.json (english -> trusted Irish) and
// places.json (english -> properly capitalised Irish place name).
//
// Paths are resolved from this file, not the current folder, so the generator
// and the tests load the same files wherever they are run from.
import { readFileSync } from "fs";

const OVERRIDES_URL = new URL("../overrides.json", import.meta.url);
const PLACES_URL = new URL("../places.json", import.meta.url);

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

// { overrides, places }, the shape every function in words.js takes as `dict`.
export function loadDict() {
  return { overrides: loadOverrides(), places: loadPlaces() };
}
