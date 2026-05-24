import { useState, useEffect } from "react";

const NAVY = "#0f2942", AMBER = "#f5a623", CREAM = "#f7f4ef";
const NAVY2 = "#1a3d5c";

const FOCAL_AN_LAE = [
  { irish: "Fáilte", english: "Welcome", pron: "FAWL-cha", note: "Fáilte go hÉirinn — Welcome to Ireland" },
  { irish: "Go raibh maith agat", english: "Thank you", pron: "guh REV mah AH-gut", note: "Said after any kindness" },
  { irish: "Conas atá tú?", english: "How are you?", pron: "KUN-us ah-TAW too", note: "The everyday Irish greeting" },
  { irish: "Céad míle fáilte", english: "A hundred thousand welcomes", pron: "KADE MEE-lah FAWL-cha", note: "The most famous Irish phrase" },
  { irish: "Is breá liom é", english: "I love it", pron: "iss BRAW lum AY", note: "Express enthusiasm about anything" },
  { irish: "Slán go fóill", english: "Goodbye for now", pron: "SLAWN guh FOIL", note: "A warm farewell between friends" },
  { irish: "Tá sé go hálainn", english: "It is beautiful", pron: "taw shay guh HAW-lin", note: "Used for scenery, music, art" },
];

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
    summary: "The Irish government has unveiled a major new housing strategy, promising to build fifty thousand homes over the next three years. The plan focuses heavily on affordable housing in Dublin, Cork, and Galway, where rents have reached record highs. The Taoiseach said the plan would be the largest state investment in housing since the 1970s, and that construction would begin before the end of the year.",
    category: "Ireland", categoryIr: "Éire", timeAgo: "2h ago",
    levels: {
      10: "The Irish [[rialtas|government]] has unveiled a major new [[straitéis|strategy]], promising to build fifty thousand [[tithe|homes]] over the next three years. The [[plean|plan]] focuses on affordable [[tithíocht|housing]] in Dublin, Cork, and Galway, where [[cíosanna|rents]] have reached record highs.",
      25: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a major new [[straitéis|strategy]], promising to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]]. The [[plean|plan]] focuses on affordable [[tithíocht|housing]] in Dublin, Cork, and Galway, where [[cíosanna|rents]] have reached [[taifead|record]] highs.",
      50: "The Irish [[rialtas|government]] has [[nochtaithe|unveiled]] a major new [[straitéis|strategy]], [[gealltanas|promising]] to [[tógáil|build]] fifty thousand [[tithe|homes]] over the next three [[blianta|years]]. The [[plean|plan]] [[dírithe|focuses]] on [[inacmhainne|affordable]] [[tithíocht|housing]] in Dublin, Cork, and Galway, where [[cíosanna|rents]] have reached [[taifead|record]] highs.",
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
      50: "Ireland's Wild Atlantic Way has been [[vótáilte|voted]] the best [[radharcach|scenic]] [[tiomáint|drive]] in Europe, [[buaigh|beating]] [[bealaí|routes]] in Norway, Scotland, and the Amalfi [[Cósta|Coast]]. The [[bealach|route]] [[síneann|stretches]] from Donegal to Cork, passing through [[cósta|coastline]] [[drámatúil|dramatic]].",
      75: "Tá Wild Atlantic Way na hÉireann [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]] ag [[irisleabhar|magazine]] taistil [[ceannasach|leading]]. [[Síneann|stretches]] an [[bealach|route]] 2,500 [[ciliméadar|kilometre]] ó Dhún na nGall go Corcaigh.",
      100: "Tá Wild Atlantic Way na [[hÉireann|Ireland]] [[vótáilte|voted]] an [[tiomáint radharcach|scenic drive]] is [[fearr|best]] san [[Eoraip|Europe]]. [[Síneann|stretches]] an [[bealach|route]] 2,500 [[ciliméadar|kilometre]] ó Dhún na nGall go Corcaigh, ag [[dul|passing]] tríd an [[gcósta|coastline]] is [[drámatúla|dramatic]] ar an [[Mór-roinn|continent]].",
    }
  },
  {
    id: "f4", title: "New Irish Language Tech Hub Opens in Galway",
    summary: "A new technology centre dedicated entirely to Irish language software and artificial intelligence has officially opened in Galway city. Over one hundred jobs have been created, with another fifty expected by the end of the year. The Minister for the Gaeltacht described it as a landmark moment for the language.",
    category: "Technology", categoryIr: "Teicneolaíocht", timeAgo: "8h ago",
    levels: {
      10: "A new [[teicneolaíocht|technology]] [[ionad|centre]] dedicated to Irish language [[bogearraí|software]] and artificial [[intleacht|intelligence]] has opened in Galway. Over one hundred [[poist|jobs]] have been created.",
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
      25: "Irish national [[músaeim|museums]] and [[gailearaithe|galleries]] have [[taifeadta|recorded]] their highest ever [[cuairteoir|visitor]] numbers, with more than four million [[daoine|people]] since January. [[Luaigh|credited]] oifigigh [[iontráil saor in aisce|free admission]].",
      50: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]], le níos mó ná ceithre milliún [[duine|person]] ó [[Eanáir|January]].",
      75: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na hÉireann tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]] i [[mbliana|this year]]. [[Luaigh|credited]] [[oifigigh|officials]] [[iontráil saor in aisce|free admission]] agus [[suim|interest]] ag [[fás|growing]] sa [[stair|history]] [[Éireannach|Irish]].",
      100: "Tá [[músaeim|museums]] agus [[gailearaithe|galleries]] [[náisiúnta|national]] na [[hÉireann|Ireland]] tar éis a [[líon|number]] is [[airde|highest]] [[cuairteoirí|visitors]] a [[thaifead|record]] i [[mbliana|this year]], le níos mó ná ceithre [[milliún|million]] [[duine|person]] ó [[Eanáir|January]]. [[Luaigh|credited]] [[oifigigh|officials]] [[iontráil saor in aisce|free admission]] agus [[suim|interest]] ag [[fás|growing]] sa [[chultúr|culture]] [[Éireannach|Irish]].",
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
      <div style={{ display: "inline-block", width: 32, height: 32, border: "2.5px solid #e0d8cc", borderTop: "2.5px solid " + NAVY, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <p style={{ marginTop: 12, color: "#aaa", fontFamily: "sans-serif", fontSize: "0.82rem", letterSpacing: "0.02em" }}>{msg || "Ag lódáil..."}</p>
    </div>
  );
}

