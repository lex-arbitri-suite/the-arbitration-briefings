/**
 * scheduledDailyRefresh and processRefreshRequest — Firebase Cloud Functions
 *
 * scheduledDailyRefresh runs the Daily Digest sweep automatically at
 * 06:28 UTC each day. processRefreshRequest is a Firestore-triggered
 * function invoked by the owner's Live Refresh request document. Both functions
 * delegate to the same internal helper, runDailyDigestSweep(), so the
 * pipeline behaviour is identical regardless of entry point:
 *   1. Build prompt via getDailyDigestPrompt()
 *   2. Call Gemini (generateGroundedDigestText) with Google Search
 *      grounding, then extract structured data
 *   3. Validate URLs against the approved-source allowlist
 *   4. Normalise categories against the controlled vocabulary
 *   5. De-duplicate by hash and by identifier-based non-hub gate
 *   6. Write resulting development cards to Firestore via
 *      writeDevelopments()
 *
 * ARCHITECTURAL NOTE — verify before editing duplicated surfaces
 *
 * The write pipeline itself (dedup, merge, Firestore writes) is
 * server-only. Some prompt-extraction artefacts are shared by direct
 * TypeScript import: DEVELOPMENT_EXTRACTION_PROMPT,
 * DEVELOPMENT_ITEMS_RESPONSE_SCHEMA, and DevelopmentItem come from
 * ../src/prompts/shared, which stays portable by avoiding Vite-only and
 * browser-only dependencies.
 *
 * As of d8ff71a, these surfaces remain hand-maintained in both this file
 * and src/: getDailyDigestPrompt (src/prompts/dailyDigest.ts),
 * URL-pattern guidance (src/prompts/urlPatterns.ts), APPROVED_SOURCES
 * (src/utils/approvedSources.ts), DEVELOPMENT_CATEGORIES and
 * normaliseCategory (src/constants.ts), and validateSourceUrl / URL
 * validation (src/utils/urlValidator.ts). Hash generation is excluded;
 * f194661 removed the client copy.
 *
 * The consolidation constraint varies item by item. Some duplicated
 * surfaces may depend on import.meta or browser-only constructs; others
 * may be importable via the shared.ts pattern and remain duplicated by
 * choice or oversight. Until a separate consolidation audit classifies
 * them, re-verify the list and apply intended edits to both copies.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreatedWithAuthContext } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError, type CallableRequest, type CallableResponse } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  type DevelopmentItem,
} from '../src/prompts/shared';

import {
  getGroundedProvider,
  getGenerationProvider,
  withGenerationFailover,
  generateDevelopments,
  AI_PROVIDER,
  AI_PROVIDER_FALLBACKS,
  openaiCompatApiKey,
  OPENAI_COMPAT_BASE_URL,
  OPENAI_COMPAT_MODEL_PRO,
  OPENAI_COMPAT_MODEL_FLASH,
} from './providers/registry';

import {
  type UrlLivenessResult,
  checkUrlLiveness,
  resolveRelatedDevelopmentUrls,
  applyLivenessToDevelopments,
} from './urlLiveness';

import { decideMerge } from './mergeGate';

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const OWNER_UID = defineString('OWNER_UID');
const ADMIN_EMAIL = defineString('OWNER_EMAIL');
const FIRESTORE_DATABASE_ID = 'arbitration-briefings';
const REFRESH_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

admin.initializeApp();
const db = getFirestore(FIRESTORE_DATABASE_ID);

// ============================================================================
// Development Card Categories — 11-category taxonomy
// ============================================================================

const DEVELOPMENT_CATEGORIES = [
  'Jurisprudence',
  'Legislation',
  'Institutional Rules',
  'Investment Treaty',
  'Enforcement',
  'Technology & AI',
  'Arbitrator Conduct & Ethics',
  'Climate, Energy & ESG',
  'Procedure & Evidence',
  'Damages & Funding',
  'General',
] as const;

type DevelopmentCategory = typeof DEVELOPMENT_CATEGORIES[number];

function normaliseCategory(raw: string): DevelopmentCategory {
  const lower = raw.toLowerCase().trim();

  const map: Record<string, DevelopmentCategory> = {
    'investment': 'Investment Treaty',
    'treaty': 'Investment Treaty',
    'isds': 'Investment Treaty',
    'reform': 'Investment Treaty',
    'bit': 'Investment Treaty',
    'ect': 'Investment Treaty',
    'icsid': 'Investment Treaty',
    'expropriation': 'Investment Treaty',
    'fair and equitable': 'Investment Treaty',
    'fet': 'Investment Treaty',
    'national treatment': 'Investment Treaty',
    'mfn': 'Investment Treaty',
    'umbrella clause': 'Investment Treaty',
    'legitimate expectations': 'Investment Treaty',
    'multilateral investment court': 'Investment Treaty',
    'investor-state': 'Investment Treaty',
    'bilateral investment': 'Investment Treaty',
    'energy charter': 'Investment Treaty',

    'enforcement': 'Enforcement',
    'immunity': 'Enforcement',
    'annulment': 'Enforcement',
    'set-aside': 'Enforcement',
    'public policy': 'Enforcement',
    'ordre public': 'Enforcement',
    'fsia': 'Enforcement',
    'new york convention': 'Enforcement',
    'recognition': 'Enforcement',
    'sovereign': 'Enforcement',
    'attachment': 'Enforcement',
    'exequatur': 'Enforcement',
    'anti-suit': 'Enforcement',
    'injunction': 'Enforcement',

    'jurisprudence': 'Jurisprudence',
    'jurisdiction': 'Jurisprudence',
    'arbitrability': 'Jurisprudence',
    'kompetenz': 'Jurisprudence',
    'separability': 'Jurisprudence',
    'non-signatory': 'Jurisprudence',
    'alter ego': 'Jurisprudence',
    'corporate veil': 'Jurisprudence',
    'sanctions': 'Jurisprudence',
    'corruption': 'Jurisprudence',
    'fraud': 'Jurisprudence',

    'technology': 'Technology & AI',
    'ai': 'Technology & AI',
    'artificial intelligence': 'Technology & AI',
    'cybersecurity': 'Technology & AI',
    'data protection': 'Technology & AI',
    'gdpr': 'Technology & AI',
    'blockchain': 'Technology & AI',
    'cryptocurrency': 'Technology & AI',
    'smart contract': 'Technology & AI',
    'digital': 'Technology & AI',
    'deepfake': 'Technology & AI',

    'ethics': 'Arbitrator Conduct & Ethics',
    'independence': 'Arbitrator Conduct & Ethics',
    'impartiality': 'Arbitrator Conduct & Ethics',
    'disclosure': 'Arbitrator Conduct & Ethics',
    'conflict of interest': 'Arbitrator Conduct & Ethics',
    'double-hatting': 'Arbitrator Conduct & Ethics',
    'challenge': 'Arbitrator Conduct & Ethics',
    'disqualification': 'Arbitrator Conduct & Ethics',
    'iba guidelines': 'Arbitrator Conduct & Ethics',
    'code of conduct': 'Arbitrator Conduct & Ethics',
    'bias': 'Arbitrator Conduct & Ethics',

    'climate': 'Climate, Energy & ESG',
    'energy': 'Climate, Energy & ESG',
    'mining': 'Climate, Energy & ESG',
    'extractive': 'Climate, Energy & ESG',
    'esg': 'Climate, Energy & ESG',
    'sustainability': 'Climate, Energy & ESG',
    'human rights': 'Climate, Energy & ESG',
    'environmental': 'Climate, Energy & ESG',
    'supply chain': 'Climate, Energy & ESG',
    'green transition': 'Climate, Energy & ESG',

    'procedure': 'Procedure & Evidence',
    'procedural': 'Procedure & Evidence',
    'interim': 'Procedure & Evidence',
    'emergency arbitrator': 'Procedure & Evidence',
    'expedited': 'Procedure & Evidence',
    'bifurcation': 'Procedure & Evidence',
    'document production': 'Procedure & Evidence',
    'privilege': 'Procedure & Evidence',
    'expert witness': 'Procedure & Evidence',
    'evidence': 'Procedure & Evidence',
    'redfern schedule': 'Procedure & Evidence',
    'seat': 'Procedure & Evidence',
    'confidentiality': 'Procedure & Evidence',
    'transparency': 'Procedure & Evidence',

    'damages': 'Damages & Funding',
    'quantum': 'Damages & Funding',
    'valuation': 'Damages & Funding',
    'discounted cash flow': 'Damages & Funding',
    'dcf': 'Damages & Funding',
    'lost profits': 'Damages & Funding',
    'interest': 'Damages & Funding',
    'cost allocation': 'Damages & Funding',
    'funding': 'Damages & Funding',
    'third-party funding': 'Damages & Funding',
    'litigation finance': 'Damages & Funding',
    'costs': 'Damages & Funding',

    'institutional': 'Institutional Rules',
    'rules': 'Institutional Rules',

    'legislation': 'Legislation',

    'treaty arbitration': 'Investment Treaty',
    'isds reform': 'Investment Treaty',
    'technology & ethics': 'Technology & AI',
    'climate & energy': 'Climate, Energy & ESG',
    'procedure & costs': 'Procedure & Evidence',
  };

  for (const [keyword, category] of Object.entries(map)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }

  if ((DEVELOPMENT_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as DevelopmentCategory;
  }

  return 'General';
}

// ============================================================================
// Approved Sources Registry
// ============================================================================

interface ApprovedSource {
  name: string;
  url: string;
}

const APPROVED_SOURCES: ApprovedSource[] = [
  { name: 'italaw', url: 'https://www.italaw.com' },
  { name: 'UNCITRAL CLOUT', url: 'https://uncitral.un.org/en/case_law' },
  { name: 'ICSID Case Database', url: 'https://icsid.worldbank.org/cases/case-database' },
  { name: 'PCA Case Repository', url: 'https://pca-cpa.org/en/cases' },
  { name: 'CAS Jurisprudence', url: 'https://jurisprudence.tas-cas.org' },
  { name: 'HKIAC', url: 'https://www.hkiac.org' },
  { name: 'SIAC', url: 'https://siac.org.sg' },
  { name: 'ICC', url: 'https://iccwbo.org' },
  { name: 'LCIA', url: 'https://www.lcia.org' },
  { name: 'AAA-ICDR', url: 'https://www.adr.org' },
  { name: 'SCC', url: 'https://sccarbitrationinstitute.se' },
  { name: 'VIAC', url: 'https://www.viac.eu' },
  { name: 'CRCICA', url: 'https://crcica.org' },
  { name: 'WIPO AMC', url: 'https://www.wipo.int' },
  { name: 'DIAC', url: 'https://www.diac.com' },
  { name: 'SCCA', url: 'https://www.sadr.org' },
  { name: 'DIS', url: 'https://www.disarb.org' },
  { name: 'ACICA', url: 'https://acica.org.au' },
  { name: 'CIETAC', url: 'https://www.cietac.org' },
  { name: 'UK Supreme Court', url: 'https://www.supremecourt.uk' },
  { name: 'US Supreme Court', url: 'https://www.supremecourt.gov' },
  { name: 'Singapore Judiciary', url: 'https://www.judiciary.gov.sg' },
  { name: 'Hong Kong Judiciary (LRS)', url: 'https://legalref.judiciary.hk' },
  { name: 'Hong Kong Judiciary', url: 'https://www.judiciary.gov.hk' },
  { name: 'CourtListener / RECAP', url: 'https://www.courtlistener.com' },
  { name: 'UAE Ministry of Justice', url: 'https://www.moj.gov.ae' },
  { name: 'Singapore Ministry of Law', url: 'https://www.mlaw.gov.sg' },
  { name: 'India Supreme Court', url: 'https://www.sci.gov.in' },
  { name: 'IndianKanoon', url: 'https://indiankanoon.org' },
  { name: 'Netherlands Courts', url: 'https://www.rechtspraak.nl' },
  { name: 'Japan Courts', url: 'https://www.courts.go.jp' },
  { name: 'UK Legislation', url: 'https://www.legislation.gov.uk' },
  { name: 'Hong Kong e-Legislation', url: 'https://www.elegislation.gov.hk' },
  { name: 'Légifrance', url: 'https://www.legifrance.gouv.fr' },
  { name: 'Singapore Statutes', url: 'https://sso.agc.gov.sg' },
  { name: 'Court of Justice of the EU', url: 'https://curia.europa.eu' },
  { name: 'European Court of Human Rights', url: 'https://www.echr.coe.int' },
  { name: 'International Court of Justice', url: 'https://www.icj-cij.org' },
  { name: 'International Criminal Court', url: 'https://www.icc-cpi.int' },
  { name: 'ITLOS', url: 'https://www.itlos.org' },
  { name: 'BAILII', url: 'https://www.bailii.org' },
  { name: 'Find Case Law (National Archives)', url: 'https://caselaw.nationalarchives.gov.uk' },
  { name: 'HKLII', url: 'https://www.hklii.hk' },
  { name: 'AustLII', url: 'https://www.austlii.edu.au' },
  { name: 'CanLII', url: 'https://www.canlii.ca' },
  { name: 'Cornell LII', url: 'https://www.law.cornell.edu' },
  { name: 'WorldLII', url: 'https://www.worldlii.org' },
  { name: 'CommonLII', url: 'https://www.commonlii.org' },
  { name: 'AfricanLII', url: 'https://africanlii.org' },
  { name: 'UNCTAD Investment Policy Hub', url: 'https://investmentpolicy.unctad.org' },
  { name: 'New York Convention Guide', url: 'https://newyorkconvention1958.org' },
  { name: 'UNCITRAL', url: 'https://uncitral.un.org' },
  { name: 'European Commission', url: 'https://ec.europa.eu' },
  { name: 'EUR-Lex (Official Journal of EU Law)', url: 'https://eur-lex.europa.eu' },
  { name: 'IISD', url: 'https://www.iisd.org' },
  { name: 'OAS', url: 'https://www.oas.org' },
  { name: 'Energy Charter Treaty', url: 'https://www.energychartertreaty.org' },
  { name: 'SSRN', url: 'https://papers.ssrn.com' },
  { name: 'IBA', url: 'https://www.ibanet.org' },
  { name: 'ICCA', url: 'https://www.arbitration-icca.org' },
  { name: 'CIArb', url: 'https://www.ciarb.org' },
  { name: 'SVAMC', url: 'https://svamc.org' },
  { name: 'Trans-Lex.org', url: 'https://www.trans-lex.org' },
];

// ============================================================================
// Prompt Construction
// ============================================================================

function buildArchivesPromptList(): string {
  return APPROVED_SOURCES.map(s => `- ${s.name} (${s.url})`).join('\n');
}

function buildCategoriesPromptList(): string {
  return DEVELOPMENT_CATEGORIES.map(c => `'${c}'`).join(', ');
}

function getDailyDigestPrompt(): string {
  // SYNC: the four sections in urlPatternGuidance below must match
  // the constants exported by src/prompts/urlPatterns.ts. If you
  // edit urlPatterns.ts, also edit this constant. (functions/ is a
  // separate npm package and cannot import from src/.)
  const urlPatternGuidance = `ACCEPTABLE URL EXAMPLES (each points to a specific document, not a homepage or listing):

- italaw case page: https://www.italaw.com/cases/2513
- ICSID case detail: https://icsid.worldbank.org/en/Pages/cases/casedetail.aspx?CaseNo=ARB%2F97%2F7
- PCA case page: https://pca-cpa.org/en/cases/1/
- UK Supreme Court case: https://www.supremecourt.uk/cases/uksc-2025-0165
- ICJ case page: https://www.icj-cij.org/case/186
- ECHR judgment via HUDOC: https://hudoc.echr.coe.int/app/conversion/pdf/?library=ECHR&id=003-8507918-12071365
- CJEU judgment via EUR-Lex CELEX: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62016CJ0284
- BAILII case page: https://www.bailii.org/uk/cases/UKSC/2020/48.html
- Find Case Law judgment: https://caselaw.nationalarchives.gov.uk/ewca/civ/2020/574
- CanLII case page (canonical short form): https://canlii.ca/t/g7qt5
- AustLII case page: https://www.austlii.edu.au/au/cases/cth/HCA/2025/29.html
- HKLII case page: https://www.hklii.hk/en/cases/hkca/2025/234
- Hoge Raad judgment via Rechtspraak: https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2024:375
- Légifrance code article: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000023430167
- UNCTAD Investment Policy Hub article: https://investmentpolicy.unctad.org/news/hub/1793/20260401-update-on-investor-state-arbitrations-400-cases-filed-under-investment-treaties-since-2020

NOT ACCEPTABLE URL EXAMPLES (homepages, listings, search pages, or guessed identifiers):

- https://www.italaw.com/ — bare homepage
- https://icsid.worldbank.org/ — bare homepage
- https://icsid.worldbank.org/cases/case-database — case-database listing, not a specific case
- https://www.bailii.org/uk/cases/UKSC/ — court listing, not a specific case
- https://www.hklii.hk/en/cases/hkca/ — court listing, not a specific case
- https://www.supremecourt.gov/opinions/slipopinion/25 — term index, not an individual opinion
- https://www.italaw.com/cases/99999 — invented case identifier (never construct case IDs that have not been confirmed by a search result)
- https://www.google.com/search?q=Maffezini+v+Spain — search results page is not a primary source

CANONICAL URL PATTERNS BY SOURCE (recognise these patterns when search returns a candidate URL; if a URL from search does not match the canonical pattern for its domain, treat it as suspect and cite by name only):

Case databases:
- italaw: /cases/{numeric-id} (e.g. /cases/2513)
- ICSID case detail: /en/Pages/cases/casedetail.aspx?CaseNo={URL-encoded case number, e.g. ARB%2F97%2F7}
- PCA: /en/cases/{numeric-id}/

National & supreme courts:
- UK Supreme Court: /cases/{docket-id} (e.g. /cases/uksc-2024-0001)
- Supreme Court of India: /view-pdf/?diary_no={n}&type=j&order_date=YYYY-MM-DD
- IndianKanoon: /doc/{numeric-id}/
- Hoge Raad / Dutch courts via Rechtspraak: /details?id={ECLI, e.g. ECLI:NL:HR:2024:375}

International courts:
- ICJ: /case/{numeric-id}
- ECHR HUDOC: /app/conversion/pdf/?library=ECHR&id={ECHR-document-id}
- CJEU judgments: prefer the EUR-Lex CELEX deep link /legal-content/EN/TXT/?uri=CELEX:{celex-id}

Legal Information Institutes:
- Find Case Law: /{court}/{YYYY}/{N} or /{court}/{division}/{YYYY}/{N} — e.g. /uksc/2021/1, /ukpc/2021/9, /ewca/civ/2020/574, /ewhc/comm/2023/1. Covers England and Wales plus UK-wide Supreme Court and Privy Council. Prefer it over BAILII for those courts: it is the official National Archives service and its links can be checked, whereas BAILII's cannot.
- BAILII: /uk/cases/{COURT}/{YYYY}/{N}.html or /ew/cases/{COURT}/{division}/{YYYY}/{N}.html
- CanLII: short form /t/{stable-short-id} preferred; long form /en/{j}/{court}/doc/{year}/{neutral-cite}/{neutral-cite}.html
- AustLII: /au/cases/{jurisdiction}/{COURT}/{year}/{n}.html
- HKLII: /en/cases/{court}/{year}/{n}
- AfricanLII: /en/akn/{country-code}/judgment/{court}/{year}/{n}/eng@{date}

Legislation & treaties:
- EUR-Lex: /legal-content/{LANG}/TXT/?uri=CELEX:{celex-id}
- Légifrance code articles: /codes/article_lc/LEGIARTI{numeric-id}
- Légifrance code sections: /codes/section_lc/LEGITEXT{numeric-id}/LEGISCTA{numeric-id}/
- Légifrance older laws/decrees: /loda/id/{LEGITEXT-id}/
- UK Legislation: /{type}/{year}/{number} (e.g. /uksi/2024/123)
- Singapore Statutes Online: /Act/{ActId} for primary acts
- UNCTAD Investment Policy Hub: /news/hub/{n}/{YYYYMMDD-slug}
- Trans-Lex: /{numeric-id}

CITE BY NAME ONLY (do not construct or include any URL for these sources — provide source name and case reference as plain text):

- Court of Arbitration for Sport (CAS): jurisprudence.tas-cas.org uses session-bound search
- UNCITRAL CLOUT abstracts: pattern unstable
- Hong Kong Legal Reference System (legalref.judiciary.hk): session-only deep links
- newyorkconvention1958.org: site is JavaScript-only; for the Convention text, link to UNCITRAL's mirror at uncitral.un.org
- All institutional homepages and arbitral institution sites with no stable case-level URL pattern, including: HKIAC, SIAC, ICC, LCIA, AAA-ICDR, SCC, VIAC, CRCICA, WIPO AMC, DIAC, SCCA, DIS, ACICA, CIETAC, IBA, CIArb, SVAMC, IISD, OAS, UAE Ministry of Justice, Singapore Ministry of Law, Hong Kong Judiciary main site`;

  return `<instruction>
Per §5.1 (Prompt Delimiter Standard): this tag contains static instructions only.

Adopt the voice of a Senior Partner conducting a forensic arbitration intelligence review.
Tone requirements: minimalist, exacting, and authoritative. Avoid promotional language, conversational filler, and speculative phrasing.
Each output must read as chamber-ready legal intelligence.

Conduct a global sweep of international arbitration developments from 2025 and 2026.
You MUST consult the following non-exhaustive list of arbitration archives, together with other official and authoritative institutional sources where strictly necessary:

${buildArchivesPromptList()}

Select the 12 most significant and authoritative developments.
PRIORITISATION: Prioritise landmark cases, court judgments, and official institutional awards (category: 'Jurisprudence') over secondary commentary, trade press, or general legislative noise.

Return ONLY a JSON array of objects with these exact fields:
- category: string — MUST be exactly one of: ${buildCategoriesPromptList()}. Do not invent categories outside this list.
- title: string (formal legal title suitable for a senior briefing; see Title discipline below)
- date: string (e.g., 'January 2026')
- summary: string (2-3 sentences in forensic style; see Drafting standard below)
- query: string (a precise legal research enquiry; see Query discipline below)
- sourceUrl: string (direct URL to a specific case page, judgment, or legislative text — NOT a homepage, directory, or search page)

TITLE DISCIPLINE — identifiers when present:
Titles must be readable on their own as a senior briefing heading. Where the source contains specific high-signal identifiers, include them in the title. Where none is present, write a descriptive title without inventing identifiers.

High-signal identifiers include:
- case numbers or docket references (e.g. "UKSC 2024/0155", "ICSID Case No. ARB/20/14")
- party names in disputes (e.g. "Nissan v. India", "Eco Oro v. Colombia")
- named instruments or rules (e.g. "IBA Guidelines on Party Representation 2024", "SIAC Rules 2025", "UNCITRAL Model Law")
- specific treaties and state agreements (e.g. "Energy Charter Treaty", "UK–China BIT", "NAFTA Chapter 11", "USMCA Annex 14-C")
- named tribunals, courts, or institutions (e.g. "UK Supreme Court", "ICSID ad hoc committee", "Svea Court of Appeal")

Never fabricate a case number, party name, instrument name, or treaty reference. If the source is a general announcement, policy speech, or commentary with no specific case or instrument, write a descriptive title — do not invent a reference.

Retain the exact original formatting and punctuation of citations, case numbers, and treaty references as they appear in the source. Do not normalise, abbreviate, or alter punctuation in identifiers.

Acceptable titles (identifier present):
✓ "Nissan v. India — UNCITRAL tribunal issues award on jurisdiction"
✓ "UK Supreme Court refuses permission to appeal in UKSC 2024/0155"
✓ "SIAC publishes SIAC Rules 2025 with expanded emergency arbitrator provisions"
✓ "Svea Court of Appeal sets aside award in ICSID annulment"

Acceptable titles (no identifier available):
✓ "IBA issues guidance on use of generative AI by arbitrators"
✓ "ICC publishes annual statistical report on 2025 caseload"

Unacceptable titles (abstracted, no source attribution):
✗ "Tribunal issues landmark award on jurisdiction"
✗ "Court refuses to enforce annulled award"
✗ "New arbitration rules published"

QUERY DISCIPLINE:
Each item must include a query field: a complete, grammatical research question that a lawyer might pose when investigating this development. The query must be phrased as an interrogative sentence ending in a question mark, not as a keyword string or a fragment. It must include the most specific identifying elements available (case name, parties, instrument, treaty, jurisdiction) and carry enough contextual specificity to invite a substantive analytical response, not merely restate the title.

Acceptable (complete research question):
- title: "ICCA-IBA Report on Arbitrator Cybersecurity Protocols: Best Practices for Data Protection in Proceedings"
- query: "What are the procedural implications and recommended safeguards in the ICCA-IBA Report on Arbitrator Cybersecurity Protocols for managing data protection obligations in international arbitration proceedings?"

Unacceptable (keyword string):
- title: "ICCA-IBA Report on Arbitrator Cybersecurity Protocols: Best Practices for Data Protection in Proceedings"
- query: "ICCA-IBA report arbitrator cybersecurity protocols data protection best practices 2026"

Unacceptable (title restated as a yes/no question):
- title: "Singapore court enforces emergency arbitrator order"
- query: "Did the Singapore court enforce the emergency arbitrator order?"

STRICT LINK VERIFICATION:
1. Every sourceUrl MUST link to a specific case page, judgment, legislative text, or document — never a homepage, case directory, or generic search page.
2. NEVER guess, invent, or construct URLs. If a specific page URL is unavailable, EXCLUDE the item entirely rather than substituting a generic or root-level URL. This applies without exception: it is preferable to return fewer than 12 items than to include an item without a verifiable direct URL.
3. Avoid paywalled publications (e.g., GAR, Law360) unless no authoritative open source exists.
4. If provenance is uncertain, exclude the item rather than infer.

URL EXAMPLES — study these before generating sourceUrl values:
${urlPatternGuidance}

DRAFTING STANDARD FOR SUMMARIES:
- sentence 1: identify the tribunal/court, instrument, and procedural context;
- sentence 2: analyse the doctrinal or enforcement significance;
- sentence 3 (optional): state practical implication for counsel, tribunal strategy, or award enforcement.
- Where a case number, party name, named instrument, or treaty reference appears in the title, repeat the most specific identifier in the summary as well, using the exact same formatting and punctuation. This aids downstream research, citation, and traceability.
</instruction>`;
}

// ============================================================================
// URL Validation
// ============================================================================

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const ALLOWED_DOMAINS: Set<string> = (() => {
  const domains = new Set<string>();
  for (const source of APPROVED_SOURCES) {
    const domain = extractDomain(source.url);
    if (domain) domains.add(domain);
  }
  return domains;
})();

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

function validateSourceUrl(url: string): ValidationResult {
  if (!url || url.trim() === '') {
    return { isValid: false, reason: 'Empty URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { isValid: false, reason: 'Malformed URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, reason: `Insecure protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.replace(/^www\./, '');
  const parts = hostname.split('.');
  let domainApproved = false;

  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (ALLOWED_DOMAINS.has(candidate)) {
      domainApproved = true;
      break;
    }
  }

  if (!domainApproved) {
    return { isValid: false, reason: `Domain not on approved list: ${hostname}` };
  }

  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  if (pathSegments.length === 0) {
    return { isValid: false, reason: 'Generic homepage — no specific resource path' };
  }

  return { isValid: true };
}

// ============================================================================
// Server-Side Liveness Check
// ============================================================================
//
// The liveness helpers (UrlLivenessResult, hasErrorPageMarker,
// checkUrlLiveness) and the application loops (resolveRelatedDevelopmentUrls,
// applyLivenessToDevelopments) live in ./urlLiveness.ts — a Firebase-free
// module that can be imported into a test harness. Imported above.
//
// Zero-egress analysis: the fetch calls in urlLiveness.ts transmit only the
// AI-produced public source URL to the public site named in that URL. No case
// facts, chat content, prompts, or workspace data are included. Disclosed on
// MethodologyPage §I.

/**
 * Combines structural validation with the liveness probe. SSRF-safe
 * ordering: structural check (HTTPS + approved domain + non-homepage)
 * runs first; the fetch is never issued for a structurally invalid URL.
 *
 * displayUrl is false only on confirmed deadness — ambiguous keeps the
 * link (fail-open policy).
 */
