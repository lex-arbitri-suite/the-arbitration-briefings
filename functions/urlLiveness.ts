/**
 * urlLiveness.ts — Firebase-free URL liveness helpers
 *
 * Contains the liveness probe logic extracted from index.ts so that
 * these helpers can be imported into a test harness without pulling in
 * firebase-admin (which calls initializeApp() at module load and is not
 * importable outside a Firebase environment).
 *
 * All functions here depend only on the global `fetch` API (Node 18+
 * and Cloud Functions Node 22) and standard TypeScript. Zero Firebase
 * or firebase-functions imports.
 *
 * Zero-egress note: the fetch calls here transmit only AI-produced
 * public source URLs to the public sites named in those URLs. No case
 * facts, chat content, prompts, or workspace data are included.
 * Disclosed on MethodologyPage §I.
 */

// ============================================================================
// Result type
// ============================================================================

/** Discriminated result returned by checkUrlLiveness. */
export type UrlLivenessResult = {
  status: 'live' | 'dead' | 'ambiguous';
  reason:
    | 'ok'
    | 'http-error-status'
    | 'error-redirect'
    | 'timeout'
    | 'network-error'
    | 'bot-block'
    | 'invalid-url';
  finalUrl?: string;
  statusCode?: number;
};

// ============================================================================
// hasErrorPageMarker
// ============================================================================

/**
 * Classifies the final URL after redirect-following to detect well-known
 * error-page patterns. Operates only on the parsed path and query string —
 * never on bare substrings of the full URL — to avoid false positives from
 * legitimate paths that happen to contain 'error' or '404'.
 */
export function hasErrorPageMarker(finalUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    // Unparseable final URL treated as non-matching; structural validation
    // will have rejected the original URL before we reach this point.
    return false;
  }

  const path = parsed.pathname;
  const query = parsed.search.toLowerCase();

  // Path matches a recognised error-page segment (anchored at a path
  // separator or the start of the path, terminated at a dot, separator,
  // or end — never mid-token).
  const errorPathPattern =
    /(^|\/)(error404|404|not-found|not_found|page-not-found)(\.|\/|$)/i;
  const genericErrorPattern = /(^|\/)error(\/|$)/i;

  if (errorPathPattern.test(path) || genericErrorPattern.test(path)) {
    return true;
  }

  // Query string carries ASP.NET-style soft-404 markers.
  if (query.includes('aspxerrorpath=') || query.includes('error404')) {
    return true;
  }

  return false;
}

// ============================================================================
// hasBotChallengeBodyMarker
// ============================================================================
//
// A bot-challenge or block page served with a 2xx status is invisible to
// hasErrorPageMarker, which only ever inspects the final URL. BAILII, for
// example, returns HTTP 200 on a real case page with a body titled 'Making
// sure you're not a bot!' — the status and the URL both look healthy, and
// only the body gives it away.
//
// Markers gathered from a body-reading sweep of the whole approved registry
// on 11 August 2026 — see
// .context/00-current/2026-08-11-unverifiable-sources-decision.md.
// ============================================================================

