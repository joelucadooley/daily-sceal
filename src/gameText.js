// Text for the daily game (Game.jsx), kept apart so the tests can reach it.

export const GAME_LINK = "dailysceal.com/#bearnai";

const MONTHS = ["Eanáir", "Feabhra", "Márta", "Aibreán", "Bealtaine", "Meitheamh", "Iúil", "Lúnasa", "Meán Fómhair", "Deireadh Fómhair", "Samhain", "Nollaig"];

/** "2026-11-20" → "20 Samhain"; anything else → "". */
export function gameDay(date) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(date || "");
  return m && MONTHS[+m[1] - 1] ? `${+m[2]} ${MONTHS[+m[1] - 1]}` : "";
}

/** What Share copies: the score and the day, a shamrock or a cross per question, and the link. */
export function shareText(results, date) {
  const right = results.filter(Boolean).length;
  const day = gameDay(date);
  return `Bearnaí ${right}/${results.length}${day ? ` · ${day}` : ""}\n${results.map(r => (r ? "☘️" : "❌")).join("")}\n${GAME_LINK}`;
}

/** The Irish word in gold over the score. */
export function praise(right, total) {
  const f = total ? right / total : 0;
  return f === 1 ? "Foirfe!" : f >= 0.8 ? "Ar fheabhas!" : f >= 0.6 ? "Go maith!" : f >= 0.4 ? "Ní holc!" : "Lean ort!";
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