async function assessSourceUrlForDisplay(url: string): Promise<{
  displayUrl: boolean;
  structuralValid: boolean;
  liveness: UrlLivenessResult;
}> {
  const structural = validateSourceUrl(url);

  if (!structural.isValid) {
    return {
      displayUrl: false,
      structuralValid: false,
      liveness: { status: 'dead', reason: 'invalid-url' },
    };
  }

  const liveness = await checkUrlLiveness(url);
  return {
    displayUrl: liveness.status !== 'dead',
    structuralValid: true,
    liveness,
  };
}

async function validateDevelopments(
  items: DevelopmentItem[]
): Promise<(DevelopmentItem & { urlVerified: boolean })[]> {
  // Structural warn fires here (before delegating) so the detailed reason
  // string from validateSourceUrl is still logged at this layer.
  for (const item of items) {
    const structural = validateSourceUrl(item.sourceUrl);
    if (!structural.isValid) {
      console.warn(
        `[URL Hardening] Demoted (structural): "${item.title}" — ${structural.reason}`
      );
    }
  }

  return applyLivenessToDevelopments(
    items,
    (u) => validateSourceUrl(u).isValid,
  );
}

// ============================================================================
// Hash Generation
// ============================================================================

function generateHash(sourceUrl: string, caseName: string): string {
  const str = sourceUrl + '|' + caseName;
  // Deterministic UTF-8-safe Base64 key for Firestore de-duplication.
  // The same sourceUrl + caseName pair must produce the same hash across
  // scheduled and manual sweeps so exact duplicates can be skipped.
  return btoa(unescape(encodeURIComponent(str)));
}