function WordChip({ part, active, onToggle }) {
  return (
    <span style={{ position: "relative", display: "inline" }}>
      <span onClick={onToggle} style={{
        cursor: "pointer",
        color: active ? "#1d4ed8" : "#3b82f6",
        fontWeight: 600,
        borderBottom: "1.5px solid " + (active ? "#1d4ed8" : "#93c5fd"),
        background: active ? "#eff6ff" : "transparent",
        borderRadius: 2,
        padding: "0 1px",
        transition: "all 0.12s",
      }}>
        {part.irish}
      </span>
      {active && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: NAVY, color: "#fff", borderRadius: 8, padding: "8px 12px",
          whiteSpace: "nowrap", zIndex: 20, boxShadow: "0 8px 24px rgba(15,41,66,0.25)",
          fontSize: "0.82rem", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontWeight: 600 }}>{part.english}</span>
          <button onClick={e => { e.stopPropagation(); speakWord(part.irish); }}
            style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 5, padding: "2px 7px", cursor: "pointer", color: "#fff", fontSize: "0.82rem" }}>
            🔊
          </button>
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid " + NAVY }} />
        </span>
      )}
    </span>
  );
}

function FeedView({ stories, loading, onStoryClick }) {
  const focal = FOCAL_AN_LAE[new Date().getDay() % FOCAL_AN_LAE.length];
  const [flipped, setFlipped] = useState(false);
  const [showTip, setShowTip] = useState(true);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      {/* Onboarding */}
      {showTip && (
        <div style={{ background: "#fff", border: "1px solid #e2ddd6", borderRadius: 10, padding: "13px 16px", marginBottom: 18, position: "relative" }}>
          <button onClick={() => setShowTip(false)} style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", fontSize: "0.9rem", color: "#ccc", cursor: "pointer" }}>✕</button>
          <div style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: "0.82rem", color: NAVY, marginBottom: 4 }}>Conas a oibríonn sé</div>
          <div style={{ fontFamily: "sans-serif", fontSize: "0.79rem", color: "#666", lineHeight: 1.55 }}>
            Tap a story, choose a level, and read. Any <span style={{ color: "#3b82f6", fontWeight: 600, borderBottom: "1.5px solid #93c5fd" }}>blue word</span> is in Irish. Tap it to translate.
          </div>
        </div>
      )}

      {/* Focal an Lae */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: "0.64rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#b0a898", fontFamily: "sans-serif", marginBottom: 8 }}>Focal an Lae · Word of the Day</div>
        <div onClick={() => setFlipped(f => !f)} style={{
          background: "linear-gradient(135deg, " + NAVY + " 0%, " + NAVY2 + " 100%)",
          borderRadius: 12, padding: "20px 22px", cursor: "pointer", minHeight: 86,
          position: "relative", overflow: "hidden", transition: "transform 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}
        >
          <div style={{ position: "absolute", top: -50, right: -50, width: 160, height: 160, background: "rgba(245,166,35,0.06)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", bottom: -20, left: -20, width: 100, height: 100, background: "rgba(255,255,255,0.03)", borderRadius: "50%" }} />
          {!flipped ? (
            <div>
              <div style={{ fontSize: "clamp(1.5rem,4vw,1.9rem)", fontWeight: 700, color: AMBER, fontFamily: "Georgia,serif", marginBottom: 6, letterSpacing: "-0.01em" }}>{focal.irish}</div>
              <div style={{ fontSize: "0.76rem", color: "rgba(147,180,204,0.9)", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ animation: "pulse 2s ease-in-out infinite", display: "inline-block", fontSize: "0.85rem" }}>👆</span>
                <span>Tap to reveal · <em>{focal.pron}</em></span>
              </div>
            </div>
          ) : (
            <div style={{ animation: "fadeIn 0.2s ease" }}>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff", fontFamily: "Georgia,serif", marginBottom: 5 }}>{focal.english}</div>
              <div style={{ fontSize: "0.79rem", color: "rgba(147,180,204,0.9)", fontStyle: "italic", fontFamily: "sans-serif" }}>{focal.note}</div>
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); speakWord(focal.irish); }}
            style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "#fff", fontSize: "0.85rem", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
          >🔊</button>
        </div>
      </div>

      {/* Stories */}
      <div style={{ fontSize: "0.64rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#b0a898", fontFamily: "sans-serif", marginBottom: 10 }}>Nuacht an Lae · Today's News</div>
      {loading && <Spinner msg="Ag lódáil nuacht..." />}
      {!loading && stories.map((s, i) => (
        <div key={s.id} onClick={() => onStoryClick(s)}
          style={{
            background: "#fff", borderRadius: 10, padding: "16px 18px", marginBottom: 8,
            border: "1px solid #e8e2da", cursor: "pointer",
            transition: "box-shadow 0.15s, transform 0.15s",
            animation: "fadeIn " + (0.08 + i * 0.04) + "s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(15,41,66,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: "0.63rem", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b0a898" }}>{s.categoryIr}</span>
            <span style={{ color: "#c8c0b4", fontSize: "0.66rem", fontFamily: "sans-serif", whiteSpace: "nowrap" }}>{s.timeAgo}</span>
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: "clamp(0.92rem,2.3vw,1.02rem)", lineHeight: 1.35, fontWeight: 700, color: "#111", fontFamily: "Georgia,serif" }}>{s.title}</h3>
          <p style={{ margin: "0 0 10px", fontSize: "0.79rem", color: "#888", lineHeight: 1.55, fontFamily: "sans-serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.summary}</p>
          <span style={{ fontSize: "0.71rem", color: NAVY, fontFamily: "sans-serif", fontWeight: 600, letterSpacing: "0.01em" }}>Léigh as Gaeilge →</span>
        </div>
      ))}

      <div style={{ textAlign: "center", padding: "20px 0 4px", fontFamily: "sans-serif", fontSize: "0.69rem", color: "#c8c0b4", lineHeight: 1.8 }}>
        Created by <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer" style={{ color: "#8a9eb0", textDecoration: "none", borderBottom: "1px solid #c8d8e4" }}>Joe Luca Dooley</a>
        {" · "}News from RTÉ
      </div>
    </div>
  );
}

