// Makes the link previews for shared Bearnaí scores: one page and one picture
// per way the five answers can go (32), in public/bearnai/. A shared score
// links to /bearnai/11011 (1 for right, 0 for wrong); its preview shows the gaps in
// green and red, then the page opens the game. Run on a Mac with Chrome:
//   node scripts/bearnai-cards.mjs
// Only needed again if the card or public/bearnai.html changes. The plain
// card (no ?r) is public/og-bearnai.png; redraw that by hand and bump its ?v=.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "bearnai");
const CARD = pathToFileURL(join(ROOT, "scripts", "bearnai-card.html")).href;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = "https://dailysceal.com";

function draw(url, file) {
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1200,630", "--virtual-time-budget=3000", `--screenshot=${file}`, url], { stdio: "ignore" });
}

const page = readFileSync(join(ROOT, "public", "bearnai.html"), "utf8");
const swap = (html, from, to) => {
  if (!html.includes(from)) throw new Error(`public/bearnai.html no longer has ${from}`);
  return html.split(from).join(to);
};

mkdirSync(OUT, { recursive: true });
// In case /bearnai is ever sent on to /bearnai/.
copyFileSync(join(ROOT, "public", "bearnai.html"), join(OUT, "index.html"));

for (let n = 0; n < 32; n++) {
  const r = n.toString(2).padStart(5, "0");
  const right = [...r].filter(c => c === "1").length;
  draw(`${CARD}?r=${r}`, join(OUT, `${r}.png`));
  let html = swap(page, `<meta property="og:url" content="${SITE}/bearnai" />`, `<meta property="og:url" content="${SITE}/bearnai/${r}" />`);
  html = html.replace(/og-bearnai\.png\?v=\d+/g, `bearnai/${r}.png`);
  html = swap(html, `content="Bearnaí, a new game by Daily Scéal"`, `content="Bearnaí: ${right} of 5 right. A new game by Daily Scéal"`);
  html = swap(html, "The address people share for the game.", "A shared score: the gaps in its preview are green for right, red for wrong.");
  writeFileSync(join(OUT, `${r}.html`), html);
}
console.log("Made 32 score previews in public/bearnai/");
