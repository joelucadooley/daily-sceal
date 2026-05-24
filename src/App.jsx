import { useState, useEffect, useCallback } from "react";

const NAVY = "#0f2942", AMBER = "#f5a623", CREAM = "#f8f6f1";

const FOCAL_AN_LAE = [
  { irish: "Fáilte", english: "Welcome", pron: "FAWL-cha", note: "Fáilte go hÉirinn — Welcome to Ireland" },
  { irish: "Go raibh maith agat", english: "Thank you", pron: "guh REV mah AH-gut", note: "Said after any kindness" },
  { irish: "Conas atá tú?", english: "How are you?", pron: "KUN-us ah-TAW too", note: "The everyday Irish greeting" },
  { irish: "Céad míle fáilte", english: "A hundred thousand welcomes", pron: "KADE MEE-lah FAWL-cha", note: "The most famous Irish phrase" },
  { irish: "Is breá liom é", english: "I love it", pron: "iss BRAW lum AY", note: "Express enthusiasm about anything!" },
  { irish: "Slán go fóill", english: "Goodbye for now", pron: "SLAWN guh FOIL", note: "A warm farewell between friends" },
  { irish: "Tá sé go hálainn", english: "It is beautiful", pron: "taw shay guh HAW-lin", note: "Use for scenery, music, art" },
];

const CAT_MAP = {
  ireland: "Éire", sport: "Spórt", politics: "Polaitíocht",
  business: "Gnó", entertainment: "Siamsaíocht", world: "Domhan",
  health: "Sláinte", science: "Eolaíocht", technology: "Teicneolaíocht",
  culture: "Cultúr", weather: "Aimsir", travel: "Taisteal",
};