// ============================================================================
// Identifier Extraction for Merge Rule (Step D, Memo 1)
// ============================================================================
//
// The identifier patterns, stopword and hub lists, and the merge
// decision itself live in ./mergeGate.ts — a Firebase-free module with
// its own test harness (mergeGate.test.mjs). Imported above.
//
// Matching rule (see writeDevelopments below): decideMerge declares a
// merge only on a shared digit-bearing case/docket identifier, or on at
// least two shared non-hub word tokens. Hardened 9 August 2026 after the
// original one-shared-token gate merged unrelated developments and the
// merge path's URL ratchet then grafted wrong sourceUrls across cards
// (.context/00-current/2026-08-09-daily-digest-wrong-sources-diagnosis.md).
// Conforms to Governing Standard §5, Identifier Discipline for Semantic
// Matching Standard (v1.5): when in doubt, create a new record rather
// than merge.

// ============================================================================
// Firestore Pipeline (server-side)
// ============================================================================

interface ExistingDevelopment {
  id: string;
  hash: string;
  title: string;
  updates: string[];
  sourceUrl?: string;
  urlVerified?: boolean;
}

async function fetchExistingDevelopments(): Promise<ExistingDevelopment[]> {
  const snapshot = await db.collection('developments').get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    hash: doc.data().hash || '',
    title: doc.data().title || '',
    updates: doc.data().updates || [],
    sourceUrl: doc.data().sourceUrl,
    urlVerified: doc.data().urlVerified,
  }));
}

