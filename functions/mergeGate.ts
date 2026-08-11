/**
 * mergeGate.ts — identifier extraction and the merge decision for the
 * Daily Digest write pipeline (Step D, Memo 1; hardened 9 August 2026).
 *
 * A Firebase-free module, importable into a plain-Node test harness
 * (mergeGate.test.mjs), per the Pure Module Standard and on the pattern
 * of urlLiveness.ts.
 *
 * Background. writeDevelopments (index.ts) merges a newly swept
 * development into an existing card when their titles refer to the same
 * matter. The original gate declared a merge on ONE shared "high-signal
 * identifier", but the extraction patterns treated any capitalised word
 * of four or more letters as high-signal. In production this merged
 * "Vietnam Oil and Gas Group" with "UNCITRAL Working Group III" on the
 * word "Group", and the merge path's URL ratchet then grafted the wrong
 * development's sourceUrl onto the card (diagnosis:
 * .context/00-current/2026-08-09-daily-digest-wrong-sources-diagnosis.md).
 *
 * The hardened gate (decideMerge below) conforms to the Identifier
 * Discipline for Semantic Matching Standard (Governing Standard §5,
 * v1.5): structural vocabulary is filtered before matching, and the
 * fail-safe direction is more records, never silent conflation.
 */

// Regex patterns applied to titles via String.prototype.matchAll, which
// requires the /g flag and iterates without mutating the regex's
// lastIndex.
export const IDENTIFIER_PATTERNS: RegExp[] = [
  // Case numbers and docket references, e.g. "UKSC 2024/0155",
  // "ICSID ARB/20/14", "C-284/16", "OC-32/25", "HKCFI 2444".
  // Digit-bearing tokens from this pattern are the strongest merge
  // signal (see decideMerge).
  /\b[A-Z]{2,}[-/\s]?\d{2,}[-/\s]?\d{0,5}\b/g,
  // Capitalised tokens — title case of length ≥ 4, or acronyms of
  // length ≥ 3. Captures party names ("Nissan", "Hulley"), acronymic
  // party designations ("DJP", "DJO"), institutions, etc. The ≥ 3
  // acronym threshold (was ≥ 4) lets three-letter party ciphers in
  // anonymised judgments participate in matching; institutional
  // three-letter acronyms (ICC, PCA, ICJ…) are neutralised via
  // HUB_IDENTIFIERS below.
  /\b[A-Z][a-z]{3,}\b|\b[A-Z]{3,}\b/g,
  // Quoted phrases (minimum 3 characters inside the quotes).
  /"([^"]{3,})"/g,
];

// Structural vocabulary, filtered before matching per Governing Standard
// §5 rule 2: action verbs, document types, procedural nouns, and
// subject-area terms common to arbitration titles. Deliberately
// over-specified; the Standard accepts that this list may filter some
// marginally informative tokens, because the fail-safe direction is a
// missed merge (a visible duplicate), never a false one (silent
// conflation). Stored lowercased; extracted tokens are lowercased
// before lookup.
//
// The bare instrument keywords (convention, treaty, rules, law…) that a
// former third extraction pattern promoted to identifiers now sit here:
// unqualified, they are structural vocabulary ("Law" merged the PRC
// Arbitration Law with an English case on governing law). Named
// instruments still match through the capitalised-token pattern
// ("Energy" + "Charter" + "Treaty").
export const IDENTIFIER_STOPWORDS: Set<string> = new Set([
  // Structural vocabulary
  'tribunal', 'tribunals', 'court', 'courts', 'award', 'awards',
  'decision', 'decisions', 'judgment', 'judgments', 'ruling', 'rulings',
  'order', 'orders', 'case', 'cases', 'arbitration', 'arbitrations',
  'arbitrator', 'arbitrators', 'arbitral',
  // Procedural descriptors
  'appeal', 'appeals', 'enforce', 'enforcement', 'challenge', 'challenges',
  'annulment', 'annulments', 'setaside', 'jurisdiction', 'jurisdictional',
  'proceedings', 'procedure', 'procedures', 'provisions', 'provisional',
  'application', 'applications',
  // Document and issuance types
  'issues', 'issued', 'publishes', 'published', 'publication',
  'report', 'reports', 'article', 'articles', 'guidelines', 'guideline',
  'statement', 'statements', 'advisory', 'opinion', 'opinions',
  'statistics', 'caseload',
  // Bare instrument keywords (unqualified uses only — see block comment)
  'convention', 'treaty', 'treaties', 'rules', 'protocol', 'agreement',
  'charter', 'act', 'law', 'laws', 'code', 'model',
  // Institutional-structure nouns
  'institute', 'institution', 'institutions', 'centre', 'center',
  'commission', 'committee', 'council', 'chamber', 'chambers',
  'association', 'organisation', 'organization', 'group', 'groups',
  'working', 'session', 'sessions', 'ministry', 'government',
  // Court-and-state generics
  'international', 'national', 'federal', 'supreme', 'constitutional',
  'united', 'nations', 'kingdom', 'republic', 'states', 'state',
  'justice', 'high', 'chartered',
  // Subject-area terms common to the docket
  'dispute', 'disputes', 'resolution', 'settlement', 'investor',
  'investment', 'investments', 'commercial', 'emergency', 'climate',
  // Action verbs common in headlines
  'releases', 'release', 'launches', 'launch', 'implements', 'adopts',
  'adoption', 'approves', 'approved', 'delivers', 'enters', 'reports',
  'amends', 'amendment', 'amendments', 'revised', 'revision', 'reform',
  'reforms', 'refuses', 'grants', 'dismisses', 'upholds', 'affirms',
  // Corporate suffixes
  'llc', 'ltd', 'plc', 'inc', 'gmbh',
  // Generic modifiers
  'new', 'latest', 'recent', 'landmark', 'significant', 'major',
  'key', 'important', 'final', 'interim', 'partial', 'record',
  'annual', 'force', 'effective',
]);