const BOT_CHALLENGE_MARKERS: RegExp[] = [
  /just a moment/i,
  /making sure you'?re not a bot/i,
  /checking your browser/i,
  /attention required/i,
  /cf-browser-verification/i,
  /enable javascript and cookies to continue/i,
  /ddos protection by/i,
  /access denied/i,
  /request unsuccessful/i,
  /are you a robot/i,
  // Not bare /captcha/i: that matched two genuine registry pages (ITLOS,
  // LCIA) purely because they load Google's reCAPTCHA script for an
  // ordinary contact form — a legitimate, common pattern, not a challenge.
  // Require actual challenge phrasing instead of the bare word.
  /(complete|solve) the captcha/i,
  /captcha challenge/i,
  /verify (that )?you('re| are) (a )?human/i,
];

/**
 * Tests a page body (title plus opening text is enough) against known
 * bot-challenge markers. Normalises the common HTML entity forms of an
 * apostrophe first — BAILII's own challenge page ships the title as
 * 'Making sure you&#39;re not a bot!', not a literal apostrophe, and a
 * marker written against the literal character misses it silently.
 */
export function hasBotChallengeBodyMarker(body: string): boolean {
  const normalised = body.replace(/&#0?39;|&apos;|&rsquo;|&#8217;/gi, "'");
  return BOT_CHALLENGE_MARKERS.some((pattern) => pattern.test(normalised));
}

/** Bytes of body read before giving up on finding a challenge marker. */
const BOT_CHALLENGE_BODY_PREFIX_BYTES = 4096;

/**
 * Reads at most maxBytes of a response body. Prefers streaming so a large,
 * non-matching page is never read in full — the cost of this probe should
 * stay bounded regardless of what is on the other end. Falls back to
 * response.text() for response shapes without a stream (test stubs); returns
 * '' for shapes with neither, so a bare stubbed response behaves exactly as
 * it did before this function existed.
 *
 * An AbortError from the shared timeout signal is left to propagate — that
 * must still surface as the timeout branch in checkUrlLiveness, not be
 * swallowed here and misreported as a clean 'live'.
 */
async function readBodyPrefix(response: Response, maxBytes: number): Promise<string> {
  const body = response.body as unknown as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> } | null;

  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (received < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Best-effort: the read already got what it needed (or failed).
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)))
      .subarray(0, maxBytes)
      .toString('utf8');
  }

  if (typeof (response as unknown as { text?: () => Promise<string> }).text === 'function') {
    const text = await (response as unknown as { text: () => Promise<string> }).text();
    return typeof text === 'string' ? text.slice(0, maxBytes) : '';
  }

  return '';
}

// ============================================================================
// checkUrlLiveness
// ============================================================================

/**
 * Probes a URL for liveness with a GET request (redirect-following).
 * Returns a classified result; ambiguous means the liveness could not be
 * confirmed but the link is not positively known to be dead.
 *
 * Precondition: the URL has already passed validateSourceUrl (in index.ts),
 * so it is HTTPS, on an approved domain, and has a specific path.
 */
export async function checkUrlLiveness(url: string): Promise<UrlLivenessResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LexArbitriSuite/1.0; source-link-check)',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const finalUrl = response.url || url;

    // 403 is treated as ambiguous: many institutional sites block automated
    // probes with a 403 even when the page exists.
    if (response.status === 403) {
      return { status: 'ambiguous', reason: 'bot-block', finalUrl, statusCode: 403 };
    }

    if (response.status >= 400) {
      return {
        status: 'dead',
        reason: 'http-error-status',
        finalUrl,
        statusCode: response.status,
      };
    }

    // The redirect chain resolved to an error page served as HTTP 200
    // (soft-404, the LCIA case).
    if (hasErrorPageMarker(finalUrl)) {
      return { status: 'dead', reason: 'error-redirect', finalUrl, statusCode: response.status };
    }

    // A bot-challenge page served as HTTP 200 (the BAILII case). The URL and
    // status both look healthy; only the body says otherwise. Classified as
    // ambiguous, never dead — this can only move a link off 'verified', it
    // must never hide a real page (fail-open policy, unchanged).
    const bodyPrefix = await readBodyPrefix(response, BOT_CHALLENGE_BODY_PREFIX_BYTES);
    if (hasBotChallengeBodyMarker(bodyPrefix)) {
      return { status: 'ambiguous', reason: 'bot-block', finalUrl, statusCode: response.status };
    }

    return { status: 'live', reason: 'ok', finalUrl, statusCode: response.status };

  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'ambiguous', reason: 'timeout' };
    }
    return { status: 'ambiguous', reason: 'network-error' };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// resolveRelatedDevelopmentUrls
// ============================================================================

/**
 * Related Developments: blank the sourceUrl of items whose link is not
 * displayable. `assess` is injected (index.ts supplies the structural-
 * validation-gated assessor), keeping this module free of
 * validateSourceUrl and Firebase. Dedup via a per-call Map cache.
 *
 * Items with an empty or whitespace-only sourceUrl are returned unchanged
 * (the cite-by-name path already applies; nothing to probe).
 */