async function writeDevelopments(
  newDevs: (DevelopmentItem & { urlVerified: boolean })[]
): Promise<{ created: number; updated: number; skipped: number }> {
  const existing = await fetchExistingDevelopments();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const dev of newDevs) {
    const normalisedDev = { ...dev, category: normaliseCategory(dev.category) };
    const hash = generateHash(normalisedDev.sourceUrl, normalisedDev.title);

    const isDuplicate = existing.some(d => d.hash === hash);
    if (isDuplicate) {
      skipped++;
      continue;
    }

    // Identifier-based merge rule (Step D, Memo 1; hardened 9 August 2026).
    //
    // decideMerge (mergeGate.ts) declares a merge only on a shared
    // digit-bearing case/docket identifier, or on at least two shared
    // non-hub word tokens. The full discipline — patterns, stopwords,
    // hub identifiers, and the rationale — lives in mergeGate.ts.
    let matchedExistingDev: ExistingDevelopment | null = null;
    for (const existingDev of existing) {
      if (decideMerge(normalisedDev.title, existingDev.title)) {
        matchedExistingDev = existingDev;
        break;
      }
    }

    if (matchedExistingDev) {
      const updates = matchedExistingDev.updates || [];

      const updateFields: Record<string, unknown> = {
        updates: [...updates, `Latest Update: ${normalisedDev.summary}`],
        lastRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
        // OQ20 precursor (merge-path idempotency fix): persist the new hash
        // so that an identical content retry hits Path (a)'s exact-hash skip
        // rather than re-firing Path (b) and appending a duplicate
        // "Latest Update" entry. Surfaced by OQ20 §3.6(a) precursor diligence.
        hash,
      };

      // One-way ratchet: upgrade demoted-or-missing URLs to verified URLs;
      // never write urlVerified: false in this path; never overwrite an
      // already-verified URL. The literal `true` is written deliberately
      // — the branch is only entered after the predicate establishes
      // verified status, and the literal prevents future refactors from
      // accidentally writing a non-true value in this path.
      //
      // Fill-empty-only (9 August 2026): the ratchet may fill an EMPTY
      // URL slot, or re-verify the SAME URL — it must never swap a
      // different URL onto the card. Under the old rule a false merge
      // grafted the merged item's URL onto an unrelated card and stamped
      // it verified (see the wrong-sources diagnosis in .context/).
      const existingUrl = (matchedExistingDev.sourceUrl ?? '').trim();
      const incomingUrl =
        typeof normalisedDev.sourceUrl === 'string'
          ? normalisedDev.sourceUrl.trim()
          : '';
      const shouldUpgradeUrl =
        normalisedDev.urlVerified === true &&
        matchedExistingDev.urlVerified !== true &&
        incomingUrl.length > 0 &&
        (existingUrl.length === 0 || existingUrl === incomingUrl);

      if (shouldUpgradeUrl) {
        updateFields.sourceUrl = normalisedDev.sourceUrl;
        updateFields.urlVerified = true;
      }

      await db.collection('developments').doc(matchedExistingDev.id).update(updateFields);
      updated++;
    } else {
      await db.collection('developments').add({
        ...normalisedDev,
        hash,
        updates: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created++;
    }
  }

  return { created, updated, skipped };
}

const RETENTION_DAYS = 365;
const FIRESTORE_BATCH_LIMIT = 500;

async function pruneDevelopmentsOlderThanRetention(): Promise<void> {
  const retentionThreshold = new Date();
  retentionThreshold.setDate(retentionThreshold.getDate() - RETENTION_DAYS);
  const threshold = admin.firestore.Timestamp.fromDate(retentionThreshold);

  const snapshot = await db
    .collection('developments')
    .where('lastRefreshedAt', '<', threshold)
    .get();

  if (snapshot.empty) {
    console.log('Retention pruning: no documents matched the age threshold.');
    return;
  }

  const docs = snapshot.docs;
  let pruned = 0;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    for (const doc of chunk) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    pruned += chunk.length;
  }

  console.log(`Retention pruning: removed ${pruned} document(s) with lastRefreshedAt before threshold.`);
}