const FALLBACK_STORIES = [
  {
    id: "f1", title: "Government Announces Ambitious New Housing Plan",
    summary: "The Irish government has unveiled a major new housing strategy, promising to build fifty thousand homes over the next three years. The plan focuses heavily on affordable housing in Dublin, Cork, and Galway, where rents have reached record highs. The Taoiseach said the plan would be the largest state investment in housing since the 1970s, and that construction would begin before the end of the year.",
    category: "Ireland", categoryIr: "Éire", timeAgo: "2h ago",
    levels: {
      10: "The Irish [[rialtas|government]] has unveiled a new strategy to build fifty thousand [[tithe|homes]] over the next three years, with a focus on affordable [[tithíocht|housing]] in Dublin, Cork, and Galway.",
      25: "The Irish [[rialtas|government]] has unveiled a new [[straitéis|strategy]] to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]], with a [[fócas|focus]] on affordable [[tithíocht|housing]] in Dublin, Cork, and Galway.",
      50: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a new [[straitéis|strategy]] to [[tógáil|build]] fifty thousand [[tithe|homes]] over the [[trí bliana|next three years]], with a [[fócas|focus]] on [[tithíocht inacmhainne|affordable housing]] in Dublin, Cork, and Galway.",
      75: "Tá an [[rialtas|government]] Éireannach tar éis [[straitéis|strategy]] nua a [[nochtadh|unveil]] chun caoga míle [[teach|home]] a [[tógáil|build]] thar na [[trí bliana|three years]] amach romhainn, le [[fócas|focus]] ar [[tithíocht inacmhainne|affordable housing]] i mBaile Átha Cliath, Corcaigh, agus Gaillimh.",
      100: "Tá an [[rialtas|government]] [[Éireannach|Irish]] tar éis [[straitéis|strategy]] nua a [[nochtadh|unveil]] chun caoga míle [[teach|home]] a [[tógáil|build]] thar na [[trí bliana|three years]] amach [[romhainn|ahead of us]], le [[fócas|focus]] ar [[tithíocht inacmhainne|affordable housing]] i mBaile Átha Cliath, Corcaigh, agus Gaillimh.",
    }
  },
  {
    id: "f2", title: "Leinster Rugby Reach Champions Cup Quarterfinals",
    summary: "Leinster Rugby secured their place in the Champions Cup quarterfinals with a dominant performance against Toulouse at the Aviva Stadium on Friday night. Two first-half tries put Leinster firmly in control, and despite a spirited Toulouse comeback in the second half, the Irish province held on to win by eleven points. Coach Leo Cullen praised the team's discipline and said he was looking forward to the draw for the last eight.",
    category: "Sport", categoryIr: "Spórt", timeAgo: "4h ago",
    levels: {
      10: "Leinster [[rugbaí|Rugby]] secured their place in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a convincing performance against Toulouse at the Aviva [[Staidiam|Stadium]] on Friday [[oíche|night]].",
      25: "Leinster [[rugbaí|Rugby]] [[dhaingniú|secured]] their [[áit|place]] in the Champions Cup [[ceathrúchrainn|quarterfinals]] with a [[láidir|convincing]] [[cluiche|performance]] against Toulouse at the Aviva [[Staidiam|Stadium]] on Friday [[oíche|night]].",
      50: "Leinster [[rugbaí|Rugby]] [[dhaingniú|secured]] their [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[láidir|convincing]] in éadan Toulouse ag an Aviva [[Staidiam|Stadium]] Dé [[hAoine|Friday]] [[san oíche|at night]].",
      75: "[[Dhaingniú|Secured]] Leinster [[rugbaí|Rugby]] a [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[láidir|convincing]] in [[éadan|against]] Toulouse ag an Aviva [[Staidiam|Stadium]] Dé [[hAoine|Friday]] [[san oíche|at night]]. [[Bhí|was]] an [[slua|crowd]] ar bís [[ón tús|from the start]].",
      100: "[[Dhaingniú|Secured]] Leinster [[rugbaí|Rugby]] a [[áit|place]] sna Champions Cup [[ceathrúchrainn|quarterfinals]] le [[cluiche|performance]] [[láidir|convincing]] in [[éadan|against]] Toulouse ag an Aviva [[Staidiam|Stadium]] Dé [[hAoine|Friday]] [[san oíche|at night]]. [[Bhí|was]] an [[slua|crowd]] ar [[bís|edge of seat]] [[ón tús|from the start]].",
    }
  },
  {
    id: "f3", title: "Wild Atlantic Way Voted Top European Scenic Drive",
    summary: "Ireland's Wild Atlantic Way has been voted the best scenic drive in Europe by Condé Nast Traveller magazine, beating routes in Norway, Scotland, and the Amalfi Coast. The 2,500 kilometre route stretches from Donegal in the north to Cork in the south, passing through some of the most dramatic coastline on the continent. Tourism Ireland said the award could not have come at a better time, with bookings for the west coast already up thirty percent on last year.",
    category: "Travel", categoryIr: "Taisteal", timeAgo: "6h ago",
    levels: {
      10: "Ireland's famous coastal [[bealach|route]] has been voted the best scenic [[tiomáint|drive]] in Europe by a leading [[irisleabhar|magazine]], boosting hopes for a record summer [[turasóireacht|tourism]] season.",
      25: "Ireland's [[cáiliúil|famous]] coastal [[bealach|route]] has been [[vótáilte|voted]] the best scenic [[tiomáint|drive]] in Europe by a [[ceannasach|leading]] travel [[irisleabhar|magazine]], [[treisiú|boosting]] [[dóchas|hopes]] for a [[taifead|record]] summer [[turasóireacht|tourism]] season.",
      50: "Ireland's [[cáiliúil|famous]] coastal [[bealach|route]] has been [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] in Europe ag [[irisleabhar|magazine]] taistil [[ceannasach|leading]], ag [[treisiú|boosting]] [[dóchas|hopes]] do [[séasúr turasóireachta|tourism season]] [[samhraidh|summer]] [[taifead|record]].",
      75: "Tá [[bealach|route]] cósta [[cáiliúil|famous]] na hÉireann [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]] ag [[irisleabhar|magazine]] taistil [[ceannasach|leading]]. Tá [[dóchas|hope]] ann go mbeidh [[séasúr turasóireachta|tourism season]] [[taifead|record]] ann an [[samhradh|summer]] seo.",
      100: "Tá [[bealach|route]] [[cósta|coastal]] [[cáiliúil|famous]] na [[hÉireann|Ireland]] [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]] ag [[irisleabhar|magazine]] [[taistil|travel]] [[ceannasach|leading]]. Tá [[dóchas|hope]] ann go mbeidh [[séasúr turasóireachta|tourism season]] [[taifead|record]] ann an [[samhradh|summer]] seo.",
    }
  },
  {
    id: "f4", title: "New Irish Language Tech Hub Opens in Galway",
    summary: "A new technology centre dedicated entirely to Irish language software and artificial intelligence has officially opened in Galway city. The hub, funded jointly by the state and private investors, will focus on developing tools that make Irish more accessible in everyday digital life, from voice assistants to translation software. Over one hundred jobs have been created, with another fifty expected by the end of the year. The Minister for the Gaeltacht described it as a landmark moment for the language.",
    category: "Technology", categoryIr: "Teicneolaíocht", timeAgo: "8h ago",
    levels: {
      10: "A new [[teicneolaíocht|technology]] centre dedicated to developing Irish [[bogearraí|software]] and AI tools has opened in Galway, creating over one hundred new [[poist|jobs]] in the [[réigiún|region]].",
      25: "A new [[teicneolaíocht|technology]] [[ionad|centre]] [[dírithe|dedicated]] to [[forbairt|developing]] Irish [[bogearraí|software]] and AI tools has [[oscailte|opened]] in Galway, [[cruthú|creating]] over one hundred new [[poist|jobs]] in the [[réigiún|region]].",
      50: "[[Osclaíodh|Opened]] [[ionad teicneolaíochta|technology centre]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[uirlisí|tools]] AI a [[fhorbairt|develop]], ag [[cruthú|creating]] níos mó ná céad [[post|job]] nua sa [[réigiún|region]].",
      75: "[[Osclaíodh|Opened]] [[ionad teicneolaíochta|technology centre]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[uirlisí|tools]] AI a [[fhorbairt|develop]]. [[Cruthaíodh|Created]] níos mó ná céad [[post|job]] nua sa [[réigiún|region]]. [[Dúirt|Said]] [[urlabhraí|spokesperson]] gur [[céim|step]] mhór é seo don [[teanga|language]].",
      100: "[[Osclaíodh|Opened]] [[ionad teicneolaíochta|technology centre]] nua i nGaillimh atá [[dírithe|dedicated]] ar [[bogearraí|software]] Gaeilge agus [[uirlisí|tools]] AI a [[fhorbairt|develop]]. [[Cruthaíodh|Created]] níos mó ná céad [[post|job]] nua sa [[réigiún|region]], rud a [[léiríonn|shows]] an [[suim|interest]] mór sa [[Ghaeilge|Irish language]] [[digiteach|digital]].",
    }
  },
  {
    id: "f5", title: "Record Numbers Visit National Museums This Year",
    summary: "Irish national museums and galleries have recorded their highest ever visitor numbers, with more than four million people passing through their doors since January. The National Museum, the National Gallery, and the Irish Museum of Modern Art all reported significant increases compared to last year. Officials credited a combination of free admission, improved facilities, and a growing interest in Irish history and culture. The figures do not yet include summer visitors, meaning the full year total could break all previous records.",
    category: "Culture", categoryIr: "Cultúr", timeAgo: "10h ago",
    levels: {
      10: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have reported record [[cuairteoir|visitor]] numbers, with over four million [[daoine|people]] attending cultural [[institiúidí|institutions]] across the country since January.",
      25: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have [[tuairiscithe|reported]] record [[cuairteoir|visitor]] numbers, with over four million [[daoine|people]] [[ag freastal|attending]] cultural [[institiúidí|institutions]] across the [[tír|country]] since January.",
      50: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] náisiúnta na hÉireann [[tuairiscithe|reported]] líon [[taifead|record]] [[cuairteoirí|visitors]], le níos mó ná ceithre milliún [[duine|person]] ag [[freastal|attending]] ar [[institiúidí cultúrtha|cultural institutions]] ar fud na [[tíre|country]] ó [[Eanáir|January]].",
      75: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann ag [[tuairisciú|reporting]] líon [[taifead|record]] [[cuairteoirí|visitors]] i [[mbliana|this year]]. [[Tháinig|Came]] níos mó ná ceithre milliún [[duine|person]] chuig [[institiúidí cultúrtha|cultural institutions]] ar fud na [[tíre|country]] ó [[Eanáir|January]].",
      100: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na [[hÉireann|Ireland]] ag [[tuairisciú|reporting]] líon [[taifead|record]] [[cuairteoirí|visitors]] i [[mbliana|this year]]. [[Tháinig|Came]] níos mó ná ceithre [[milliún|million]] [[duine|person]] chuig [[institiúidí cultúrtha|cultural institutions]] ar fud na [[tíre|country]] ó [[Eanáir|January]] i [[leith|onwards]].",
    }
  },
  {
    id: "f6", title: "Met Éireann Forecasts Warmest June in Decades",
    summary: "Met Éireann has forecast an exceptionally warm and dry June, with temperatures expected to reach twenty-six degrees in parts of the country. The forecast is good news for farmers and the tourism sector, though water conservation warnings have already been issued in several counties. Meteorologists say a high pressure system sitting over the Atlantic is responsible for the settled spell, and that it could persist well into July. It would make this June the warmest since records began in the 1940s.",
    category: "Weather", categoryIr: "Aimsir", timeAgo: "12h ago",
    levels: {
      10: "Met Éireann has forecast an exceptionally warm and dry [[Meitheamh|June]], with [[teocht|temperatures]] expected to reach twenty-six [[céim|degrees]] in parts of the [[tír|country]].",
      25: "Met Éireann has [[réamhaisnéisithe|forecast]] an exceptionally [[te|warm]] and [[tirim|dry]] [[Meitheamh|June]], with [[teochtaí|temperatures]] [[ag súil|expected]] to reach twenty-six [[céim|degrees]] in [[codanna|parts]] of the [[tír|country]].",
      50: "Tá Met Éireann tar éis [[Meitheamh|June]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]].",
      75: "Tá Met Éireann tar éis [[Meitheamh|June]] [[eisceachtúil|exceptional]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] na [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]].",
      100: "Tá Met Éireann tar éis [[Meitheamh|June]] [[eisceachtúil|exceptional]] [[te|warm]] agus [[tirim|dry]] a [[réamhaisnéis|forecast]] don [[tír|country]]. Táthar ag [[súil|expecting]] go [[sroichfidh|reach]] na [[teochtaí|temperatures]] fiche a sé [[céim|degrees]] i [[gcodanna|parts]] den [[tír|country]], rud a [[dhéanfadh|would make]] é ar cheann de na [[Meitheamh|Junes]] is [[teo|hottest]] le [[scór bliain|twenty years]].",
    }
  },
];

