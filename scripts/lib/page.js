// What an RTÉ article page says about itself in its <meta> tags: the headline,
// the standfirst, when it was published and its topic tags.
//
// The daily run uses the tags to place a story whose feed tag says nothing
// about where it belongs ("Analysis and Comment" on the Iowa midterms piece,
// whose page also carries US and World). add-story.js uses all of it for a
// story that comes from a link rather than a feed.

const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Every <meta> on the page as [key, content], key being its name or property in lower case. */
export function metaPairs(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const a of m[0].matchAll(/([a-z][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
      attrs[a[1].toLowerCase()] = a[3] ?? a[4];
    }
    const key = (attrs.name || attrs.property || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content != null) out.push([key, decode(attrs.content).trim()]);
  }
  return out;
}

// RTÉ lists a story's tags in both of these, comma separated:
// News, Analysis and Comment, US, World, Iowa, US Midterms
const TAG_KEYS = new Set(["categories", "article:tag"]);

/** The page's topic tags in order, each once. */
export function pageTags(html) {
  const seen = new Set();
  const tags = [];
  for (const [key, value] of metaPairs(html)) {
    if (!TAG_KEYS.has(key)) continue;
    for (const tag of value.split(",").map(t => t.trim()).filter(Boolean)) {
      const k = tag.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      tags.push(tag);
    }
  }
  return tags;
}

/** Headline, standfirst, publication time (ISO, or null) and tags. */
export function pageInfo(html) {
  const meta = new Map();
  for (const [key, value] of metaPairs(html)) if (!meta.has(key)) meta.set(key, value);
  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(String(html || ""));
  const title = meta.get("og:title") || meta.get("twitter:title") || (titleTag ? decode(titleTag[1]).trim() : "");
  const when = new Date(meta.get("article:published_time") || meta.get("dc.date") || "");
  return {
    // A browser title can end in " - RTÉ" or " | RTÉ.ie"; the headline does not.
    title: title.replace(/\s+[-|–]\s+RT[ÉE](\.ie)?\s*$/i, "").trim(),
    description: meta.get("og:description") || meta.get("description") || "",
    published: Number.isNaN(when.getTime()) ? null : when.toISOString(),
    tags: pageTags(html),
  };
}