// ============================================================================
// Daily Digest Sweep — shared by scheduled and callable entry points
// ============================================================================

async function runDailyDigestSweep(
  source: 'manual' | 'scheduled'
): Promise<{ created: number; updated: number; skipped: number }> {
  console.log(`Initialising ${source} Daily Digest refresh…`);

  const apiKey = geminiApiKey.value();
  // Grounded sweep: always Gemini, regardless of AI_PROVIDER setting.
  const provider = getGroundedProvider(apiKey);
  const prompt = getDailyDigestPrompt();

  console.log('Dispatching provider generateDevelopments request…');
  const rawDevs = await generateDevelopments(provider, prompt);

  if (!Array.isArray(rawDevs) || rawDevs.length === 0) {
    console.warn('Gemini returned no developments. Terminating run.');
    return { created: 0, updated: 0, skipped: 0 };
  }

  console.log(`Received ${rawDevs.length} raw developments. Validating URLs (structural + liveness)…`);
  const validatedDevs = await validateDevelopments(rawDevs);

  console.log('Commencing Firestore write pipeline…');
  const result = await writeDevelopments(validatedDevs);

  console.log(
    `Daily Digest complete. ` +
    `Created: ${result.created}, Updated: ${result.updated}, Skipped (duplicate): ${result.skipped}`
  );

  return result;
}