function ReadingView({ story, onBack }) {
  const [pct, setPct] = useState(10);
  const [activeWord, setActiveWord] = useState(null);
  const level = getLevel(pct);
  const parts = parseText(story.levels[pct] || story.summary);
  const irishCount = parts.filter(p => p.t === "ir").length;

  async function handleShare() {
    const data = { title: story.title, text: "Léigh as Gaeilge ar Daily Scéal", url: story.link || "https://joelucadooley.github.io/daily-sceal" };
    try { if (navigator.share) { await navigator.share(data); } else { await navigator.clipboard.writeText(data.url); } } catch {}
  }

  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: NAVY, fontFamily: "sans-serif", fontSize: "0.83rem", fontWeight: 600, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5, letterSpacing: "0.01em" }}>
          ← Nuacht
        </button>
        <button onClick={handleShare} style={{ background: "#fff", border: "1px solid #e8e2da", color: NAVY, fontFamily: "sans-serif", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", borderRadius: 7, padding: "6px 12px" }}>
          Roinn ↗
        </button>
      </div>

      {/* Story header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: "0.63rem", fontFamily: "sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b0a898", marginBottom: 8 }}>{story.categoryIr}</div>
        <h2 style={{ margin: "0 0 6px", color: NAVY, fontSize: "clamp(1.15rem,3.5vw,1.5rem)", lineHeight: 1.25, fontFamily: "Georgia,serif", fontWeight: 700 }}>{story.title}</h2>
        <div style={{ fontSize: "0.72rem", color: "#b0a898", fontFamily: "sans-serif" }}>{story.timeAgo}</div>
      </div>

      {/* Level selector */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", marginBottom: 14, border: "1px solid #e8e2da" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: "0.9rem", color: level.color }}>{level.label}</div>
          <div style={{ fontFamily: "sans-serif", fontSize: "0.72rem", color: "#b0a898" }}>{level.tip}</div>
        </div>
        <input type="range" min={0} max={4} step={1} value={SNAP_LEVELS.indexOf(pct)}
          onChange={e => { setPct(SNAP_LEVELS[+e.target.value]); setActiveWord(null); }}
          style={{ width: "100%", cursor: "pointer", margin: "0 0 8px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "sans-serif", fontSize: "0.63rem", color: "#c8c0b4", marginBottom: 12 }}>
          <span>English</span><span>As Gaeilge</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {LEVELS_CONFIG.map(l => (
            <button key={l.pct} onClick={() => { setPct(l.pct); setActiveWord(null); }}
              style={{
                flex: "1 1 auto", background: pct === l.pct ? l.bg : "#f8f6f1",
                color: pct === l.pct ? l.color : "#b0a898",
                border: "1px solid " + (pct === l.pct ? l.color : "#e8e2da"),
                borderRadius: 6, padding: "5px 2px", cursor: "pointer",
                fontFamily: "sans-serif", fontSize: "0.63rem", fontWeight: 600,
                transition: "all 0.12s", letterSpacing: "0.01em",
              }}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Article body */}
      <div style={{ background: "#fff", borderRadius: 10, padding: "22px", border: "1px solid #e8e2da" }} key={pct}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #f0ece4" }}>
          <span style={{ fontFamily: "sans-serif", fontSize: "0.73rem", color: "#888" }}>
            <span style={{ color: "#3b82f6", fontWeight: 600 }}>{irishCount} focal Gaeilge</span> sa scéal seo
          </span>
          <span style={{ fontFamily: "sans-serif", fontSize: "0.68rem", color: "#c8c0b4" }}>Tap to translate</span>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: "clamp(0.97rem,2.2vw,1.06rem)", lineHeight: 1.95, color: "#1a1a1a", fontFamily: "Georgia,serif" }}>
          {parts.map((p, i) =>
            p.t === "en" ? <span key={i}>{p.v}</span> :
              <WordChip key={i} part={p} active={activeWord === i} onToggle={() => setActiveWord(a => a === i ? null : i)} />
          )}
        </p>
        <div style={{ borderTop: "1px solid #f0ece4", paddingTop: 13, fontFamily: "sans-serif", fontSize: "0.75rem", color: "#b0a898", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem" }}>💡</span>
          <span>Tap any <span style={{ color: "#3b82f6", fontWeight: 600 }}>blue word</span> to translate and hear it</span>
        </div>
      </div>
    </div>
  );
}

function AboutView() {
  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #e8e2da" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: "1.1rem", color: NAVY, fontWeight: 700, marginBottom: 4 }}>Faoi Daily Scéal</div>
        <div style={{ fontFamily: "sans-serif", fontSize: "0.8rem", color: "#888", lineHeight: 1.5 }}>Foghlaim Gaeilge gach lá · Learn Irish every day</div>
      </div>

      {[
        { t: "Cad é Daily Scéal?", b: "Real Irish news from RTÉ, with a slider that controls how much of each article is in Irish. Read as much or as little Gaeilge as you like. No account required." },
        { t: "Conas a oibríonn sé?", b: "Tap a story, pick a level, and read. Blue underlined words are in Irish. Tap any of them to see the English and hear it said aloud. The Beginner level keeps most of the text in English with a handful of Irish words. As Gaeilge is the full thing." },
        { t: "An Ionchur Intuigthe · Comprehensible Input", b: "There is a well-established idea in language learning that you absorb a language most effectively when you can follow most of what you are reading but encounter enough unfamiliar words to learn from. The slider is a practical way of putting that into practice." },
      ].map(({ t, b }) => (
        <div key={t} style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: "0.9rem", color: NAVY, marginBottom: 5 }}>{t}</div>
          <div style={{ fontFamily: "sans-serif", fontSize: "0.81rem", color: "#555", lineHeight: 1.65 }}>{b}</div>
        </div>
      ))}

      <div style={{ borderTop: "1px solid #e8e2da", paddingTop: 20, marginTop: 8 }}>
        <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: "0.9rem", color: NAVY, marginBottom: 5 }}>Foinse Oscailte · Open Source</div>
        <div style={{ fontFamily: "sans-serif", fontSize: "0.81rem", color: "#555", lineHeight: 1.65, marginBottom: 14 }}>
          Daily Scéal is a free project built by Joe Luca Dooley. The source code is publicly available on GitHub.
        </div>
        <a href="https://github.com/joelucadooley/daily-sceal" target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", background: NAVY, color: "#fff", borderRadius: 8, padding: "9px 16px", fontFamily: "sans-serif", fontSize: "0.78rem", fontWeight: 600, textDecoration: "none", letterSpacing: "0.01em" }}>
          View on GitHub →
        </a>
      </div>

      <div style={{ textAlign: "center", padding: "28px 0 4px", fontFamily: "sans-serif", fontSize: "0.69rem", color: "#c8c0b4", lineHeight: 1.8 }}>
        News sourced from RTÉ · Foghlaim Gaeilge gach lá
      </div>
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

  return (
    <div style={{ minHeight: "100vh", background: CREAM }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}
        *{box-sizing:border-box}
        input[type=range]{-webkit-appearance:none;appearance:none;height:4px;background:#e8e2da;border-radius:2px;outline:none}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;background:${NAVY};border-radius:50%;cursor:pointer;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(15,41,66,0.25)}
        button:active{opacity:0.75}
        a:hover{opacity:0.8}
      `}</style>

      {/* Header */}
      <header style={{ background: NAVY, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(15,41,66,0.2)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "13px 18px 11px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div onClick={() => setView("feed")} style={{ cursor: "pointer" }}>
            <div style={{ fontSize: "clamp(1.25rem,3.5vw,1.55rem)", fontWeight: 700, color: "#fff", lineHeight: 1, fontFamily: "Georgia,serif", letterSpacing: "-0.01em" }}>
              Daily <span style={{ color: AMBER, fontStyle: "italic" }}>Scéal</span>
            </div>
            <div style={{ fontSize: "0.62rem", color: "rgba(147,180,204,0.8)", fontFamily: "sans-serif", letterSpacing: "0.04em", marginTop: 2 }}>{todayFmt}</div>
          </div>
          <div style={{ fontFamily: "sans-serif", fontSize: "0.7rem", color: "rgba(147,180,204,0.7)", fontStyle: "italic", letterSpacing: "0.02em" }}>Foghlaim Gaeilge</div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "22px 16px 90px" }}>
        {view === "feed" && <FeedView stories={stories} loading={loading} onStoryClick={openStory} />}
        {view === "reading" && activeStory && <ReadingView story={activeStory} onBack={() => setView("feed")} />}
        {view === "about" && <AboutView />}
      </main>

      {/* Bottom nav */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,252,248,0.96)", borderTop: "1px solid #e8e2da", zIndex: 100, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(2,1fr)" }}>
          {[
            { id: "feed", icon: "📰", label: "Nuacht" },
            { id: "about", icon: "ℹ️", label: "Faoi" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id)}
              style={{ background: "none", border: "none", padding: "10px 0 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
            >
              <span style={{ fontSize: "1.15rem" }}>{tab.icon}</span>
              <span style={{ fontFamily: "sans-serif", fontSize: "0.59rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: view === tab.id ? NAVY : "#b0a898", transition: "color 0.15s" }}>{tab.label}</span>
              {view === tab.id && <span style={{ width: 20, height: 2, background: NAVY, borderRadius: 1, animation: "fadeIn 0.15s ease" }} />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
