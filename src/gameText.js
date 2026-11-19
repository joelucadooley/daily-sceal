// Text for the daily game (Game.jsx), kept apart so the tests can reach it.

export const GAME_LINK = "dailysceal.com/#bearnai";

/** What Share copies: the score, a shamrock or a cross per question, and the link. */
export function shareText(results) {
  const right = results.filter(Boolean).length;
  return `Bearnaí ${right}/${results.length}\n${results.map(r => (r ? "☘️" : "❌")).join("")}\n${GAME_LINK}`;
}

const ARTICLE = /(^|[\s("“‘'-])(an?)(\s+)$/i;
const VOWEL = /^[aeiouáéíóú]/i;

/**
 * The text before the gap. "a" or "an" right before it becomes "a(n)" until
 * the answer shows, so it doesn't give the word away, then agrees with it.
 */
export function beforeGap(before, irish) {
  const m = ARTICLE.exec(before);
  if (!m) return before;
  const upper = /^A/.test(m[2]);
  let word = irish == null ? "a(n)" : VOWEL.test(irish.trim()) ? "an" : "a";
  if (upper) word = word[0].toUpperCase() + word.slice(1);
  return before.slice(0, m.index) + m[1] + word + m[3];
}