// ============================================================================
// Scheduled Cloud Function — 06:28 UTC daily
// ============================================================================

export const scheduledDailyRefresh = onSchedule(
  {
    schedule: '28 6 * * *',
    timeZone: 'UTC',
    secrets: [geminiApiKey],
  },
  async () => {
    const result = await runDailyDigestSweep('scheduled');
    console.log(`[scheduledDailyRefresh] ${JSON.stringify(result)}`);
    try {
      await pruneDevelopmentsOlderThanRetention();
    } catch (pruneError) {
      console.error('Retention pruning failed (sweep writes are unaffected).', pruneError);
    }
  }
);

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg === 'unauthorised') return 'unauthorised';
    if (msg === 'malformed-request') return 'Malformed request';
    const status = (error as { status?: unknown }).status;
    if (error.name === 'ApiError' && status === 503) {
      return 'AI provider temporarily unavailable. Please try again later.';
    }
  }
  return 'Refresh failed. Please try again.';
}

async function resolveAuthContextEmail(authId: string | undefined): Promise<string | null> {
  if (!authId) {
    return null;
  }

  try {
    const user = await getAuth().getUser(authId);
    return user.email ?? null;
  } catch (error) {
    console.error('processRefreshRequest: failed to resolve auth context user', error);
    return null;
  }
}

