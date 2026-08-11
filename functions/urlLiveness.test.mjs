/**
 * urlLiveness.test.mjs — offline test suite for the urlLiveness helpers.
 *
 * Imports from the compiled CommonJS output in lib/functions/urlLiveness.js.
 * Run: npm test (from the project root) — or node functions/urlLiveness.test.mjs.
 *
 * Every case here is deterministic and offline. checkUrlLiveness reaches the
 * network through the global fetch, so the classification tests below install
 * a stub in its place and assert on the branch each fabricated response takes.
 *
 * The real network lives in urlLiveness.canary.mjs, which reports how the
 * approved source sites are behaving today and never fails the build. The two
 * were split on 10 August 2026: italaw stopped answering automated probes at
 * all, and the fixtures asserting 'live' and 'dead' against it began failing
 * for reasons that had nothing to do with this code. Asserting on a third
 * party's mood is not a test of ours. See the canary for what it caught.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve the compiled module relative to this test file's directory.
const compiled = path.join(__dirname, 'lib', 'functions', 'urlLiveness.js');
const {
  hasErrorPageMarker,
  hasBotChallengeBodyMarker,
  checkUrlLiveness,
  resolveRelatedDevelopmentUrls,
  applyLivenessToDevelopments,
} = require(compiled);

// ============================================================================
// Minimal test harness
// ============================================================================

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ============================================================================
// Fetch stub
// ============================================================================
//
// checkUrlLiveness calls the bare global fetch, so replacing globalThis.fetch
// intercepts it without touching the module under test. Each stub returns the
// minimum shape the code reads: { url, status }.
// ============================================================================

const realFetch = globalThis.fetch;

/** Serve one fabricated response (or throw one error) for the next call. */
function stubFetch(handler) {
  globalThis.fetch = async (url, init) => handler(url, init);
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

function respond({ status, url, body }) {
  const r = { status, url };
  if (body !== undefined) {
    r.text = async () => body;
  }
  return r;
}

function abortError() {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

// ============================================================================
// 1. hasErrorPageMarker (pure function, no network)
// ============================================================================

section('hasErrorPageMarker — should FLAG (true)');

assert(
  'LCIA soft-404 with aspxerrorpath query',
  hasErrorPageMarker(
    'https://www.lcia.org/Access/Error404.aspx?aspxerrorpath=/challenge-decisions.aspx'
  ) === true,
);

assert(
  'bare /404 path segment',
  hasErrorPageMarker('https://x.org/404') === true,
);

assert(
  '/not-found path segment',
  hasErrorPageMarker('https://x.org/not-found') === true,
);

assert(
  '/page-not-found path segment',
  hasErrorPageMarker('https://x.org/page-not-found') === true,
);

assert(
  '/error/ path segment (generic error pattern)',
  hasErrorPageMarker('https://x.org/error/') === true,
);

section('hasErrorPageMarker — should NOT flag (false-positive guards)');

assert(
  'italaw case 460 — numeric path only, no error token',
  hasErrorPageMarker('https://www.italaw.com/cases/460') === false,
);

assert(
  'article with "404" in commentary slug — mid-token, should not match',
  hasErrorPageMarker('https://x.org/cases/article-404-commentary') === false,
  // article-404-commentary: the "404" is inside a longer segment, not
  // anchored at a path separator boundary followed by end/dot/separator.
  // The regex requires (^|/)404(.|/|$) — in "article-404-commentary" the
  // "404" is neither at a boundary start nor terminated by end/dot/separator.
);

assert(
  '/error-handling-in-arbitration — "error" mid-segment, must not match genericErrorPattern',
  hasErrorPageMarker('https://x.org/error-handling-in-arbitration') === false,
);

assert(
  'LCIA original URL (before redirect) — must NOT flag, only the redirected URL does',
  hasErrorPageMarker('https://www.lcia.org/challenge-decisions.aspx') === false,
);

// ============================================================================
// 1b. hasBotChallengeBodyMarker (pure function, no network)
// ============================================================================

section('hasBotChallengeBodyMarker — should FLAG (true)');

assert(
  "BAILII — 'Making sure you're not a bot!' title, literal apostrophe",
  hasBotChallengeBodyMarker(
    "<html><head><title>Making sure you're not a bot!</title></head><body></body></html>"
  ) === true,
);

assert(
  "BAILII — real body, apostrophe as &#39; (confirmed against the live page, 11 Aug 2026)",
  hasBotChallengeBodyMarker(
    '<!doctype html><html lang="en"><head><title>Making sure you&#39;re not a bot!</title>'
  ) === true,
);

assert(
  'Cloudflare — Just a moment...',
  hasBotChallengeBodyMarker('<title>Just a moment...</title>') === true,
);

assert(
  'Cloudflare — Checking your browser before accessing',
  hasBotChallengeBodyMarker('Checking your browser before accessing example.com') === true,
);

assert(
  'generic — Access Denied',
  hasBotChallengeBodyMarker('<h1>Access Denied</h1>') === true,
);

assert(
  'generic — please complete the captcha',
  hasBotChallengeBodyMarker('Please complete the CAPTCHA to continue') === true,
);

section('hasBotChallengeBodyMarker — should NOT flag (false-positive guards)');

assert(
  'ordinary case-report prose',
  hasBotChallengeBodyMarker(
    '<title>Smith v Jones [2020] EWCA Civ 574</title><p>The appellant contends that the tribunal erred in law.</p>'
  ) === false,
);

assert(
  'empty body',
  hasBotChallengeBodyMarker('') === false,
);

assert(
  "ITLOS false positive, confirmed against the live site 11 Aug 2026 — a legitimate " +
    "page merely loading Google's reCAPTCHA script for a contact form is not a challenge page",
  hasBotChallengeBodyMarker(
    '<title>Home | International Tribunal for the Law of the Sea</title><!-- RECAPTCHA CODE --><script>...</script>'
  ) === false,
);

assert(
  'LCIA false positive, same shape — recaptcha/api.js script tag, ordinary page',
  hasBotChallengeBodyMarker(
    '<script src="https://www.google.com/recaptcha/api.js"></script></head><body id="home-page">'
  ) === false,
);

// ============================================================================
// 2. checkUrlLiveness — classification (stubbed fetch, deterministic)
// ============================================================================
//
// One case per branch of checkUrlLiveness. These are the assertions the old
// italaw fixtures were standing in for; here the response is fabricated, so
// the outcome depends only on our own classification rules.
// ============================================================================

section('checkUrlLiveness — classification (stubbed fetch)');

{
  stubFetch(() => respond({
    status: 200,
    url: 'https://www.italaw.com/cases/460',
    body: '<title>ITA0182</title><p>Award on Jurisdiction, 8 February 2005</p>',
  }));
  const r = await checkUrlLiveness('https://www.italaw.com/cases/460');
  assert(
    'HTTP 200, ordinary body, no error marker → status:live, reason:ok',
    r.status === 'live' && r.reason === 'ok' && r.statusCode === 200,
    `got status=${r.status} reason=${r.reason} statusCode=${r.statusCode}`,
  );
}

{
  // BAILII: HTTP 200 with a body that is a bot-challenge page. The URL and
  // status both look healthy — only the body says otherwise. Must classify
  // ambiguous, never dead: fail-open keeps the link even though the check
  // could not confirm it.
  stubFetch(() => respond({
    status: 200,
    url: 'https://www.bailii.org/ew/cases/EWCA/Civ/2020/574.html',
    // Real body as BAILII serves it (confirmed 11 Aug 2026): apostrophe as
    // an HTML entity, not a literal character.
    body: '<!doctype html><html lang="en"><head><title>Making sure you&#39;re not a bot!</title></head><body></body></html>',
  }));
  const r = await checkUrlLiveness('https://www.bailii.org/ew/cases/EWCA/Civ/2020/574.html');
  assert(
    'HTTP 200, bot-challenge body (BAILII) → status:ambiguous, reason:bot-block, statusCode:200',
    r.status === 'ambiguous' && r.reason === 'bot-block' && r.statusCode === 200,
    `got status=${r.status} reason=${r.reason} statusCode=${r.statusCode}`,
  );
}

{
  // No text()/body on the stub at all — must behave exactly as it did
  // before this function existed (empty body prefix, no marker match).
  stubFetch(() => respond({ status: 200, url: 'https://x.org/thing' }));
  const r = await checkUrlLiveness('https://x.org/thing');
  assert(
    'HTTP 200, stub with no body accessor → status:live, reason:ok (unchanged behaviour)',
    r.status === 'live' && r.reason === 'ok',
    `got status=${r.status} reason=${r.reason}`,
  );
}

{
  stubFetch(() => respond({ status: 403, url: 'https://www.italaw.com/cases/460' }));
  const r = await checkUrlLiveness('https://www.italaw.com/cases/460');
  assert(
    'HTTP 403 → status:ambiguous, reason:bot-block (fail open, keep the link)',
    r.status === 'ambiguous' && r.reason === 'bot-block' && r.statusCode === 403,
    `got status=${r.status} reason=${r.reason} statusCode=${r.statusCode}`,
  );
}

{
  stubFetch(() => respond({ status: 404, url: 'https://www.italaw.com/cases/999999' }));
  const r = await checkUrlLiveness('https://www.italaw.com/cases/999999');
  assert(
    'HTTP 404 → status:dead, reason:http-error-status',
    r.status === 'dead' && r.reason === 'http-error-status' && r.statusCode === 404,
    `got status=${r.status} reason=${r.reason} statusCode=${r.statusCode}`,
  );
}

{
  stubFetch(() => respond({ status: 500, url: 'https://x.org/thing' }));
  const r = await checkUrlLiveness('https://x.org/thing');
  assert(
    'HTTP 500 → status:dead, reason:http-error-status',
    r.status === 'dead' && r.reason === 'http-error-status' && r.statusCode === 500,
    `got status=${r.status} reason=${r.reason} statusCode=${r.statusCode}`,
  );
}

{
  // The LCIA soft-404: 200 OK, but the redirect landed on an error page.
  stubFetch(() => respond({
    status: 200,
    url: 'https://www.lcia.org/Access/Error404.aspx?aspxerrorpath=/challenge-decisions.aspx',
  }));
  const r = await checkUrlLiveness('https://www.lcia.org/challenge-decisions.aspx');
  assert(
    'HTTP 200 redirected to an error page → status:dead, reason:error-redirect',
    r.status === 'dead' && r.reason === 'error-redirect',
    `got status=${r.status} reason=${r.reason} finalUrl=${r.finalUrl}`,
  );
}

{
  stubFetch(() => { throw abortError(); });
  const r = await checkUrlLiveness('https://x.org/slow');
  assert(
    'fetch aborted → status:ambiguous, reason:timeout',
    r.status === 'ambiguous' && r.reason === 'timeout',
    `got status=${r.status} reason=${r.reason}`,
  );
}

{
  stubFetch(() => { throw new TypeError('getaddrinfo ENOTFOUND'); });
  const r = await checkUrlLiveness('https://nowhere.invalid/x');
  assert(
    'fetch threw a non-abort error → status:ambiguous, reason:network-error',
    r.status === 'ambiguous' && r.reason === 'network-error',
    `got status=${r.status} reason=${r.reason}`,
  );
}

restoreFetch();

// ============================================================================
// 3. resolveRelatedDevelopmentUrls (stub assess, no network)
// ============================================================================

section('resolveRelatedDevelopmentUrls — stub assess (deterministic)');

{
  let assessCallCount = 0;
  const assessCallUrls = [];

  // Stub: dead for any URL containing 'dead', live otherwise.
  async function stubAssess(url) {
    assessCallCount++;
    assessCallUrls.push(url);
    if (url.includes('dead')) {
      return { displayUrl: false, liveness: { status: 'dead', reason: 'http-error-status' } };
    }
    return { displayUrl: true, liveness: { status: 'live', reason: 'ok' } };
  }

  const items = [
    { title: 'a', sourceUrl: 'https://dead.test/x', extra: 'keep-a' },
    { title: 'b', sourceUrl: 'https://live.test/y', extra: 'keep-b' },
    { title: 'c', sourceUrl: '',                     extra: 'keep-c' },
    { title: 'd', sourceUrl: 'https://dead.test/x', extra: 'keep-d' },
  ];

  const result = await resolveRelatedDevelopmentUrls(items, stubAssess);

  // a: dead → sourceUrl blanked
  assert(
    'item a (dead url) → sourceUrl blanked',
    result[0].sourceUrl === '',
    `got "${result[0].sourceUrl}"`,
  );

  // b: live → unchanged
  assert(
    'item b (live url) → sourceUrl unchanged',
    result[1].sourceUrl === 'https://live.test/y',
    `got "${result[1].sourceUrl}"`,
  );

  // c: empty → returned unchanged
  assert(
    'item c (empty url) → returned unchanged',
    result[2].sourceUrl === '',
    `got "${result[2].sourceUrl}"`,
  );

  // d: same dead URL as a → sourceUrl blanked
  assert(
    'item d (same dead url as a) → sourceUrl blanked',
    result[3].sourceUrl === '',
    `got "${result[3].sourceUrl}"`,
  );

  // Other fields preserved
  assert(
    'item a extra field preserved',
    result[0].extra === 'keep-a',
  );
  assert(
    'item b extra field preserved',
    result[1].extra === 'keep-b',
  );
  assert(
    'item c extra field preserved',
    result[2].extra === 'keep-c',
  );
  assert(
    'item d extra field preserved',
    result[3].extra === 'keep-d',
  );

  // Dedup: assess called once per unique non-empty URL.
  // Unique non-empty URLs: 'https://dead.test/x', 'https://live.test/y' → 2 calls.
  // 'https://dead.test/x' appears twice (a and d) but must only be fetched once.
  // Empty sourceUrl on c bypasses assess entirely.
  assert(
    'dedup: assess invoked once per unique url (2 unique non-empty urls → 2 calls)',
    assessCallCount === 2,
    `got assessCallCount=${assessCallCount}; urls called: ${JSON.stringify(assessCallUrls)}`,
  );
}

// ============================================================================
// 4. applyLivenessToDevelopments (stubbed fetch, deterministic)
// ============================================================================
//
// The end-to-end shape: structural gate first, then the liveness probe, with
// sourceUrl preserved in every branch so the UI can still show the source as
// plain text when the link is not displayable.
// ============================================================================

section('applyLivenessToDevelopments — stubbed fetch (deterministic)');

{
  // structuralValid stub: false for anything containing 'invalid', else true.
  function structuralValid(url) {
    return !url.includes('invalid');
  }

  // Route each fabricated URL to the branch it is standing for.
  stubFetch((url) => {
    if (url.includes('lcia.org')) {
      return respond({
        status: 200,
        url: 'https://www.lcia.org/Access/Error404.aspx?aspxerrorpath=/challenge-decisions.aspx',
      });
    }
    if (url.includes('blocked')) return respond({ status: 403, url });
    return respond({ status: 200, url });
  });

  const items = [
    { sourceUrl: 'https://www.lcia.org/challenge-decisions.aspx', title: 'soft-404 redirect' },
    { sourceUrl: 'https://www.italaw.com/cases/460',              title: 'good deep link' },
    { sourceUrl: 'https://invalid.test/path',                     title: 'structural fail' },
    { sourceUrl: 'https://blocked.test/path',                     title: 'bot-blocked source' },
  ];

  const result = await applyLivenessToDevelopments(items, structuralValid);

  assert(
    'soft-404 redirect → urlVerified:false',
    result[0].urlVerified === false,
    `got urlVerified=${result[0].urlVerified}`,
  );
  assert(
    'soft-404 redirect → sourceUrl preserved',
    result[0].sourceUrl === 'https://www.lcia.org/challenge-decisions.aspx',
    `got sourceUrl="${result[0].sourceUrl}"`,
  );

  assert(
    'good deep link → urlVerified:true',
    result[1].urlVerified === true,
    `got urlVerified=${result[1].urlVerified}`,
  );
  assert(
    'good deep link → sourceUrl preserved',
    result[1].sourceUrl === 'https://www.italaw.com/cases/460',
    `got sourceUrl="${result[1].sourceUrl}"`,
  );

  assert(
    'structural fail → urlVerified:false',
    result[2].urlVerified === false,
    `got urlVerified=${result[2].urlVerified}`,
  );
  assert(
    'structural fail → sourceUrl preserved',
    result[2].sourceUrl === 'https://invalid.test/path',
    `got sourceUrl="${result[2].sourceUrl}"`,
  );

  // The fail-open rule: a bot-block is ambiguous, not dead, so the link stays.
  assert(
    'bot-blocked source → urlVerified:true (ambiguous fails open)',
    result[3].urlVerified === true,
    `got urlVerified=${result[3].urlVerified}`,
  );
  assert(
    'bot-blocked source → sourceUrl preserved',
    result[3].sourceUrl === 'https://blocked.test/path',
    `got sourceUrl="${result[3].sourceUrl}"`,
  );

  restoreFetch();
}

// ============================================================================
// Summary
// ============================================================================

console.log(`\n════════════════════════════════`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log(`\n  Failed cases:`);
  for (const f of failures) console.log(`    • ${f}`);
}
console.log(`════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
