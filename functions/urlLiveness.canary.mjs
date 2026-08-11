/**
 * urlLiveness.canary.mjs — real-network canary for the source-link check.
 *
 * Run: npm run canary (from the project root). Allow ~2 minutes.
 *
 * This is not a test and never fails the build. It answers one question the
 * offline suite cannot: are the approved source sites still answering our
 * probe today? A source that has started refusing automated requests is
 * invisible to the liveness check — the check fails open and keeps the link,
 * which is the right call for a real link, but it also means a hallucinated
 * link to that source would no longer be caught. That is worth knowing, and
 * it is not a defect in this code, so it does not belong in a pass/fail suite.
 *
 * Written 10 August 2026, after italaw began refusing every automated probe
 * (403, regardless of User-Agent) and two fixtures in the old combined suite
 * started failing for reasons that had nothing to do with our logic.
 *
 * Widened 11 August 2026. It ran on four fixtures, so it could only ever
 * report on the one source anybody had thought to test. It now sweeps the
 * whole approved registry, and counts every ambiguous verdict rather than
 * bot-block alone — a timeout and a TLS failure pass links through just as
 * unexamined as a 403 does, and the old list stayed silent on both.
 *
 * Read the UNCHECKABLE list at the bottom. Everything on it is a source whose
 * links currently pass through the liveness gate unexamined.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const compiled = path.join(__dirname, 'lib', 'functions', 'urlLiveness.js');
const { checkUrlLiveness } = require(compiled);

// ============================================================================
// Part 1 — hand-verified deep-link fixtures
// ============================================================================
//
// Deep links, not homepages — the liveness check only ever sees deep links.
// These exercise the classification branches against real sites. `expect`
// records what the source did when the fixture was written, so a change is
// visible without being an assertion.
// ============================================================================

const FIXTURES = [
  {
    label: 'LCIA — soft-404 redirect',
    url: 'https://www.lcia.org/challenge-decisions.aspx',
    expect: 'dead / error-redirect',
  },
  {
    label: 'italaw — known-good case page',
    url: 'https://www.italaw.com/cases/460',
    expect: 'ambiguous / bot-block  (refusing all probes since 10 Aug 2026)',
  },
  {
    label: 'italaw — non-existent case page',
    url: 'https://www.italaw.com/cases/999999',
    expect: 'ambiguous / bot-block  (refusing all probes since 10 Aug 2026)',
  },
  {
    label: 'black-hole endpoint (timeout branch)',
    url: 'https://10.255.255.1/probe',
    expect: 'ambiguous / timeout',
  },
];

// ============================================================================
// Part 2 — the approved registry, read from its one home
// ============================================================================
//
// APPROVED_SOURCES lives in index.ts and is not exported; index.ts imports
// firebase-admin, which calls initializeApp() at module load and cannot be
// imported outside a Firebase environment. So the list is parsed out of the
// source text rather than copied here — a second copy would drift, and the
// copy that drifts is the one nobody re-reads.
//
// A parser that silently reads fewer entries than exist would under-report
// exactly the thing this file is for, so it counts what it found against an
// independent count of the block and shouts on any disagreement.
// ============================================================================

function readApprovedSources() {
  const src = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
  const block = src.match(
    /const APPROVED_SOURCES: ApprovedSource\[\] = \[([\s\S]*?)\n\];/
  );
  if (!block) {
    return { rows: [], declared: 0, error: 'APPROVED_SOURCES block not found in index.ts' };
  }
  const declared = (block[1].match(/name:/g) || []).length;
  const rows = [...block[1].matchAll(/\{\s*name:\s*'([^']+)',\s*url:\s*'([^']+)'\s*\}/g)].map(
    (m) => ({ name: m[1], url: m[2] })
  );
  return { rows, declared, error: null };
}

const registry = readApprovedSources();

// ============================================================================
// Probe
// ============================================================================

console.log('\n  Source-link canary — real network, never fails the build.\n');
console.log('  (allow ~2 minutes)\n');

// Anything the check calls ambiguous is a link kept without examination.
// Keyed off the status, not off a re-listing of which reasons are ambiguous —
// the reasons are urlLiveness.ts's business and it may add more.
const uncheckable = [];

function note(label, url, result) {
  if (result.status === 'ambiguous') {
    uncheckable.push({
      label,
      url,
      detail: `${result.status} / ${result.reason}${
        result.statusCode ? ` [HTTP ${result.statusCode}]` : ''
      }${result.retried ? ' (still failing after a retry)' : ''}`,
    });
  }
}

console.log('  ── Part 1: deep-link fixtures ────────────────────────────────\n');

for (const fixture of FIXTURES) {
  let line;
  try {
    const r = await checkUrlLiveness(fixture.url);
    const code = r.statusCode ? ` [HTTP ${r.statusCode}]` : '';
    line = `${r.status} / ${r.reason}${code}`;
    note(fixture.label, fixture.url, r);
  } catch (e) {
    line = `threw: ${e}`;
  }

  console.log(`  ${fixture.label}`);
  console.log(`    url      ${fixture.url}`);
  console.log(`    today    ${line}`);
  console.log(`    recorded ${fixture.expect}\n`);
}

// ============================================================================
// Registry census
// ============================================================================
//
// Homepages, because there is no hand-verified deep link for most sources.
// This under-detects: a site may serve its homepage freely and refuse its
// deep pages, and the gate only ever sees deep pages. Read the count below
// as a floor on how many sources are unexaminable, never as the total.
// ============================================================================

console.log('  ── Part 2: approved-registry census (homepage proxy) ─────────\n');

if (registry.error) {
  console.log(`  !! Could not read the registry: ${registry.error}`);
  console.log('  !! The census below is empty for that reason, not because');
  console.log('  !! every source answered. Fix the parser before believing it.\n');
} else if (registry.rows.length !== registry.declared) {
  console.log(`  !! Registry parse mismatch: matched ${registry.rows.length} entries`);
  console.log(`  !! but the block declares ${registry.declared}. The census below is`);
  console.log('  !! incomplete and its counts understate the exposure.\n');
} else {
  console.log(`  Read ${registry.rows.length} sources from index.ts.\n`);
}

const census = [];
const CONCURRENCY = 3;
let cursor = 0;

async function worker() {
  while (cursor < registry.rows.length) {
    const source = registry.rows[cursor++];
    try {
      const r = await checkUrlLiveness(source.url);
      census.push({ ...source, ...r });
    } catch (e) {
      census.push({ ...source, status: 'threw', reason: String(e) });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// A 403 is a decision the site made and will make again. A timeout or a
// connection error is not: sweeping 60-odd sites at once congests the local
// link, and a slow-but-healthy source trips the 5s abort. Left unretried the
// census swings by ten sources between runs, which is how an instrument
// teaches you to stop reading it. Retry those two reasons once, serially.
const flaky = census.filter(
  (c) => c.status === 'ambiguous' && (c.reason === 'timeout' || c.reason === 'network-error')
);

if (flaky.length > 0) {
  console.log(`    (retrying ${flaky.length} timed-out or unreachable sources serially…)\n`);
  for (const entry of flaky) {
    try {
      const r = await checkUrlLiveness(entry.url);
      Object.assign(entry, r, { retried: true });
    } catch {
      entry.retried = true;
    }
  }
}

for (const entry of census) {
  note(entry.name, entry.url, entry);
}

const answered = census.filter((c) => c.status === 'live').length;
const dead = census.filter((c) => c.status === 'dead').length;
const ambiguous = census.filter((c) => c.status === 'ambiguous').length;

console.log(`    answered the probe   ${answered}`);
console.log(`    answered, page dead  ${dead}`);
console.log(`    would not answer     ${ambiguous}`);
console.log(`    probe threw          ${census.filter((c) => c.status === 'threw').length}\n`);

// ============================================================================
// The finding worth acting on
// ============================================================================

console.log('════════════════════════════════');
if (uncheckable.length === 0) {
  console.log('  UNCHECKABLE SOURCES: none. Everything answered our probe.');
} else {
  console.log(`  UNCHECKABLE SOURCES: ${uncheckable.length}`);
  console.log('  These refuse or fail to answer automated probes, so their links');
  console.log('  pass through the liveness gate unexamined. Fail-open keeps real');
  console.log('  links working; a hallucinated link to one of these is not caught.');
  console.log('  A homepage that answers does not promise its deep pages will, so');
  console.log('  read this as a floor, not a total.\n');
  for (const u of uncheckable) {
    console.log(`    • ${u.label} — ${u.detail}`);
    console.log(`      ${u.url}`);
  }
}
console.log('════════════════════════════════\n');

// A canary reports; it does not fail.
process.exit(0);