export const processRefreshRequest = onDocumentCreatedWithAuthContext(
  {
    document: 'refreshRequests/{requestId}',
    database: FIRESTORE_DATABASE_ID,
    secrets: [geminiApiKey],
    timeoutSeconds: 300,
    region: 'us-west2',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      return null;
    }

    const ref = snap.ref;

    try {
      const data = snap.data();
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + REFRESH_REQUEST_TTL_MS);

      if (!data || typeof data.requestedBy !== 'string' || !data.requestedAt) {
        throw new Error('malformed-request');
      }

      const authContextEmail = await resolveAuthContextEmail(event.authId);
      if (authContextEmail !== ADMIN_EMAIL.value() || data.requestedBy !== ADMIN_EMAIL.value()) {
        await ref.update({
          status: 'failed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
          errorMessage: 'unauthorised',
        });
        return null;
      }

      await ref.update({
        status: 'running',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });

      const { created, updated } = await runDailyDigestSweep('manual');

      await ref.update({
        status: 'complete',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        created,
        updated,
      });

      return null;
    } catch (error) {
      console.error('processRefreshRequest failed', error);

      try {
        await ref.update({
          status: 'failed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + REFRESH_REQUEST_TTL_MS),
          errorMessage: toSafeErrorMessage(error),
        });
      } catch (statusWriteError) {
        console.error('processRefreshRequest: failed to write failure status', statusWriteError);
      }

      return null;
    }
  }
);

// ============================================================================
// Interactive AI callables — owner-only, server-side Gemini key
// ============================================================================

function assertOwner(request: CallableRequest): void {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.');
  if (request.auth.uid !== OWNER_UID.value())
    throw new HttpsError('permission-denied', 'Owner access only.');
}

export const streamChatCompletion = onCall<
  { messages: Array<{ role: 'user' | 'assistant'; content: string }>; systemInstruction: string },
  Promise<string>,
  string
>(
  { region: 'us-west2', secrets: [geminiApiKey] },
  async (request: CallableRequest, response?: CallableResponse<string>) => {
    assertOwner(request);
    const { messages, systemInstruction } = request.data as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      systemInstruction: string;
    };
    // The secret MUST be resolved inside the handler; Firebase enforces
    // resolution within the callable scope where secrets[] is declared.
    const apiKey = geminiApiKey.value();
    // Research chat is Gemini-pinned: grounded search + citations are
    // essential here. AI_PROVIDER does not apply to this path.
    const provider = getGroundedProvider(apiKey);
    try {
      const fullText = await provider.streamChat(
        messages,
        systemInstruction,
        response?.signal,
        async (chunk) => {
          if (request.acceptsStreaming && response) {
            await response.sendChunk(chunk);
          }
        },
      );
      return fullText;
    } catch (error) {
      console.error('[streamChatCompletion] error:', error);
      throw provider.classifyError(error);
    }
  }
);

