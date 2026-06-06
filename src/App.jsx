import { useState, useEffect } from "react";

const C = {
  navy: "#0d2137",
  amber: "#e8951e",
  bg: "#f4f1ec",
  card: "#ffffff",
  border: "#e8e2d9",
  text: "#111111",
  muted: "#6b6460",
  faint: "#a8a29a",
  blue: "#2563eb",
  blueLight: "#eff6ff",
};

const CAT_MAP = {
  ireland: "Éire", sport: "Spórt", politics: "Polaitíocht",
  business: "Gnó", entertainment: "Siamsaíocht", world: "Domhan",
  health: "Sláinte", science: "Eolaíocht", technology: "Teicneolaíocht",
  culture: "Cultúr", weather: "Aimsir", travel: "Taisteal",
  dublin: "Baile Átha Cliath", hurling: "Iomáint", football: "Peil",
  rugby: "Rugbaí", election: "Toghchán", crime: "Coireacht",
  court: "Cúirt", housing: "Tithíocht", education: "Oideachas",
  environment: "Comhshaol", economy: "Eacnamaíocht", arts: "Ealaíon",
};

const FALLBACK_STORIES = [
  {
    id: "f1", title: "Government Announces Ambitious New Housing Plan",
    summary: "The Irish government has unveiled a major new housing strategy, promising to build fifty thousand homes over the next three years. The plan focuses heavily on affordable housing in Dublin, Cork, and Galway, where rents have reached record highs. The Taoiseach said the plan would be the largest state investment in housing since the 1970s.",
    category: "Ireland", categoryIr: "Éire", timeAgo: "2h ago",
    levels: {
      10: "The Irish [[rialtas|government]] has unveiled a major new [[straitéis|strategy]], promising to build fifty thousand [[tithe|homes]] over the next three years. The [[plean|plan]] focuses on affordable [[tithíocht|housing]] in Dublin, Cork, and Galway.",
      25: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a major new [[straitéis|strategy]], promising to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]]. The [[plean|plan]] focuses on affordable [[tithíocht|housing]] where [[cíosanna|rents]] have reached [[taifead|record]] highs.",
      50: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a major new [[straitéis|strategy]], [[gealltanas|promising]] to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]]. The [[plean|plan]] [[dírithe|focuses]] on [[tithíocht inacmhainne|affordable housing]] in Dublin, Cork, and Galway, where [[cíosanna|rents]] have reached [[taifead|record]] highs.",
      75: "Tá an [[rialtas|government]] [[Éireannach|Irish]] tar éis [[straitéis|strategy]] nua a [[nochtadh|unveil]], ag [[gealltanas|promising]] caoga míle [[teach|home]] a [[tógáil|build]] thar na trí [[blianta|years]] amach romhainn. Tá [[fócas|focus]] ar [[tithíocht inacmhainne|affordable housing]] i mBaile Átha Cliath, Corcaigh, agus Gaillimh.",
      100: "Tá an [[rialtas|government]] [[Éireannach|Irish]] tar éis [[straitéis|strategy]] mhór nua a [[nochtadh|unveil]], ag [[gealltanas|promising]] caoga míle [[teach|home]] a [[tógáil|build]] thar na trí [[blianta|years]] amach [[romhainn|ahead]]. Tá [[fócas|focus]] ar [[tithíocht inacmhainne|affordable housing]] i mBaile Átha Cliath, Corcaigh, agus Gaillimh, áit a bhfuil [[cíosanna|rents]] ag [[ardú|rising]] go [[mór|greatly]].",
    }
  },
  {
    id: "f2", title: "Leinster Rugby Reach Champions Cup Quarterfinals",
    summary: "Leinster Rugby secured their place in the Champions Cup quarterfinals with a dominant performance against Toulouse at the Aviva Stadium on Friday night. Two first-half tries put Leinster firmly in control, and despite a spirited Toulouse comeback, the Irish province held on to win by eleven points.",
    category: "Sport", categoryIr: "Spórt", timeAgo: "4h ago",
    levels: {
      10: "Leinster [[rugbaí|Rugby]] secured their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a dominant [[cluiche|performance]] against Toulouse at the Aviva [[Staidiam|Stadium]] on Friday night.",
      25: "Leinster [[rugbaí|Rugby]] [[dhaingniú|secured]] their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a [[ceannasach|dominant]] [[cluiche|performance]] against Toulouse. Two [[úide|tries]] in the first [[leath|half]] put Leinster in [[smacht|control]].",
      50: "Leinster [[rugbaí|Rugby]] [[dhaingniú|secured]] their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a [[ceannasach|dominant]] [[cluiche|performance]] against Toulouse. Two [[úide|tries]] in the first [[leath|half]] put Leinster in [[smacht|control]], and the Irish [[cúige|province]] [[coinneáil|held]] on to [[buaigh|win]] by eleven [[pointe|points]].",
      75: "[[Dhaingniú|Secured]] Leinster [[rugbaí|Rugby]] a [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[ceannasach|dominant]] in éadan Toulouse. [[Chuir|put]] dhá [[úide|try]] sa chéad [[leath|half]] Leinster i [[smacht|control]], agus [[bhuaigh|won]] an [[cúige|province]] [[Éireannach|Irish]] faoi dheireadh.",
      100: "[[Dhaingniú|Secured]] Leinster [[rugbaí|Rugby]] a [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[ceannasach|dominant]] in [[éadan|against]] Toulouse ag an Aviva [[Staidiam|Stadium]]. [[Chuir|put]] dhá [[úide|try]] sa [[chéad|first]] [[leath|half]] Leinster i [[smacht|control]], agus [[bhuaigh|won]] an [[cúige|province]] [[Éireannach|Irish]] ar [[fad|all]].",
    }
  },
  {
    id: "f3", title: "Wild Atlantic Way Voted Top European Scenic Drive",
    summary: "Ireland's Wild Atlantic Way has been voted the best scenic drive in Europe by a leading travel magazine, beating routes in Norway, Scotland, and the Amalfi Coast. The 2,500 kilometre route stretches from Donegal to Cork, passing through some of the most dramatic coastline on the continent.",
    category: "Travel", categoryIr: "Taisteal", timeAgo: "6h ago",
    levels: {
      10: "Ireland's Wild Atlantic Way has been voted the best scenic [[tiomáint|drive]] in Europe, [[buaigh|beating]] [[bealaí|routes]] in Norway, Scotland, and the Amalfi Coast.",
      25: "Ireland's Wild Atlantic Way has been [[vótáilte|voted]] the best [[radharcach|scenic]] [[tiomáint|drive]] in Europe, beating [[bealaí|routes]] in Norway, Scotland, and the Amalfi [[Cósta|Coast]].",
      50: "Ireland's Wild Atlantic Way has been [[vótáilte|voted]] the best [[radharcach|scenic]] [[tiomáint|drive]] in Europe, [[buaigh|beating]] [[bealaí|routes]] in Norway and Scotland. The [[bealach|route]] [[síneann|stretches]] from Donegal to Cork, passing through [[cósta|coastline]] [[drámatúil|dramatic]].",
      75: "Tá Wild Atlantic Way na hÉireann [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]]. [[Síneann|stretches]] an [[bealach|route]] 2,500 [[ciliméadar|kilometre]] ó Dhún na nGall go Corcaigh.",
      100: "Tá Wild Atlantic Way na [[hÉireann|Ireland]] [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]]. [[Síneann|stretches]] an [[bealach|route]] 2,500 [[ciliméadar|kilometre]] ó Dhún na nGall go Corcaigh, ag [[dul|passing]] tríd an [[gcósta|coastline]] is [[drámatúla|dramatic]] ar an [[Mór-roinn|continent]].",
    }
  },
  {
    id: "f4", title: "New Irish Language Tech Hub Opens in Galway",
    summary: "A new technology centre dedicated entirely to Irish language software and artificial intelligence has officially opened in Galway city. Over one hundred jobs have been created, with another fifty expected by the end of the year. The Minister for the Gaeltacht described it as a landmark moment for the language.",
    category: "Technology", categoryIr: "Teicneolaíocht", timeAgo: "8h ago",
    levels: {
      10: "A new [[teicneolaíocht|technology]] [[ionad|centre]] dedicated to Irish language [[bogearraí|software]] has opened in Galway. Over one hundred [[poist|jobs]] have been created.",
      25: "A new [[teicneolaíocht|technology]] [[ionad|centre]] [[dírithe|dedicated]] to Irish language [[bogearraí|software]] and [[intleacht shaorga|artificial intelligence]] has [[oscailte|opened]] in Galway, creating over one hundred new [[poist|jobs]].",
      50: "[[Osclaíodh|Opened]] [[ionad teicneolaíochta|technology centre]] nua i nGaillimh [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[intleacht shaorga|artificial intelligence]]. [[Cruthaíodh|created]] níos mó ná céad [[post|job]] nua sa [[réigiún|region]].",
      75: "[[Osclaíodh|Opened]] [[ionad|centre]] [[teicneolaíochta|technology]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[intleacht shaorga|artificial intelligence]]. [[Cruthaíodh|created]] níos mó ná céad [[post|job]] nua.",
      100: "[[Osclaíodh|Opened]] [[ionad|centre]] [[teicneolaíochta|technology]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[intleacht shaorga|artificial intelligence]]. [[Cruthaíodh|created]] níos mó ná céad [[post|job]] nua, agus [[táthar ag súil|expected]] le caoga eile [[faoi|by]] [[deireadh|end]] na [[bliana|year]].",
    }
  },
  {
    id: "f5", title: "Record Numbers Visit National Museums This Year",
    summary: "Irish national museums and galleries have recorded their highest ever visitor numbers, with more than four million people passing through their doors since January. Officials credited free admission, improved facilities, and a growing interest in Irish history and culture.",
    category: "Culture", categoryIr: "Cultúr", timeAgo: "10h ago",
    levels: {
      10: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have recorded their highest ever [[cuairteoir|visitor]] numbers, with more than four million [[daoine|people]] since January.",
      25: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have [[taifeadta|recorded]] their highest ever [[cuairteoir|visitor]] numbers, with more than four million [[daoine|people]] since January.",
      50: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]], le níos mó ná ceithre milliún [[duine|person]] ó [[Eanáir|January]].",
      75: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]] i [[mbliana|this year]]. [[Luaigh|credited]] [[oifigigh|officials]] [[iontráil saor in aisce|free admission]] agus [[suim|interest]] ag [[fás|growing]] sa [[stair|history]] [[Éireannach|Irish]].",
      100: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na [[hÉireann|Ireland]] tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]] i [[mbliana|this year]], le níos mó ná ceithre [[milliún|million]] [[duine|person]] ó [[Eanáir|January]].",
    }
  },
  {
    id: "f6", title: "Met Éireann Forecasts Warmest June in Decades",
    summary: "Met Éireann has forecast an exceptionally warm and dry June, with temperatures expected to reach twenty-six degrees in parts of the country. Meteorologists say a high pressure system over the Atlantic is responsible, and the settled spell could persist well into July.",
    category: "Weather", categoryIr: "Aimsir", timeAgo: "12h ago",
    levels: {
      10: "Met Éireann has forecast an exceptionally warm and dry [[Meitheamh|June]], with [[teochtaí|temperatures]] expected to reach twenty-six [[céim|degrees]] in parts of the [[tír|country]].",
      25: "Met Éireann has [[réamhaisnéisithe|forecast]] an exceptionally [[te|warm]] and [[tirim|dry]] [[Meitheamh|June]], with [[teochtaí|temperatures]] expected to reach twenty-six [[céim|degrees]] in [[codanna|parts]] of the [[tír|country]].",
      50: "Tá Met Éireann tar éis [[Meitheamh|June]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]].",
      75: "Tá Met Éireann tar éis [[Meitheamh|June]] [[eisceachtúil|exceptional]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]] don [[tír|country]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] na [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]].",
      100: "Tá Met Éireann tar éis [[Meitheamh|June]] [[eisceachtúil|exceptional]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]] don [[tír|country]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] na [[teochtaí|temperatures]] fiche a sé [[céim|degrees]], rud a [[dhéanfadh|would make]] é ar cheann de na [[Meitheamh|Junes]] is [[teo|hottest]] le [[scór bliain|twenty years]].",
    }
  },
];