const SNAP_LEVELS = [10, 25, 50, 75, 100];

const LEVELS_CONFIG = [
  { pct: 10, label: "Beginner", color: "#16a34a", bg: "#dcfce7", tip: "Key nouns only" },
  { pct: 25, label: "Elementary", color: "#2563eb", bg: "#dbeafe", tip: "Nouns and verbs" },
  { pct: 50, label: "Intermediate", color: "#d97706", bg: "#fef3c7", tip: "Most content words" },
  { pct: 75, label: "Advanced", color: "#7c3aed", bg: "#ede9fe", tip: "Near-fluent" },
  { pct: 100, label: "As Gaeilge", color: NAVY, bg: "#e0e7ff", tip: "Full immersion" },
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

function Spinner({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <div style={{ display: "inline-block", width: 34, height: 34, border: "3px solid #e0d8cc", borderTop: "3px solid " + NAVY, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <p style={{ marginTop: 12, color: "#999", fontFamily: "sans-serif", fontSize: "0.84rem" }}>{msg || "Ag lódáil..."}</p>
    </div>
  );
}

function WordChip({ part, active, onToggle }) {
  return (
    <span style={{ position: "relative", display: "inline" }}>
      <span onClick={onToggle} style={{ cursor: "pointer", borderBottom: "2px solid " + (active ? "#1d4ed8" : "#93c5fd"), color: active ? "#1d4ed8" : "#2563eb", fontWeight: 600, background: active ? "#dbeafe" : "transparent", borderRadius: 2, padding: "0 1px", transition: "all 0.12s" }}>
        {part.irish}
      </span>
      {active && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: NAVY, color: "#fff", borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap", zIndex: 20, boxShadow: "0 4px 18px rgba(0,0,0,0.28)", fontSize: "0.82rem", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{part.english}</span>
          <button onClick={e => { e.stopPropagation(); speakWord(part.irish); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 5, padding: "2px 7px", cursor: "pointer", color: "#fff", fontSize: "0.82rem" }}>🔊</button>
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid " + NAVY }} />
        </span>
      )}
    </span>
  );
}

function Footer() {
  return (
    <div style={{ textAlign: "center", padding: "28px 16px 8px", fontFamily: "sans-serif", fontSize: "0.72rem", color: "#ccc", lineHeight: 2 }}>
      <div>
        Created by{" "}
        <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer"
          style={{ color: NAVY, fontWeight: 600, textDecoration: "none", borderBottom: "1px solid #c8d8e4" }}>
          Joe Luca Dooley
        </a>
      </div>
      <div style={{ color: "#ddd" }}>News sourced from RTÉ</div>
    </div>
  );
}

function FeedView({ stories, loading, onStoryClick }) {
  const focal = FOCAL_AN_LAE[new Date().getDay() % FOCAL_AN_LAE.length];
  const [flipped, setFlipped] = useState(false);
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.09em", color: "#aaa", fontFamily: "sans-serif", marginBottom: 7 }}>✦ Focal an Lae · Word of the Day</div>
        <div onClick={() => setFlipped(f => !f)} style={{ background: NAVY, borderRadius: 14, padding: "20px 20px 18px", cursor: "pointer", minHeight: 90, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 150, height: 150, background: "rgba(245,166,35,0.07)", borderRadius: "50%" }} />
          {!flipped ? (
            <div>
              <div style={{ fontSize: "clamp(1.5rem,4vw,2rem)", fontWeight: 700, color: AMBER, fontFamily: "Georgia,serif", marginBottom: 5 }}>{focal.irish}</div>
              <div style={{ fontSize: "0.78rem", color: "#93b4cc", fontFamily: "sans-serif" }}>Tap to reveal · <em>{focal.pron}</em></div>
            </div>
          ) : (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div style={{ fontSize: "1.15rem", fontWeight: 600, color: "#fff", fontFamily: "Georgia,serif", marginBottom: 5 }}>{focal.english}</div>
              <div style={{ fontSize: "0.82rem", color: "#93b4cc", fontStyle: "italic", fontFamily: "sans-serif" }}>{focal.note}</div>
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); speakWord(focal.irish); }} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "#fff", fontSize: "0.9rem" }}>🔊</button>
        </div>
      </div>
      <div style={{ fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.09em", color: "#aaa", fontFamily: "sans-serif", marginBottom: 9 }}>📰 Nuacht an Lae · Today's News</div>
      {loading && <Spinner msg="Ag lódáil nuacht..." />}
      {!loading && stories.map((s, i) => (
        <div key={s.id} onClick={() => onStoryClick(s)}
          style={{ background: "#fff", borderRadius: 12, padding: "15px 16px", marginBottom: 9, border: "1px solid #e0d8cc", borderLeft: "4px solid " + NAVY, cursor: "pointer", transition: "box-shadow 0.15s,transform 0.15s", animation: "fadeIn " + (0.08 + i * 0.04) + "s ease" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 18px rgba(0,0,0,0.09)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, gap: 8 }}>
            <span style={{ background: CREAM, color: NAVY, borderRadius: 4, padding: "2px 9px", fontSize: "0.66rem", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.categoryIr} · {s.category}</span>
            <span style={{ color: "#ccc", fontSize: "0.67rem", fontFamily: "sans-serif", whiteSpace: "nowrap" }}>{s.timeAgo}</span>
          </div>
          <h3 style={{ margin: "0 0 5px", fontSize: "clamp(0.92rem,2.3vw,1.02rem)", lineHeight: 1.35, fontWeight: 700, color: "#111", fontFamily: "Georgia,serif" }}>{s.title}</h3>
          <p style={{ margin: "0 0 9px", fontSize: "0.79rem", color: "#777", lineHeight: 1.5, fontFamily: "sans-serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.summary}</p>
          <span style={{ fontSize: "0.72rem", color: NAVY, fontFamily: "sans-serif", fontWeight: 600 }}>Léigh as Gaeilge →</span>
        </div>
      ))}
      <Footer />
    </div>
  );
}

function ReadingView({ story, onBack }) {
  const [pct, setPct] = useState(10);
  const [activeWord, setActiveWord] = useState(null);
  const level = getLevel(pct);
  const parts = parseText(story.levels[pct] || story.summary);
  const irishCount = parts.filter(p => p.t === "ir").length;
  const totalWords = parts.filter(p => p.t === "en" || p.t === "ir").reduce((acc, p) => acc + (p.v ? p.v.trim().split(/\s+/).filter(Boolean).length : 1), 0);
  const actualPct = totalWords > 0 ? Math.round((irishCount / totalWords) * 100) : 0;

  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: NAVY, fontFamily: "sans-serif", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", padding: "0 0 18px", display: "flex", alignItems: "center", gap: 5 }}>
        ← Ar ais · Back to news
      </button>
      <div style={{ background: NAVY, borderRadius: 14, padding: "20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: -30, right: -30, width: 120, height: 120, background: "rgba(245,166,35,0.08)", borderRadius: "50%" }} />
        <span style={{ background: CREAM, color: NAVY, borderRadius: 4, padding: "2px 9px", fontSize: "0.66rem", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{story.categoryIr} · {story.category}</span>
        <h2 style={{ margin: "10px 0 8px", color: "#fff", fontSize: "clamp(1.05rem,3vw,1.35rem)", lineHeight: 1.3, fontFamily: "Georgia,serif", fontWeight: 700 }}>{story.title}</h2>
        <p style={{ margin: 0, color: "#93b4cc", fontSize: "0.82rem", fontStyle: "italic", lineHeight: 1.55, fontFamily: "sans-serif" }}>{story.summary}</p>
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #e0d8cc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "#aaa", fontFamily: "sans-serif", marginBottom: 3 }}>How much Irish?</div>
            <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: "1rem", color: level.color }}>{level.label} <span style={{ fontFamily: "sans-serif", fontWeight: 400, fontSize: "0.74rem", color: "#ccc" }}>· {level.tip}</span></div>
          </div>
          <div style={{ background: NAVY, color: AMBER, borderRadius: 9, padding: "5px 13px", fontFamily: "sans-serif", fontWeight: 700, fontSize: "1rem" }}>
            {pct}% <span style={{ fontSize: "0.66rem", color: "#93b4cc", fontWeight: 400 }}>Irish</span>
          </div>
        </div>
        <input type="range" min={0} max={4} step={1} value={SNAP_LEVELS.indexOf(pct)} onChange={e => { setPct(SNAP_LEVELS[+e.target.value]); setActiveWord(null); }} style={{ width: "100%", cursor: "pointer", margin: "2px 0 6px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "sans-serif", fontSize: "0.66rem", color: "#ccc", marginBottom: 14 }}><span>English</span><span>As Gaeilge</span></div>
        <div style={{ display: "flex", gap: 5 }}>
          {LEVELS_CONFIG.map(l => (
            <button key={l.pct} onClick={() => { setPct(l.pct); setActiveWord(null); }}
              style={{ flex: "1 1 auto", background: pct === l.pct ? l.bg : "#f5f5f5", color: pct === l.pct ? l.color : "#bbb", border: "1px solid " + (pct === l.pct ? l.color : "#ebebeb"), borderRadius: 7, padding: "5px 2px", cursor: "pointer", fontFamily: "sans-serif", fontSize: "0.65rem", fontWeight: 600, transition: "all 0.12s" }}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ background: "#fff", borderRadius: 12, padding: "22px", border: "1px solid #e0d8cc", animation: "fadeIn 0.2s ease" }} key={pct}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f0ece4" }}>
          <span style={{ fontFamily: "sans-serif", fontSize: "0.75rem", color: "#888" }}>
            <span style={{ color: "#2563eb", fontWeight: 700 }}>{irishCount} focal Gaeilge</span>
            {" "}· {actualPct}% Irish
          </span>
          <span style={{ fontFamily: "sans-serif", fontSize: "0.7rem", color: "#ccc" }}>Tap words to translate</span>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: "clamp(0.97rem,2.2vw,1.06rem)", lineHeight: 1.95, color: "#222", fontFamily: "Georgia,serif" }}>
          {parts.map((p, i) =>
            p.t === "en" ? <span key={i}>{p.v}</span> :
              <WordChip key={i} part={p} active={activeWord === i} onToggle={() => setActiveWord(a => a === i ? null : i)} />
          )}
        </p>
        <div style={{ borderTop: "1px solid #f0ece4", paddingTop: 14, fontFamily: "sans-serif", fontSize: "0.77rem", color: "#aaa", display: "flex", gap: 6, alignItems: "center" }}>
          <span>💡</span>
          <span>Tap any <span style={{ color: "#2563eb", fontWeight: 600 }}>blue word</span> to see its English and hear it spoken</span>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function AboutView() {
  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <div style={{ background: NAVY, borderRadius: 16, padding: "28px 22px", marginBottom: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -50, right: -50, width: 180, height: 180, background: "rgba(245,166,35,0.07)", borderRadius: "50%" }} />
        <div style={{ fontSize: "clamp(1.9rem,5vw,2.6rem)", fontWeight: 700, color: "#fff", fontFamily: "Georgia,serif", lineHeight: 1 }}>
          Daily <span style={{ color: AMBER, fontStyle: "italic" }}>Scéal</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: "sans-serif", fontSize: "0.81rem", color: "#93b4cc" }}>Foghlaim Gaeilge gach lá · Learn Irish every day</div>
      </div>
      {[
        { t: "Cad é Daily Scéal?", b: "Daily Scéal brings you real Irish news stories every day, with a simple slider to control how much of each article is in Irish. No account, no pressure — just read and pick up the language naturally." },
        { t: "Conas a oibríonn sé? · How does it work?", b: "Tap any news story and set your Irish level. At 10% you'll see just a few key words in Irish. Nudge it up whenever you feel ready. Tap any blue underlined word to see the English and hear it spoken aloud." },
        { t: "An Ionchur Intuigthe · Comprehensible Input", b: "Language research shows we learn best when we understand most of what we're reading but are stretched just enough. The slider puts you in that sweet spot, at whatever level suits you today." },
        { t: "Faoin nGaeilge · About Irish", b: "Irish (Gaeilge) is a Celtic language spoken natively along Ireland's western coast and by communities worldwide. One of Europe's oldest written languages, with a literary tradition stretching back 1,500 years." },
        { t: "Focal an Lae · Word of the Day", b: "Each day on the home screen you'll find a new Irish phrase. Tap to reveal the meaning, and use the speaker to hear how it's said. A little something to carry with you — no quiz, no pressure." },
      ].map(({ t, b }) => (
        <div key={t} style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", marginBottom: 10, border: "1px solid #e0d8cc" }}>
          <h3 style={{ margin: "0 0 7px", fontFamily: "Georgia,serif", fontSize: "0.98rem", color: NAVY }}>{t}</h3>
          <p style={{ margin: 0, fontFamily: "sans-serif", fontSize: "0.82rem", color: "#555", lineHeight: 1.65 }}>{b}</p>
        </div>
      ))}
      <Footer />
    </div>
  );
}

export default function DailySceal() {
  const [view, setView] = useState("feed");
  const [stories, setStories] = useState(FALLBACK_STORIES);
  const [loading, setLoading] = useState(true);
  const [activeStory, setActiveStory] = useState(null);

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
  const NAV = [
    { id: "feed", icon: "📰", label: "Nuacht" },
    { id: "reading", icon: "📖", label: "Léigh", disabled: !activeStory },
    { id: "about", icon: "ℹ️", label: "Faoi" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: CREAM }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        *{box-sizing:border-box}
        input[type=range]{-webkit-appearance:none;appearance:none;height:5px;background:#e0d8cc;border-radius:3px;outline:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;background:${NAVY};border-radius:50%;cursor:pointer;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.2)}
        button:active{opacity:0.8}
        a:hover{opacity:0.75}
      `}</style>
      <header style={{ background: NAVY, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 20px rgba(0,0,0,0.25)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 18px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div onClick={() => setView("feed")} style={{ cursor: "pointer" }}>
            <div style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 700, color: "#fff", lineHeight: 1, fontFamily: "Georgia,serif" }}>
              Daily <span style={{ color: AMBER, fontStyle: "italic" }}>Scéal</span>
            </div>
            <div style={{ fontSize: "0.66rem", color: "#93b4cc", fontFamily: "sans-serif", letterSpacing: "0.05em", marginTop: 2 }}>{todayFmt}</div>
          </div>
          <div style={{ fontFamily: "sans-serif", fontSize: "0.75rem", color: "#93b4cc", fontStyle: "italic" }}>Foghlaim Gaeilge</div>
        </div>
      </header>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 90px" }}>
        {view === "feed" && <FeedView stories={stories} loading={loading} onStoryClick={openStory} />}
        {view === "reading" && activeStory && <ReadingView story={activeStory} onBack={() => setView("feed")} />}
        {view === "about" && <AboutView />}
      </main>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e0d8cc", zIndex: 100, boxShadow: "0 -2px 16px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
          {NAV.map(tab => (
            <button key={tab.id}
              onClick={() => { if (!tab.disabled) { if (tab.id === "reading" && activeStory) setView("reading"); else if (tab.id !== "reading") setView(tab.id); } }}
              style={{ background: "none", border: "none", padding: "10px 0 8px", cursor: tab.disabled ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: tab.disabled ? 0.3 : 1 }}
            >
              <span style={{ fontSize: "1.25rem" }}>{tab.icon}</span>
              <span style={{ fontFamily: "sans-serif", fontSize: "0.61rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: view === tab.id ? NAVY : "#bbb" }}>{tab.label}</span>
              {view === tab.id && <span style={{ width: 18, height: 2, background: NAVY, borderRadius: 1 }} />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
