// MyMemory, one word at a time, with a per-run cache, run counters and a
// breaker. Everything that touches the outside world comes in through the
// options, so the tests can swap in a fake fetch and a no-op sleep.

const EMAIL = "joelucadooley@gmail.com";
const THROTTLE_MS = 250;
const TIMEOUT_MS = 8000;
// After this many failed calls in a row MyMemory is treated as down for the
// rest of the run: words it would have supplied stay English, the dictionary
// still marks its words, and the run does not sit through every timeout.
export const BREAKER_LIMIT = 15;

const realSleep = ms => new Promise(r => setTimeout(r, ms));

export function createMyMemory({
  fetch: fetchFn = (...args) => globalThis.fetch(...args),
  sleep = realSleep,
  breakerLimit = BREAKER_LIMIT,
} = {}) {
  // english (lowercase) -> raw MyMemory text, including results that are
  // later rejected. Failed calls are not cached, so they are retried.
  const cache = {};
  const rejectedWords = new Set();
  const stats = { calls: 0, ok: 0, errors: 0 };
  let errorsInARow = 0;
  let breakerOpen = false;

  async function translate(word) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ga&de=${EMAIL}`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await res.json();
    if (data.responseStatus === 200) return data.responseData.translatedText;
    throw new Error(`Translation failed: ${data.responseStatus}`);
  }

  // Raw MyMemory text for `word`, from the cache when possible. Throws when
  // the call fails or the breaker is open; the caller leaves the word English.
  async function lookup(word) {
    const key = word.toLowerCase();
    if (cache[key] !== undefined) return cache[key];
    if (breakerOpen) throw new Error("MyMemory skipped: breaker open");
    await sleep(THROTTLE_MS);
    stats.calls++;
    let result;
    try {
      result = await translate(word);
    } catch (err) {
      stats.errors++;
      errorsInARow++;
      if (errorsInARow >= breakerLimit) breakerOpen = true;
      throw err;
    }
    errorsInARow = 0;
    stats.ok++;
    cache[key] = result;
    return result;
  }

  // Called for a machine result that failed isGoodTranslation.
  function noteRejected(word) {
    rejectedWords.add(word.toLowerCase());
  }

  function summary() {
    return `MyMemory: calls ${stats.calls}, ok ${stats.ok}, rejected ${rejectedWords.size}, ` +
      `errors ${stats.errors}, breaker ${breakerOpen ? "open" : "closed"}`;
  }

  return {
    lookup,
    noteRejected,
    summary,
    cache,
    stats,
    get rejected() { return rejectedWords.size; },
    get breakerOpen() { return breakerOpen; },
  };
}
