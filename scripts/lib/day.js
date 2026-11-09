// The last check on a day's stories before today.json is written.
//
// today.json is read by the site and by the iPhone and Android apps. A story
// with a field missing, or a [[irish|english]] marker that is not closed, can
// stop an app reading the whole file, so a story like that is left out of the
// day rather than published. Every story the daily run has made since
// 2026-09-11 passes these checks; they only catch something going wrong.

export const LEVEL_KEYS = ["10", "25", "50"];

// Fields every story carries, as non-empty text.
export const STORY_TEXT_FIELDS = [
  "id", "title", "link", "summary", "rssSummary", "category", "categoryIr",
  "feed", "section", "published", "titleIr",
];

const MARKER = /\[\[([^|[\]]+)\|([^[\]]+)\]\]/g;

/** The text with every marker replaced by its English. */
export function stripMarkers(text) {
  return String(text).replace(MARKER, "$2");
}

/** Problems with one marked text, compared with the plain text it came from. */
export function markedTextProblems(marked, plain) {
  if (typeof marked !== "string") return ["missing"];
  const out = [];
  const rest = marked.replace(MARKER, "");
  if (rest.includes("[[") || rest.includes("]]")) out.push("a marker is not closed");
  for (const m of marked.matchAll(MARKER)) {
    if (!m[1].trim() || !m[2].trim()) {
      out.push("a marker has no Irish or no English");
      break;
    }
  }
  if (typeof plain === "string" && stripMarkers(marked) !== plain) out.push("does not match the plain text");
  return out;
}

/** Everything wrong with one story, as short lines; [] when it is fine. */
export function storyProblems(story) {
  if (!story || typeof story !== "object" || Array.isArray(story)) return ["not a story"];
  const out = [];
  for (const f of STORY_TEXT_FIELDS) {
    if (typeof story[f] !== "string" || !story[f].trim()) out.push(`${f} missing`);
  }
  if (typeof story.published === "string" && Number.isNaN(Date.parse(story.published))) {
    out.push("published is not a date");
  }
  for (const [group, plainKey] of [["levels", "summary"], ["summaryLevels", "rssSummary"]]) {
    const levels = story[group];
    if (!levels || typeof levels !== "object" || Array.isArray(levels)) {
      out.push(`${group} missing`);
      continue;
    }
    for (const k of LEVEL_KEYS) {
      for (const p of markedTextProblems(levels[k], story[plainKey])) out.push(`${group}.${k}: ${p}`);
    }
  }
  if (typeof story.titleIr === "string") {
    for (const p of markedTextProblems(story.titleIr, story.title)) out.push(`titleIr: ${p}`);
  }
  return out;
}

/**
 * The stories fit to publish, renumbered story-0, story-1... so the ids stay
 * in step with their place (add-story.js numbers new stories by count), and
 * the ones left out with the reasons.
 */
export function checkStories(stories) {
  const kept = [];
  const dropped = [];
  for (const s of Array.isArray(stories) ? stories : []) {
    const problems = storyProblems(s);
    if (problems.length) dropped.push({ title: s && s.title, problems });
    else kept.push(s);
  }
  return { stories: kept.map((s, i) => ({ ...s, id: `story-${i}` })), dropped };
}