const SNAP_LEVELS = [10, 25, 50, 75];
const LEVELS_CONFIG = [
  { pct: 10, label: "Beginner", color: "#16a34a", bg: "#f0fdf4", tip: "Key nouns only" },
  { pct: 25, label: "Foundation", color: "#2563eb", bg: "#eff6ff", tip: "Nouns and verbs" },
  { pct: 50, label: "Intermediate", color: "#d97706", bg: "#fffbeb", tip: "Most content words" },
  { pct: 75, label: "Advanced", color: "#7c3aed", bg: "#faf5ff", tip: "Full Irish unlocked with funding" },
];

const getLevel = pct => LEVELS_CONFIG.find(l => l.pct === pct) || LEVELS_CONFIG[0];
const getIrCat = c => { if (!c) return "Nuacht"; const l = c.toLowerCase(); for (const [k, v] of Object.entries(CAT_MAP)) if (l.includes(k)) return v; return "Nuacht"; };
const msAgo = d => { const m = Math.floor((Date.now() - d) / 60000); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };

function parseText(text) {
  const parts = [], re = /\[\[([^\|]+)\|([^\]]+)\]\]/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: "en", v: text.slice(last, m.index) });
    parts.push({ t: "ir", irish: m[1], english: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "en", v: text.slice(last) });
  return parts;
}