// Hub identifiers: legitimate high-signal tokens that co-occur across
// many unrelated developments (multilateral treaties, foundational
// conventions, broad institutional rule-sets — and, since the 9 August
// hardening, bare institutional acronyms, court acronyms, and
// place/jurisdiction names). Present in both new and existing titles,
// they do NOT drive a merge and do not count toward the two-token
// threshold. Stored lowercased; extracted tokens are lowercased before
// lookup.
export const HUB_IDENTIFIERS: Set<string> = new Set([
  // Foundational conventions
  'new york convention', 'icsid convention', 'washington convention',
  'uncitral model law', 'uncitral rules', 'vienna convention',
  // Multilateral treaties
  'energy charter treaty', 'ect',
  'trans-pacific partnership',
  'comprehensive and progressive agreement for trans-pacific partnership',
  'cptpp', 'north american free trade agreement', 'nafta', 'usmca',
  // Institutional rule-sets
  'icc rules', 'lcia rules', 'siac rules', 'hkiac rules', 'scc rules',
  'vienna rules', 'uncitral arbitration rules', 'pca rules',
  // Cross-cutting frameworks
  'iba guidelines', 'iba rules',
  'iba rules on the taking of evidence',
  'hague convention', 'singapore convention',
  'singapore convention on mediation',
  // Bare institutional acronyms — real signal, but they co-occur across
  // every development an institution touches ("UNCITRAL" merged a
  // California statute with Working Group III's ISDS reform)
  'uncitral', 'icsid', 'icc', 'lcia', 'siac', 'hkiac', 'scc', 'pca',
  'icj', 'iba', 'ciarb', 'viac', 'cietac', 'diac', 'scca', 'wipo',
  'unctad', 'icca', 'icdr', 'aaa', 'svamc', 'iisd', 'oas', 'dis',
  'crcica', 'acica', 'bit', 'isds', 'ecthr', 'cjeu',
  // Court acronyms (a shared court is not a shared case)
  'uksc', 'ewhc', 'ewca', 'ukpc', 'sgca', 'sghc', 'sicc', 'hkcfi',
  'hkca', 'hkcu', 'bgh', 'scotus',
  // Places and jurisdictions
  'singapore', 'hong', 'kong', 'china', 'chinese', 'india', 'indian',
  'spain', 'spanish', 'italy', 'italian', 'germany', 'german', 'france',
  'french', 'england', 'english', 'wales', 'scotland', 'london', 'paris',
  'geneva', 'stockholm', 'vienna', 'dubai', 'cairo', 'beijing',
  'russia', 'russian', 'ukraine', 'argentina', 'california',
  'netherlands', 'dutch', 'sweden', 'swedish', 'swiss', 'switzerland',
  'america', 'american', 'europe', 'european', 'union', 'york',
  'vietnam', 'kazakhstan', 'libya', 'frankfurt',
]);

/**
 * Extracts the set of non-stopword high-signal identifiers from a title.
 * Returned values are lowercased for case-insensitive comparison by the
 * caller. Hub membership is NOT filtered here — decideMerge applies the
 * non-hub gate.
 */
export function extractHighSignalIdentifiers(title: string): Set<string> {
  const result = new Set<string>();
  for (const pattern of IDENTIFIER_PATTERNS) {
    for (const match of title.matchAll(pattern)) {
      // For patterns with a capturing group (quoted phrases), prefer
      // the group; otherwise use the full match.
      const token = (match[1] ?? match[0]).trim().toLowerCase();
      if (!token) continue;
      if (IDENTIFIER_STOPWORDS.has(token)) continue;
      result.add(token);
    }
  }
  return result;
}

/** Minimum shared non-hub, non-docket tokens required to declare a merge. */
export const MIN_SHARED_TOKENS = 2;

/**
 * The merge decision. Two titles refer to the same development when:
 *
 *  (a) they share a digit-bearing identifier (a case number, docket
 *      reference, or numbered instrument — "ARB/17/14", "OC-32/25");
 *      one such match suffices, because these are unique by
 *      construction; or
 *  (b) they share at least MIN_SHARED_TOKENS distinct non-hub word
 *      tokens ("Hulley" + "Enterprises"). A single shared word is never
 *      enough: with title-case headlines, one capitalised word in
 *      common is closer to coincidence than identity.
 *
 * Hub identifiers never count toward either limb. When in doubt the
 * answer is NO — Governing Standard §5's conservative fallback: a
 * visible duplicate is recoverable; a silent false merge is not.
 */
export function decideMerge(titleA: string, titleB: string): boolean {
  // Identical titles are the same development by definition, even when
  // every word in them is structural vocabulary.
  const normA = titleA.trim().toLowerCase();
  if (normA.length > 0 && normA === titleB.trim().toLowerCase()) return true;

  const idsA = extractHighSignalIdentifiers(titleA);
  const idsB = extractHighSignalIdentifiers(titleB);
  const shared = [...idsA].filter(
    id => idsB.has(id) && !HUB_IDENTIFIERS.has(id)
  );
  if (shared.some(id => /\d/.test(id))) return true;
  return shared.filter(id => !/\d/.test(id)).length >= MIN_SHARED_TOKENS;
}