export async function resolveRelatedDevelopmentUrls<
  T extends { sourceUrl?: string; title?: string },
>(
  items: T[],
  assess: (url: string) => Promise<{ displayUrl: boolean; liveness: UrlLivenessResult }>,
): Promise<T[]> {
  // Build a per-call cache so duplicate URLs invoke `assess` only once.
  const cache = new Map<string, Promise<{ displayUrl: boolean; liveness: UrlLivenessResult }>>();

  const settled = await Promise.allSettled(
    items.map(async (item) => {
      if (!item.sourceUrl || item.sourceUrl.trim() === '') {
        // Empty URL: cite-by-name path already applies; nothing to check.
        return item;
      }

      const cacheKey = item.sourceUrl.trim();
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, assess(cacheKey));
      }
      const { displayUrl, liveness } = await cache.get(cacheKey)!;

      if (!displayUrl) {
        let host = cacheKey;
        try { host = new URL(cacheKey).hostname; } catch { /* ignore */ }
        console.warn('[Related Developments] Source URL demoted:', {
          reason: liveness.reason,
          host,
          statusCode: liveness.statusCode,
        });
        // Blank the URL so the existing cite-by-name path applies on
        // the client; all other item fields are preserved.
        return { ...item, sourceUrl: '' };
      }

      return item;
    })
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    // On unexpected rejection, blank the URL conservatively.
    console.warn('[Related Developments] Unexpected error checking URL for:', items[i]?.title);
    return { ...items[i], sourceUrl: '' };
  });
}

// ============================================================================
// applyLivenessToDevelopments
// ============================================================================

/**
 * Daily Digest: set urlVerified per item; keep sourceUrl for traceability.
 * `structuralValid` is injected so index.ts can supply validateSourceUrl
 * without this module importing Firebase. Dedup via a per-call Map cache.
 *
 * Items that fail structural validation are returned immediately with
 * urlVerified: false and no network fetch.
 * Items with a structurally valid URL are probed via checkUrlLiveness.
 * Ambiguous liveness is treated as verified (fail-open policy).
 */
export async function applyLivenessToDevelopments<
  T extends { sourceUrl: string; title?: string },
>(
  items: T[],
  structuralValid: (url: string) => boolean,
): Promise<(T & { urlVerified: boolean })[]> {
  // Build a per-sweep cache so duplicate URLs fetch only once.
  const livenessCache = new Map<string, Promise<UrlLivenessResult>>();

  const settled = await Promise.allSettled(
    items.map(async (item) => {
      if (!structuralValid(item.sourceUrl)) {
        // Structural rejection: warn using the same format as validateDevelopments.
        // (The full reason string is not available here because validateSourceUrl
        // is injected as a boolean predicate; the structural warn in index.ts still
        // fires for the detailed reason before calling this function.)
        return { ...item, urlVerified: false };
      }

      // Deduplicate concurrent fetches for the same URL.
      if (!livenessCache.has(item.sourceUrl)) {
        livenessCache.set(item.sourceUrl, checkUrlLiveness(item.sourceUrl));
      }
      // Non-null assertion is safe: we set the key in the branch above.
      const liveness = await livenessCache.get(item.sourceUrl)!;

      if (liveness.status === 'dead') {
        let host = item.sourceUrl;
        try { host = new URL(item.sourceUrl).hostname; } catch { /* ignore */ }
        console.warn('[URL Hardening] Demoted (liveness):', {
          reason: liveness.reason,
          host,
          statusCode: liveness.statusCode,
        });
      }

      // Keep sourceUrl on the object for digest traceability; only
      // urlVerified changes. Ambiguous is treated as verified (fail-open).
      return { ...item, urlVerified: liveness.status !== 'dead' };
    })
  );

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    // On unexpected rejection, preserve the item with urlVerified: false.
    console.warn('[URL Hardening] Unexpected error validating item:', items[i]?.title);
    return { ...items[i], urlVerified: false };
  });
}