function speakWord(word) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "ga-IE"; u.rate = 0.8;
  window.speechSynthesis.speak(u);
}

async function fetchTodayContent() {
  const r = await fetch(`${import.meta.env.BASE_URL}data/today.json`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error("not found");
  return await r.json();
}

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ display: "inline-block", width: 28, height: 28, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.navy}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

function WordChip({ part, active, onToggle }) {
  return (
    <span style={{ position: "relative", display: "inline" }}>
      <span onClick={onToggle} style={{
        cursor: "pointer",
        color: active ? "#1d4ed8" : C.blue,
        fontWeight: 600,
        textDecoration: "underline",
        textDecorationColor: active ? "#1d4ed8" : "#93c5fd",
        textDecorationThickness: "1.5px",
        textUnderlineOffset: "3px",
        background: active ? C.blueLight : "transparent",
        borderRadius: 3,
        padding: "0 2px",
        transition: "all 0.1s",
      }}>
        {part.irish}
      </span>
      {active && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: C.navy, color: "#fff", borderRadius: 8, padding: "8px 12px",
          whiteSpace: "nowrap", zIndex: 20, boxShadow: "0 8px 32px rgba(13,33,55,0.2)",
          fontSize: "0.82rem", fontFamily: "system-ui, sans-serif",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontWeight: 600 }}>{part.english}</span>
          <button onClick={e => { e.stopPropagation(); speakWord(part.irish); }}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer", color: "#fff", fontSize: "0.8rem" }}>
            🔊
          </button>
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `5px solid ${C.navy}` }} />
        </span>
      )}
    </span>
  );
}

