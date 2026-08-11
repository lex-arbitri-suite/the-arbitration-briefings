/**
 * mergeGate.test.mjs — plain Node.js test suite for the Daily Digest
 * merge gate.
 *
 * Imports from the compiled CommonJS output in lib/functions/mergeGate.js.
 * Run: node functions/mergeGate.test.mjs (from the project root) or
 *      node mergeGate.test.mjs (from the functions/ directory).
 *
 * The must-not-merge fixtures are the real false-merge pairs observed in
 * production on 9 August 2026 (see .context/00-current/
 * 2026-08-09-daily-digest-wrong-sources-diagnosis.md). Under the old
 * one-shared-token gate, every one of them merged — on the words
 * "Group", "UNCITRAL", "Law", and the like — and the merge path's URL
 * ratchet then grafted wrong sourceUrls across cards. They are pinned
 * here so the gate can never regress to merging them.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const compiled = path.join(__dirname, 'lib', 'functions', 'mergeGate.js');
const { decideMerge, extractHighSignalIdentifiers } = require(compiled);

// ============================================================================
// Minimal test harness
// ============================================================================

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label} — expected ${expected}, got ${actual}`);
  }
}

// ============================================================================
// Must NOT merge — production false-merge pairs, 9 August 2026
// ============================================================================

console.log('\nMust NOT merge (production false-merge pairs):');

check(
  'Vietnam Oil (SGCA case) vs UNCITRAL Working Group III — old gate merged on "Group"',
  decideMerge(
    'Vietnam Oil and Gas Group v. Joint Stock Company [2025] SGCA 50 — Singapore Court of Appeal sets aside award for breach of natural justice',
    'UNCITRAL Working Group III advances ISDS reform at its 53rd session'
  ),
  false
);

check(
  'California Model Law adoption vs UNCITRAL WGIII — old gate merged on "UNCITRAL"',
  decideMerge(
    'California Adopts 2006 UNCITRAL Model Law Amendments',
    'UNCITRAL Working Group III advances ISDS reform at its 53rd session'
  ),
  false
);

check(
  'PRC Arbitration Law vs English Court of Appeal case — old gate merged on "Law"',
  decideMerge(
    'Revised Arbitration Law of the People\'s Republic of China enters into force',
    'English Court of Appeal rules on arbitration agreement governing law in [2026] EWCA Civ 797'
  ),
  false
);

check(
  'IACtHR Advisory Opinion OC-32/25 vs ICJ climate advisory opinion',
  decideMerge(
    'Inter-American Court of Human Rights issues Advisory Opinion OC-32/25 on Climate Emergency and Human Rights',
    'International Court of Justice delivers Advisory Opinion on Climate Change obligations of states'
  ),
  false
);

check(
  'IBA Conflicts Guidelines vs ICC 2026 Arbitration Rules',
  decideMerge(
    'IBA Arbitration Committee publishes revised Guidelines on Conflicts of Interest in International Arbitration',
    'ICC publishes revised 2026 Arbitration Rules'
  ),
  false
);

check(
  'Two different Hong Kong cases do not merge on the place name',
  decideMerge(
    'LY v HW — [2026] HKCA 936',
    'A v. B1 and B2 — [2026] HKCFI 2444'
  ),
  false
);

check(
  'CIArb AI guideline vs HKIAC AI guideline (same topic, different institutions)',
  decideMerge(
    'Chartered Institute of Arbitrators publishes Guideline on the Use of AI in Arbitration 2025',
    'HKIAC releases guidelines on use of artificial intelligence in arbitration'
  ),
  false
);

check(
  'SIAC Rules 2025 vs ICC 2026 Rules (rule-set launches, different institutions)',
  decideMerge(
    'SIAC publishes SIAC Rules 2025 with expanded emergency arbitrator provisions',
    'ICC publishes revised 2026 Arbitration Rules'
  ),
  false
);

// ============================================================================
// MUST merge — genuine same-development pairs
// ============================================================================

console.log('\nMust merge (same development):');

check(
  'Shared ICSID docket ARB/17/14 (Rockhopper annulment)',
  decideMerge(
    'Rockhopper v. Italy — ICSID Case No. ARB/17/14 — ad hoc committee annuls €190m ECT award',
    'ICSID ad hoc committee issues decision on annulment in ARB/17/14'
  ),
  true
);

check(
  'Shared multi-word party name (Hulley Enterprises / Yukos enforcement)',
  decideMerge(
    'Hulley Enterprises Ltd & Ors v. The Russian Federation — English Commercial Court enforces US$50bn Yukos award',
    'UK Supreme Court refuses Russia permission to appeal in Hulley Enterprises Yukos enforcement'
  ),
  true
);

check(
  'Anonymised party ciphers DJP / DJO under two citations (old gate missed this true duplicate)',
  decideMerge(
    'DJP and others v DJO [2025] SGCA(I) 2 — Singapore Court of Appeal sets aside award for breach of natural justice',
    'DJP and others v DJO [2025] 1 SLR 576'
  ),
  true
);

check(
  'Shared UK Supreme Court docket in title pair',
  decideMerge(
    'UK Supreme Court refuses permission to appeal in UKSC 2024/0155',
    'Court of Appeal decision under challenge in UKSC 2024/0155 concerned s.68 of the Arbitration Act 1996'
  ),
  true
);

check(
  'Identical titles always merge',
  decideMerge(
    'Energy Charter Treaty modernisation amendments enter provisional application',
    'Energy Charter Treaty modernisation amendments enter provisional application'
  ),
  true
);

// ============================================================================
// Extraction sanity
// ============================================================================

console.log('\nExtraction sanity:');

const vietnamIds = extractHighSignalIdentifiers(
  'Vietnam Oil and Gas Group v. Joint Stock Company [2025] SGCA 50'
);
check('"group" is filtered as structural vocabulary', vietnamIds.has('group'), false);

const prcIds = extractHighSignalIdentifiers(
  'Revised Arbitration Law of the People\'s Republic of China enters into force'
);
check('bare "law" is filtered as structural vocabulary', prcIds.has('law'), false);

const rockhopperIds = extractHighSignalIdentifiers(
  'Rockhopper v. Italy — ICSID Case No. ARB/17/14'
);
check('docket "arb/17/14" survives extraction', rockhopperIds.has('arb/17/14'), true);
check('party name "rockhopper" survives extraction', rockhopperIds.has('rockhopper'), true);

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