export const generateTextCompletion = onCall<
  { prompt: string; model?: 'pro' | 'flash' },
  Promise<{ text: string }>
>(
  // openaiCompatApiKey is declared here so Firebase injects it if the secret
  // is set, making it available via openaiCompatApiKey.value() inside the
  // handler without a separate redeploy when switching providers.
  { region: 'us-west2', secrets: [geminiApiKey, openaiCompatApiKey], timeoutSeconds: 120 },
  async (request: CallableRequest) => {
    assertOwner(request);
    const { prompt, model: modelChoice } = request.data as {
      prompt: string;
      model?: 'pro' | 'flash';
    };
    const geminiKey = geminiApiKey.value();
    const tier: 'pro' | 'flash' = modelChoice === 'flash' ? 'flash' : 'pro';

    // Briefing generation uses the operator-selected provider (AI_PROVIDER),
    // with failover to configured fallbacks if the primary is unavailable.
    const { provider, providerId } = getGenerationProvider(geminiKey);
    try {
      const text = await withGenerationFailover(
        (p) => p.generateText(prompt, tier),
        providerId,
        provider,
        geminiKey,
        // Budget: 90s across the whole failover chain, leaving the function's
        // 120s ceiling headroom for Firestore writes and error handling.
        90_000
      );
      return { text };
    } catch (error) {
      throw provider.classifyError(error);
    }
  }
);

export const generateRelatedDevelopments = onCall<
  { prompt: string },
  Promise<DevelopmentItem[]>
>(
  { region: 'us-west2', secrets: [geminiApiKey], timeoutSeconds: 120 },
  async (request: CallableRequest) => {
    assertOwner(request);
    const { prompt } = request.data as { prompt: string };
    const apiKey = geminiApiKey.value();
    // Related-developments sweep is grounded/citation-critical: always Gemini.
    const provider = getGroundedProvider(apiKey);
    try {
      const items = await generateDevelopments(provider, prompt);
      return await resolveRelatedDevelopmentUrls(items, assessSourceUrlForDisplay);
    } catch (error) {
      throw provider.classifyError(error);
    }
  }
);

// ============================================================================
// getAIConfig — runtime configuration read-back (public, no owner auth)
// ============================================================================

/**
 * Shape of the response returned by getAIConfig.
 *
 * All fields are safe for public disclosure. Secrets (API keys, base URLs
 * that expose infrastructure) are never included.
 */
interface AIConfigResponse {
  /** Id of the active generation provider (e.g. 'gemini', 'openai-compat'). */
  generationProviderId: string;
  /** Pro-tier model name for the active generation provider (non-secret). */
  generationModelPro: string;
  /** Flash-tier model name for the active generation provider (non-secret). */
  generationModelFlash: string;
  /** Grounded-search provider. Always 'gemini' in v1. */
  groundedProviderId: 'gemini';
  /** Research-chat provider. Always 'gemini' in v1 (Gemini-pinned). */
  chatProviderId: 'gemini';
  /** Ids of configured fallback providers for briefing generation. */
  fallbackProviderIds: string[];
  /** True if briefing-generation failover is enabled (fallbacks configured). */
  failoverEnabled: boolean;
  /**
   * True if the selected generation provider is Gemini (the grounded paths
   * are therefore guaranteed to use the same key source).
   */
  generationIsGemini: boolean;
  /**
   * True if the active provider appears to be correctly configured. False
   * if the selected provider is openai-compat but required params are absent —
   * the misconfiguration policy will reject briefing calls until fixed.
   */
  generationProviderConfigured: boolean;
}

/**
 * Returns the sanitised runtime AI configuration for the Methodology page.
 *
 * Callable without owner authentication — the page is public and the
 * response contains no secrets. Operators must not include API keys, base
 * URLs, or other infrastructure-exposing values in these params.
 *
 * The disclosure obligation: before enabling an alternate provider, the
 * Methodology page must reflect the true runtime config. This callable
 * makes that drift structurally impossible.
 */
export const getAIConfig = onCall<void, Promise<AIConfigResponse>>(
  // openaiCompatApiKey is declared so Firebase can inject it if present;
  // its value is used only for a presence check, never returned.
  { region: 'us-west2', secrets: [geminiApiKey, openaiCompatApiKey] },
  async (_request: CallableRequest): Promise<AIConfigResponse> => {
    const selectedProvider = AI_PROVIDER.value().trim().toLowerCase() || 'gemini';
    const fallbacksRaw = AI_PROVIDER_FALLBACKS.value().trim();
    const fallbackIds = fallbacksRaw
      ? fallbacksRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    let generationModelPro = 'gemini-2.5-pro';
    let generationModelFlash = 'gemini-2.5-flash';
    let generationProviderConfigured = true;

    if (selectedProvider === 'openai-compat') {
      const baseUrl = OPENAI_COMPAT_BASE_URL.value().trim();
      // Key presence check only — the key value itself is never returned.
      let keyPresent = false;
      try {
        keyPresent = !!openaiCompatApiKey.value().trim();
      } catch {
        keyPresent = false;
      }
      const modelPro = OPENAI_COMPAT_MODEL_PRO.value().trim();
      const modelFlash = OPENAI_COMPAT_MODEL_FLASH.value().trim();

      generationModelPro = modelPro || '(not configured)';
      generationModelFlash = modelFlash || '(not configured)';
      generationProviderConfigured = !!(baseUrl && keyPresent && modelPro && modelFlash);
    }

    return {
      generationProviderId: selectedProvider,
      generationModelPro,
      generationModelFlash,
      groundedProviderId: 'gemini',
      chatProviderId: 'gemini',
      fallbackProviderIds: fallbackIds,
      failoverEnabled: fallbackIds.length > 0,
      generationIsGemini: selectedProvider === 'gemini',
      generationProviderConfigured,
    };
  }
);