function FeedView({ stories, loading, onStoryClick }) {
  return (
    <div>
      {loading && <Spinner />}
      {!loading && stories.map((s, i) => (
        <div key={s.id} onClick={() => onStoryClick(s)}
          style={{
            padding: "20px 0",
            borderBottom: `1px solid ${C.border}`,
            cursor: "pointer",
            animation: `fadeIn ${0.1 + i * 0.04}s ease`,
          }}
          onMouseEnter={e => e.currentTarget.querySelector("h3").style.color = C.blue}
          onMouseLeave={e => e.currentTarget.querySelector("h3").style.color = C.text}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "0.65rem", fontFamily: "system-ui, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: C.amber }}>{s.categoryIr}</span>
            <span style={{ color: C.faint, fontSize: "0.7rem", fontFamily: "system-ui, sans-serif" }}>{s.timeAgo}</span>
          </div>
          <h3 style={{ margin: "0 0 8px", fontSize: "clamp(1rem,2.8vw,1.15rem)", lineHeight: 1.3, fontWeight: 700, color: C.text, fontFamily: "Georgia, serif", transition: "color 0.15s" }}>{s.title}</h3>
          <p style={{ margin: 0, fontSize: "0.82rem", color: C.muted, lineHeight: 1.6, fontFamily: "system-ui, sans-serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.summary}</p>
        </div>
      ))}

      <div style={{ paddingTop: 32, textAlign: "center", fontFamily: "system-ui, sans-serif", fontSize: "0.7rem", color: C.faint, lineHeight: 1.9 }}>
        <div>News from RTÉ · Updated daily</div>
        <div>Created by <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer" style={{ color: C.navy, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>Joe Luca Dooley</a></div>
        <div style={{ height: "1rem" }} />
      </div>
    </div>
  );
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Find the largest font size (within a range) where the headline fits in maxLines
function fitHeadline(ctx, text, maxWidth, maxLines, maxSize, minSize, weight = "bold") {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px Georgia, serif`;
    const lines = wrapCanvasText(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return { size, lines, lineHeight: Math.round(size * 1.18) };
    }
  }
  // Doesn't fit even at min size — use min and clamp the lines
  ctx.font = `${weight} ${minSize}px Georgia, serif`;
  return { size: minSize, lines: wrapCanvasText(ctx, text, maxWidth).slice(0, maxLines), lineHeight: Math.round(minSize * 1.18) };
}

// Cover slide — opening card with date and the lead headline (keeps the grid varied)
function makeCoverCanvas(leadStory) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d2137";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  // Logo centred-ish near top
  ctx.font = "bold 72px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const totalW = d1 + d2;
  const startX = (W - totalW) / 2;
  ctx.fillText("Daily ", startX, 200);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 200);

  // Date, centred
  const dateStr = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
  ctx.textAlign = "center";
  ctx.font = "32px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText(dateStr, W / 2, 250);

  // "Príomhscéalta an lae" heading
  ctx.font = "italic 40px Georgia, serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Príomhscéalta an lae", W / 2, 370);
  ctx.font = "26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("Today's top stories, as Gaeilge", W / 2, 412);
  ctx.textAlign = "left";

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 480, W - 160, 1);

  // Lead headline (large, this is what makes each cover different in the grid)
  ctx.fillStyle = "#ffffff";
  const cf = fitHeadline(ctx, leadStory.title, W - 160, 6, 66, 40);
  ctx.font = `bold ${cf.size}px Georgia, serif`;
  const startY = 620;
  cf.lines.forEach((l, i) => ctx.fillText(l, 80, startY + i * cf.lineHeight));

  // Swipe hint bottom
  ctx.textAlign = "center";
  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Swipe to read  →", W / 2, H - 110);
  ctx.textAlign = "left";

  return canvas;
}

// Closing slide — single call to action
function makeClosingCanvas() {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d2137";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.textAlign = "center";

  // Logo
  ctx.font = "bold 72px Georgia, serif";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Daily ", startX, 480);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 480);
  ctx.textAlign = "center";

  // Main CTA
  ctx.font = "44px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Read the full stories at", W / 2, 620);
  ctx.fillText("your own level of Irish.", W / 2, 680);

  // URL
  ctx.font = "bold 38px Arial, sans-serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("joelucadooley.github.io/daily-sceal", W / 2, 800);

  // Follow line
  ctx.font = "30px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Follow @dailysceal for a little Irish each day", W / 2, 900);

  ctx.textAlign = "left";
  return canvas;
}

// Weekly recap — cover slide (cream background to distinguish from daily news)
function makeWeeklyCoverCanvas() {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.font = "bold 72px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.fillText("Daily ", startX, 200);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 200);

  ctx.textAlign = "center";
  ctx.font = "italic 56px Georgia, serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Focail na Seachtaine", W / 2, 620);
  ctx.font = "34px Arial, sans-serif";
  ctx.fillStyle = "rgba(13,33,55,0.55)";
  ctx.fillText("Words from this week's news", W / 2, 685);

  ctx.font = "bold 30px Arial, sans-serif";
  ctx.fillStyle = "#0d2137";
  ctx.fillText("Can you guess them?  →", W / 2, H - 120);
  ctx.textAlign = "left";
  return canvas;
}

// Weekly recap — a "guess" slide (Irish word alone) or "reveal" slide (with English)
function makeWordSlideCanvas(word, index, reveal) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  // Small logo top-left
  ctx.font = "bold 38px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  const d1 = ctx.measureText("Daily ").width;
  ctx.fillText("Daily ", 80, 90);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", 80 + d1, 90);

  // Word number top-right
  ctx.textAlign = "right";
  ctx.font = "28px Arial, sans-serif";
  ctx.fillStyle = "rgba(13,33,55,0.35)";
  ctx.fillText(`${index}`, W - 80, 88);
  ctx.textAlign = "center";

  // The Irish word, large and centred
  ctx.font = "bold 96px Georgia, serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText(word.irish, W / 2, reveal ? 560 : 700);

  if (reveal) {
    ctx.fillStyle = "rgba(13,33,55,0.12)";
    ctx.fillRect(W / 2 - 120, 640, 240, 2);
    ctx.font = "60px Georgia, serif";
    ctx.fillStyle = "#0d2137";
    ctx.fillText(word.english, W / 2, 760);
  } else {
    ctx.font = "32px Arial, sans-serif";
    ctx.fillStyle = "rgba(13,33,55,0.45)";
    ctx.fillText("What does it mean?", W / 2, 800);
    ctx.font = "bold 30px Arial, sans-serif";
    ctx.fillStyle = "#0d2137";
    ctx.fillText("Swipe to reveal  →", W / 2, H - 120);
  }

  ctx.textAlign = "left";
  return canvas;
}

// Weekly recap — closing slide (cream background)
function makeWeeklyClosingCanvas() {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.textAlign = "center";
  ctx.font = "bold 64px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  const d1 = ctx.measureText("Daily ").width;
  const d2 = ctx.measureText("Scéal").width;
  const startX = (W - (d1 + d2)) / 2;
  ctx.textAlign = "left";
  ctx.fillText("Daily ", startX, 520);
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", startX + d1, 520);
  ctx.textAlign = "center";

  ctx.font = "44px Georgia, serif";
  ctx.fillStyle = "#0d2137";
  ctx.fillText("A new story every day,", W / 2, 660);
  ctx.fillText("as Gaeilge.", W / 2, 720);

  ctx.font = "30px Arial, sans-serif";
  ctx.fillStyle = "rgba(13,33,55,0.5)";
  ctx.fillText("Follow @dailysceal · link in bio", W / 2, 840);
  ctx.textAlign = "left";
  return canvas;
}


// Standalone share-card generator, used by both the article page and the export page
function makeShareCanvas(story, parts, levelLabel) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0d2137";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8951e";
  ctx.fillRect(0, 0, W, 10);

  ctx.font = "bold 56px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Daily ", 80, 118);
  const dw = ctx.measureText("Daily ").width;
  ctx.fillStyle = "#e8951e";
  ctx.fillText("Scéal", 80 + dw, 118);

  const dateStr = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
  ctx.font = "30px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText(dateStr, 80, 162);

  ctx.textAlign = "right";
  ctx.font = "italic 28px Georgia, serif";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("Cad é an scéal?", W - 80, 110);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 188, W - 160, 1);

  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillStyle = "#e8951e";
  ctx.fillText((story.categoryIr || "Nuacht").toUpperCase(), 80, 244);

  ctx.font = "bold 60px Georgia, serif";
  ctx.fillStyle = "#ffffff";
  const fitted = fitHeadline(ctx, story.title, W - 160, 4, 60, 38);
  ctx.font = `bold ${fitted.size}px Georgia, serif`;
  fitted.lines.forEach((l, i) => ctx.fillText(l, 80, 316 + i * fitted.lineHeight));
  const headBottom = 316 + fitted.lines.length * fitted.lineHeight;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, headBottom + 14, W - 160, 1);

  const textY = headBottom + 60;
  const lineH = 56;
  const maxLines = Math.floor((H - textY - 150) / lineH);
  ctx.font = "36px Georgia, serif";

  const words = [];
  for (const part of parts) {
    const isIrish = part.t === "ir";
    const raw = isIrish ? part.irish : (part.v || "");
    for (const token of raw.split(/(\s+)/)) {
      if (!token || /^\s+$/.test(token)) continue;
      words.push({ token, isIrish });
    }
  }

  let fitCount = 0, simX = 80, simLines = 0;
  for (let i = 0; i < words.length; i++) {
    const w = ctx.measureText(words[i].token + " ").width;
    if (simX + w > W - 80) { simX = 80; simLines++; if (simLines >= maxLines) break; }
    simX += w;
    fitCount = i + 1;
  }

  let endIndex = fitCount;
  for (let i = fitCount - 1; i >= 0; i--) {
    if (/[.!?]$/.test(words[i].token)) { endIndex = i + 1; break; }
  }

  let x = 80, y = textY;
  for (let i = 0; i < endIndex; i++) {
    const { token, isIrish } = words[i];
    const w = ctx.measureText(token + " ").width;
    if (x + ctx.measureText(token).width > W - 80) { x = 80; y += lineH; }
    ctx.fillStyle = isIrish ? "#e8951e" : "rgba(255,255,255,0.82)";
    ctx.fillText(token, x, y);
    x += w;
  }

  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(levelLabel, 80, H - 72);
  ctx.textAlign = "right";
  ctx.font = "26px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText("joelucadooley.github.io/daily-sceal", W - 80, H - 72);
  ctx.textAlign = "left";

  return canvas;
}

function ReadingView({ story, onBack }) {
  const [pct, setPct] = useState(10);
  const [activeWord, setActiveWord] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const level = getLevel(pct);
  const parts = parseText(story.levels[pct] || story.summary);
  const irishCount = parts.filter(p => p.t === "ir").length;

  async function generateShareImage() {
    const levelName = pct === 100 ? "As Gaeilge" : (level?.label || "Beginner");
    return makeShareCanvas(story, parts, levelName);
  }

  async function handleShare() {
    setShareLoading(true);
    try {
      const canvas = await generateShareImage();
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      const file = new File([blob], "daily-sceal.png", { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: story.title });
      } else {
        // Desktop: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "daily-sceal.png"; a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Fallback to URL share
      try {
        if (navigator.share) await navigator.share({ title: story.title, url: story.link || "https://joelucadooley.github.io/daily-sceal" });
        else await navigator.clipboard?.writeText(story.link || "https://joelucadooley.github.io/daily-sceal");
      } catch {}
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 20, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
          ← Nuacht
        </button>
      </div>

      {/* Headline */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: "0.65rem", fontFamily: "system-ui, sans-serif", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: C.amber, marginBottom: 10 }}>{story.categoryIr}</div>
        <h1 style={{ margin: "0 0 8px", color: C.navy, fontSize: "clamp(1.3rem,4vw,1.75rem)", lineHeight: 1.2, fontFamily: "Georgia, serif", fontWeight: 700 }}>{story.title}</h1>
        <div style={{ fontSize: "0.72rem", color: C.faint, fontFamily: "system-ui, sans-serif" }}>{story.timeAgo}</div>
      </div>

      {/* Level selector */}
      <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "16px 18px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 700, color: pct === 100 ? "#9ca3af" : level.color }}>{pct === 100 ? "As Gaeilge" : level.label}</span>
          <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.72rem", color: C.faint }}>{pct === 100 ? "Coming soon" : level.tip}</span>
        </div>
        <div style={{ position: "relative", marginBottom: 10, display: "flex", alignItems: "center" }}>
          <input type="range" min={0} max={4} step={1} value={pct === 100 ? 4 : SNAP_LEVELS.indexOf(pct)}
            onChange={e => {
              const val = +e.target.value;
              if (val === 4) { setPct(100); setActiveWord(null); }
              else { setPct(SNAP_LEVELS[val]); setActiveWord(null); }
            }}
            style={{ width: "100%", cursor: "pointer" }}
            className="sceal-range" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "system-ui, sans-serif", fontSize: "0.63rem", color: C.faint, marginBottom: 12 }}>
          <span>More English</span><span>More Irish</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {LEVELS_CONFIG.map(l => (
            <button key={l.pct}
              onClick={() => { setPct(l.pct); setActiveWord(null); }}
              style={{
                flex: "1 1 auto",
                background: pct === l.pct ? l.bg : "transparent",
                color: pct === l.pct ? l.color : C.faint,
                border: `1px solid ${pct === l.pct ? l.color + "60" : C.border}`,
                borderRadius: 6, padding: "6px 2px", cursor: "pointer",
                fontFamily: "system-ui, sans-serif", fontSize: "0.62rem", fontWeight: 600,
                transition: "all 0.12s",
              }}>
              {l.label}
            </button>
          ))}
          <button
            onClick={() => { setPct(100); setActiveWord(null); }}
            style={{
              flex: "1 1 auto",
              background: pct === 100 ? "#f3f4f6" : "transparent",
              color: pct === 100 ? "#6b7280" : "#d1d5db",
              border: `1px dashed ${pct === 100 ? "#9ca3af" : "#e5e7eb"}`,
              borderRadius: 6, padding: "6px 2px", cursor: "pointer",
              fontFamily: "system-ui, sans-serif", fontSize: "0.62rem", fontWeight: 600,
              transition: "all 0.12s",
            }}>
            🔒 As Gaeilge
          </button>
        </div>
      </div>

      {/* Article */}
      {pct === 100 ? (
        <>
          <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 0", filter: "blur(4px)", userSelect: "none", pointerEvents: "none", opacity: 0.5, maxHeight: "4.5rem", overflow: "hidden" }}>
              <div style={{ fontSize: "clamp(1rem,2.3vw,1.06rem)", lineHeight: 2, color: C.text, fontFamily: "Georgia, serif" }}>
                {parseText(story.levels[75] || story.summary).map((p, i) =>
                  p.t === "en" ? <span key={i}>{p.v}</span> :
                    <span key={i} style={{ color: C.blue, fontWeight: 600 }}>{p.irish}</span>
                )}
              </div>
            </div>
            <div style={{ padding: "24px 24px 28px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: 12 }}>🔒</div>
              <h3 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: "1.05rem", color: C.navy, fontWeight: 700 }}>As Gaeilge</h3>
              <p style={{ margin: "0 0 16px", fontFamily: "Georgia, serif", fontSize: "0.88rem", color: C.muted, lineHeight: 1.7 }}>
                Full Irish translation requires specialist linguistic resources that are currently beyond the scope of this project. This level is a goal and one I am actively seeking support to reach.
              </p>
              <a href="https://ko-fi.com/joelucadooley" target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", background: C.amber, color: "#fff", borderRadius: 8, padding: "10px 20px", fontFamily: "system-ui, sans-serif", fontSize: "0.82rem", fontWeight: 600, textDecoration: "none" }}>
                Support the project
              </a>
            </div>
            <div style={{ padding: "16px 20px", filter: "blur(4px)", userSelect: "none", pointerEvents: "none", opacity: 0.5, maxHeight: "6rem", overflow: "hidden" }}>
              <div style={{ fontSize: "clamp(1rem,2.3vw,1.06rem)", lineHeight: 2, color: C.text, fontFamily: "Georgia, serif" }}>
                {parseText(story.levels[75] || story.summary).map((p, i) =>
                  p.t === "en" ? <span key={i}>{p.v}</span> :
                    <span key={i} style={{ color: C.blue, fontWeight: 600 }}>{p.irish}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ height: "1.5rem" }} />
        </>
      ) : (
        <>
          <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "22px 20px" }} key={pct}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.72rem", color: C.muted }}>
                <span style={{ color: C.blue, fontWeight: 600 }}>{irishCount}</span> Irish {irishCount === 1 ? "word" : "words"} in this story
              </span>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.68rem", color: C.faint, fontStyle: "italic" }}>focail Ghaeilge</span>
            </div>
            <div style={{ fontSize: "clamp(1rem,2.3vw,1.06rem)", lineHeight: 2, color: C.text, fontFamily: "Georgia, serif", marginBottom: 18 }}>
              {parts.map((p, i) =>
                p.t === "en" ? <span key={i}>{p.v}</span> :
                  <WordChip key={i} part={p} active={activeWord === i} onToggle={() => setActiveWord(a => a === i ? null : i)} />
              )}
            </div>
            <div style={{ paddingTop: 14, borderTop: `1px solid ${C.border}`, fontFamily: "system-ui, sans-serif", fontSize: "0.73rem", color: C.faint }}>
              Tap any <span style={{ color: C.blue, fontWeight: 600 }}>blue word</span> to see the English and hear it spoken
            </div>
          </div>
          <button onClick={handleShare} disabled={shareLoading}
            style={{ width: "100%", marginTop: 14, background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontFamily: "system-ui, sans-serif", fontSize: "0.88rem", fontWeight: 600, cursor: shareLoading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: shareLoading ? 0.6 : 1 }}>
            {shareLoading ? "Ag ullmhú..." : "Roinn · Share ↗"}
          </button>
          {story.link && (
            <a href={story.link} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, color: C.muted, fontFamily: "system-ui, sans-serif", fontSize: "0.78rem", textDecoration: "none" }}>
              Léigh ar RTÉ →
            </a>
          )}
          <div style={{ height: "1.5rem" }} />
        </>
      )}
    </div>
  );
}

function AboutView() {
  return (
    <div style={{ animation: "fadeIn 0.2s ease" }}>
      <div style={{ paddingBottom: 28, borderBottom: `1px solid ${C.border}`, marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 10px", fontFamily: "Georgia, serif", fontSize: "1.5rem", color: C.navy, fontWeight: 700, letterSpacing: "-0.01em" }}>Faoi Daily Scéal</h2>
        <p style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: "1rem", color: C.muted, lineHeight: 1.7, fontStyle: "italic" }}>
          Irish as it appears in the real world, every morning.
        </p>
      </div>

      <div style={{ fontFamily: "Georgia, serif", fontSize: "0.95rem", color: "#333", lineHeight: 1.85, marginBottom: 28 }}>
        <p style={{ margin: "0 0 16px" }}>
          Daily Scéal takes real news from RTÉ and lets you read it at whatever level of Irish you like. A slider moves the balance from mostly English at one end towards fully Irish at the other. Tap any blue word to see what it means and hear it spoken.
        </p>
        <p style={{ margin: 0 }}>
          The idea behind the slider comes from research into how people pick up languages. You learn best when you can follow most of what you are reading but still meet enough new words to stretch you. Each level is built around that.
        </p>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "0.95rem", color: C.navy, marginBottom: 8 }}>Lean ar Instagram</div>
        <p style={{ margin: "0 0 16px", fontFamily: "Georgia, serif", fontSize: "0.9rem", color: C.muted, lineHeight: 1.7 }}>
          A story from the day, as Gaeilge, posted daily. Follow along for a little Irish in your feed.
        </p>
        <a href="https://instagram.com/dailysceal" target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", background: C.navy, color: "#fff", borderRadius: 8, padding: "10px 18px", fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
          @dailysceal →
        </a>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginBottom: 24 }}>
        <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "0.95rem", color: C.navy, marginBottom: 8 }}>Free and open</div>
        <p style={{ margin: "0 0 16px", fontFamily: "Georgia, serif", fontSize: "0.9rem", color: C.muted, lineHeight: 1.7 }}>
          Daily Scéal is free to use and built by Joe Luca Dooley. The code is open for anyone to see on GitHub. If you would like to help it grow, you can support the project below.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: C.navy, color: "#fff", borderRadius: 8, padding: "10px 18px", fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
            View on GitHub →
          </a>
          <a href="https://ko-fi.com/joelucadooley" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: C.amber, color: "#fff", borderRadius: 8, padding: "10px 18px", fontFamily: "system-ui, sans-serif", fontSize: "0.8rem", fontWeight: 600, textDecoration: "none" }}>
            Support Joe Luca 🍻
          </a>
        </div>
      </div>

      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.7rem", color: C.faint, lineHeight: 1.9, paddingBottom: 8 }}>
        News sourced from RTÉ · New stories daily
      </div>
    </div>
  );
}

function ExportView({ stories }) {
  const [pct, setPct] = useState(10);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);
  const [enText, setEnText] = useState("");   // English words to translate to Irish
  const [gaText, setGaText] = useState("");   // Irish words to translate to English
  const [wordPairs, setWordPairs] = useState([]); // resolved {irish, english}
  const [weeklyImages, setWeeklyImages] = useState([]);
  const [translating, setTranslating] = useState(false);
  const levelLabel = LEVELS_CONFIG.find(l => l.pct === pct)?.label || "Beginner";

  function generateAll() {
    if (!stories.length) return;
    setBusy(true);
    setImages([]);
    setTimeout(() => {
      const out = [];
      out.push({ id: "cover", title: "Cover slide", url: makeCoverCanvas(stories[coverIndex] || stories[0]).toDataURL("image/png") });
      stories.forEach(story => {
        const parts = parseText(story.levels[pct] || story.summary);
        const canvas = makeShareCanvas(story, parts, levelLabel);
        out.push({ id: story.id, title: story.title, url: canvas.toDataURL("image/png") });
      });
      out.push({ id: "closing", title: "Closing slide", url: makeClosingCanvas().toDataURL("image/png") });
      setImages(out);
      setBusy(false);
    }, 50);
  }

  async function translateOne(word, from, to) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${from}|${to}&de=joelucadooley@gmail.com`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.responseStatus === 200) {
        return data.responseData.translatedText.trim().replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim();
      }
    } catch {}
    return "";
  }

  async function translateWords() {
    setTranslating(true);
    const pairs = [];
    // English -> Irish
    for (const line of enText.split("\n").map(s => s.trim()).filter(Boolean)) {
      const irish = await translateOne(line, "en", "ga");
      pairs.push({ english: line.toLowerCase(), irish: (irish || "?").toLowerCase() });
    }
    // Irish -> English
    for (const line of gaText.split("\n").map(s => s.trim()).filter(Boolean)) {
      const english = await translateOne(line, "ga", "en");
      pairs.push({ irish: line.toLowerCase(), english: (english || "?").toLowerCase() });
    }
    setWordPairs(pairs);
    setTranslating(false);
  }

  function updatePair(i, field, value) {
    setWordPairs(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  }

  function generateWeekly() {
    const words = wordPairs.filter(w => w.irish && w.english && w.irish !== "?" && w.english !== "?");
    if (!words.length) return;
    const out = [];
    out.push({ id: "w-cover", title: "Cover", url: makeWeeklyCoverCanvas().toDataURL("image/png") });
    words.forEach((w, i) => {
      out.push({ id: `w-${i}-guess`, title: `${w.irish} (guess)`, url: makeWordSlideCanvas(w, i + 1, false).toDataURL("image/png") });
      out.push({ id: `w-${i}-reveal`, title: `${w.irish} (reveal)`, url: makeWordSlideCanvas(w, i + 1, true).toDataURL("image/png") });
    });
    out.push({ id: "w-closing", title: "Closing", url: makeWeeklyClosingCanvas().toDataURL("image/png") });
    setWeeklyImages(out);
  }

  return (
    <div style={{ padding: "20px 0 40px", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ fontFamily: "Georgia, serif", color: C.navy, fontSize: "1.3rem", margin: "0 0 4px" }}>Card Export</h2>
      <p style={{ color: C.muted, fontSize: "0.82rem", margin: "0 0 18px" }}>Private tool. Generates a full carousel for today: cover slide, one card per story at the chosen level, and a closing slide. Long-press each to save.</p>

      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {LEVELS_CONFIG.map(l => (
          <button key={l.pct} onClick={() => setPct(l.pct)}
            style={{ flex: "1 1 auto", background: pct === l.pct ? l.bg : "transparent", color: pct === l.pct ? l.color : C.faint, border: `1px solid ${pct === l.pct ? l.color + "60" : C.border}`, borderRadius: 6, padding: "7px 2px", cursor: "pointer", fontSize: "0.66rem", fontWeight: 600 }}>
            {l.label}
          </button>
        ))}
      </div>

      <label style={{ display: "block", fontSize: "0.72rem", color: C.muted, marginBottom: 6, fontWeight: 600 }}>Cover story (shown on slide 1)</label>
      <select value={coverIndex} onChange={e => setCoverIndex(+e.target.value)}
        style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.8rem", marginBottom: 16, background: "#fff", color: C.text, fontFamily: "system-ui, sans-serif" }}>
        {stories.map((s, i) => (
          <option key={s.id} value={i}>{i + 1}. {s.title}</option>
        ))}
      </select>

      <button onClick={generateAll} disabled={busy}
        style={{ width: "100%", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: "0.88rem", fontWeight: 600, cursor: busy ? "wait" : "pointer", marginBottom: 24, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Generating..." : `Generate ${levelLabel} cards`}
      </button>

      {images.map((img, i) => (
        <div key={img.id} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: "0.7rem", color: C.faint, marginBottom: 6 }}>{i + 1}. {img.title}</div>
          <img src={img.url} alt={img.title} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
          <a href={img.url} download={`daily-sceal-${pct}-${i + 1}.png`}
            style={{ display: "inline-block", marginTop: 8, color: C.navy, fontSize: "0.78rem", fontWeight: 600, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>
            Download card {i + 1} ↓
          </a>
        </div>
      ))}

      <div style={{ marginTop: 40, paddingTop: 24, borderTop: `2px solid ${C.border}` }}>
        <h2 style={{ fontFamily: "Georgia, serif", color: C.navy, fontSize: "1.15rem", margin: "0 0 4px" }}>Focail na Seachtaine</h2>
        <p style={{ color: C.muted, fontSize: "0.8rem", margin: "0 0 14px" }}>Sunday recap carousel. Type a few key words (one per line) in either box, translate, check them, then generate a guess-and-reveal carousel. Three or four words works best.</p>

        <label style={{ display: "block", fontSize: "0.72rem", color: C.muted, marginBottom: 4, fontWeight: 600 }}>English words (→ Irish)</label>
        <textarea value={enText} onChange={e => setEnText(e.target.value)}
          rows={3} placeholder={"government\nhousing\ntrial"}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.85rem", marginBottom: 12, resize: "vertical", boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: "0.72rem", color: C.muted, marginBottom: 4, fontWeight: 600 }}>Irish words (→ English)</label>
        <textarea value={gaText} onChange={e => setGaText(e.target.value)}
          rows={3} placeholder={"rialtas\ntithíocht"}
          style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: "0.85rem", marginBottom: 12, resize: "vertical", boxSizing: "border-box" }} />

        <button onClick={translateWords} disabled={translating}
          style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: "0.85rem", fontWeight: 600, cursor: translating ? "wait" : "pointer", marginBottom: 16, opacity: translating ? 0.6 : 1 }}>
          {translating ? "Translating..." : "Translate"}
        </button>

        {wordPairs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "0.72rem", color: C.muted, marginBottom: 8 }}>Check and edit if needed:</p>
            {wordPairs.map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input value={w.irish} onChange={e => updatePair(i, "irish", e.target.value)}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: "0.82rem", color: C.amber, fontWeight: 600 }} />
                <input value={w.english} onChange={e => updatePair(i, "english", e.target.value)}
                  style={{ flex: 1, padding: "8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: "0.82rem" }} />
              </div>
            ))}
            <button onClick={generateWeekly}
              style={{ width: "100%", background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "13px", fontSize: "0.88rem", fontWeight: 600, cursor: "pointer", marginTop: 10 }}>
              Generate weekly carousel
            </button>
          </div>
        )}

        {weeklyImages.map((img, i) => (
          <div key={img.id} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: "0.7rem", color: C.faint, marginBottom: 6 }}>{i + 1}. {img.title}</div>
            <img src={img.url} alt={img.title} style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
            <a href={img.url} download={`daily-sceal-week-${i + 1}.png`}
              style={{ display: "inline-block", marginTop: 8, color: C.navy, fontSize: "0.78rem", fontWeight: 600, textDecoration: "none", borderBottom: `1px solid ${C.border}` }}>
              Download slide {i + 1} ↓
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DailySceal() {
  const [view, setView] = useState("feed");
  const [stories, setStories] = useState(FALLBACK_STORIES);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState(null);
  const isExport = typeof window !== "undefined" && (window.location.hash === "#export" || window.location.search.includes("export=1"));

  useEffect(() => {
    fetchTodayContent()
      .then(data => { if (data?.stories?.length) setStories(data.stories); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openStory(story) {
    setActiveStory(story);
    setView("reading");
    window.scrollTo(0, 0);
  }

  const todayFmt = new Date().toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 3px; background: ${C.border}; border-radius: 2px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: ${C.navy}; border-radius: 50%; cursor: pointer; border: 2px solid #fff; box-shadow: 0 1px 6px rgba(13,33,55,0.2); }
        .sceal-range { background: linear-gradient(to right, ${C.border} 0%, ${C.border} 80%, #ede8e0 80%, #f0ede8 100%) !important; }
        button:active { opacity: 0.7; }
        a:hover { opacity: 0.75; }
      `}</style>

      {/* Header */}
      <header style={{ background: C.navy, borderBottom: `3px solid ${C.amber}` }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div onClick={() => setView("feed")} style={{ cursor: "pointer" }}>
            <div style={{ fontSize: "clamp(1.2rem,3.5vw,1.5rem)", fontWeight: 700, color: "#fff", fontFamily: "Georgia, serif", letterSpacing: "-0.01em", lineHeight: 1 }}>
              Daily <span style={{ color: C.amber }}>Scéal</span>
            </div>
            <div style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.4)", fontFamily: "system-ui, sans-serif", marginTop: 3, letterSpacing: "0.03em" }}>{todayFmt}</div>
          </div>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.03em" }}>Cad é an scéal?</div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "0 20px 120px" }}>
        <div style={{ background: view === "about" || isExport ? "transparent" : C.card, borderLeft: isExport ? "none" : `1px solid ${C.border}`, borderRight: isExport ? "none" : `1px solid ${C.border}`, borderBottom: isExport ? "none" : `1px solid ${C.border}`, borderRadius: "0 0 12px 12px", padding: "0 20px", minHeight: 400 }}>
          {isExport && <ExportView stories={stories} />}
          {!isExport && view === "feed" && <FeedView stories={stories} loading={loading} onStoryClick={openStory} />}
          {!isExport && view === "reading" && activeStory && (
            <div style={{ paddingTop: 20 }}>
              <ReadingView story={activeStory} onBack={() => setView("feed")} />
            </div>
          )}
          {!isExport && view === "about" && (
            <div style={{ paddingTop: 28 }}>
              <AboutView />
            </div>
          )}
        </div>
      </main>

      {/* Bottom nav */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.96)", borderTop: `1px solid ${C.border}`, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 100 }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {[
            { id: "feed", label: "Nuacht", icon: "📰" },
            { id: "about", label: "Faoi", icon: "🍀" },
          ].map(tab => {
            const active = view === tab.id || (tab.id === "feed" && view === "reading");
            return (
            <button key={tab.id} onClick={() => setView(tab.id)}
              style={{ background: "none", border: "none", padding: "11px 0 9px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}
            >
              {active && <span style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 2, background: C.navy, borderRadius: "0 0 2px 2px" }} />}
              <span style={{ fontSize: "1.1rem" }}>{tab.icon}</span>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: active ? C.navy : C.faint, transition: "color 0.15s" }}>{tab.label}</span>
            </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
