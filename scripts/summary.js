// Trims text to whole sentences that fit inside a plain-text budget.
//
// The iOS app shows the RSS summary only (not the scraped article), and the
// old slice(0, 300) cut mid-word. This keeps whole sentences, always at least
// one, and works on marked text too: [[irish|english]] markers count as the
// English word only, so the same budget picks the same sentences at every
// level and the three summary levels line up.

export const SUMMARY_BUDGET = 320;

const MARKER = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

export function plainLength(text) {
  return text.replace(MARKER, "$2").length;
}

export function stripMarkers(text) {
  return text.replace(MARKER, "$2");
}

// Split on sentence-ending punctuation followed by whitespace and either a
// capital letter, a digit, a quote, or the start of a marker. Abbreviations
// like "Mr. Healy-Rae" survive because "Mr." is followed by a capital... which
// this would split. RTÉ copy uses "Mr Healy-Rae" without the stop, so that is
// rare in practice, and a false split only shortens a summary slightly.
export function splitSentences(text) {
  return text
    .split(/(?<=[.!?]["’”')\]]*)\s+(?=[A-Z0-9"“‘'(\[])/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function firstSentences(text, budget = SUMMARY_BUDGET) {
  const sentences = splitSentences(text.trim());
  if (!sentences.length) return "";
  const out = [];
  let used = 0;
  for (const s of sentences) {
    const len = plainLength(s) + (out.length ? 1 : 0);
    if (out.length && used + len > budget) break;
    out.push(s);
    used += len;
    if (used >= budget) break;
  }
  return out.join(" ");
}
