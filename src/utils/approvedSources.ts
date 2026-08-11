/**
 * approvedSources.ts — Consolidated Approved Source Registry
 *
 * The client-side source of truth for every open-access legal repository
 * the application recognises as authoritative. Two consumers:
 *
 *   1. Client-side prompt construction in src/prompts/ — builds archive
 *      lists passed to the model in client prompt-assembly paths.
 *   2. The URL validator (urlValidator.ts) — extracts domains from this
 *      registry to build its allowlist.
 *
 * A hand-maintained equivalent registry lives in functions/index.ts for
 * the server-side Daily Digest sweep. Edits to either copy must be
 * mirrored until this duplication is eliminated.
 *
 * To add a new source: add an entry here. Both the AI and the validator
 * will pick it up automatically.
 *
 * Categories follow a controlled taxonomy:
 *   - Arbitral Institution
 *   - Case Database
 *   - National Court / Judiciary
 *   - National Legislation
 *   - International Court / Tribunal
 *   - Legal Information Institute
 *   - Treaty / Policy Repository
 *   - Professional Body / Scholarship
 *
 * SHARED MODULE — used by both the browser client (Vite) and the
 * Firebase Cloud Functions runtime (Node.js).
 *
 * Must not import from, or reference:
 *   - React or any React ecosystem package
 *   - Vite-specific APIs (import.meta.env, import.meta.glob, etc.)
 *   - Browser globals (window, document, navigator, localStorage, etc.)
 *   - Any file that transitively depends on the above
 *
 * Violating this constraint will crash the Cloud Function at runtime,
 * typically with "import.meta is not defined" or similar errors.
 * TypeScript compilation does not catch these errors — discipline does.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ApprovedSource {
  /** Display name (e.g. 'BAILII') */
  name: string;
  /** Canonical base URL — used in the AI prompt and for domain extraction */
  url: string;
  /** Brief description of the repository */
  description: string;
  /** Taxonomy category from the controlled list above */
  category: ApprovedSourceCategory;
}

export type ApprovedSourceCategory =
  | 'Arbitral Institution'
  | 'Case Database'
  | 'National Court / Judiciary'
  | 'National Legislation'
  | 'International Court / Tribunal'
  | 'Legal Information Institute'
  | 'Treaty / Policy Repository'
  | 'Professional Body / Scholarship';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const APPROVED_SOURCES: ApprovedSource[] = [

  // =========================================================================
  // Case Databases
  // =========================================================================
  {
    name: 'italaw',
    url: 'https://www.italaw.com',
    description: 'Investment Treaty Arbitration — awards, decisions, and submissions',
    category: 'Case Database',
  },
  {
    name: 'UNCITRAL CLOUT',
    url: 'https://uncitral.un.org/en/case_law',
    description: 'Case Law on UNCITRAL Texts (CLOUT)',
    category: 'Case Database',
  },
  {
    name: 'ICSID Case Database',
    url: 'https://icsid.worldbank.org/cases/case-database',
    description: 'International Centre for Settlement of Investment Disputes',
    category: 'Case Database',
  },
  {
    name: 'PCA Case Repository',
    url: 'https://pca-cpa.org/en/cases',
    description: 'Permanent Court of Arbitration — case information and awards',
    category: 'Case Database',
  },
  {
    name: 'CAS Jurisprudence',
    url: 'https://jurisprudence.tas-cas.org',
    description: 'Court of Arbitration for Sport — non-confidential awards and procedures',
    category: 'Case Database',
  },

  // =========================================================================
  // Arbitral Institutions
  // =========================================================================
  {
    name: 'HKIAC',
    url: 'https://www.hkiac.org',
    description: 'Hong Kong International Arbitration Centre — case digest and rules',
    category: 'Arbitral Institution',
  },
  {
    name: 'SIAC',
    url: 'https://siac.org.sg',
    description: 'Singapore International Arbitration Centre — case information and rules',
    category: 'Arbitral Institution',
  },
  {
    name: 'ICC',
    url: 'https://iccwbo.org',
    description: 'International Chamber of Commerce — rules, notes, and public library',
    category: 'Arbitral Institution',
  },
  {
    name: 'LCIA',
    url: 'https://www.lcia.org',
    description: 'London Court of International Arbitration — decisions and rules',
    category: 'Arbitral Institution',
  },
  {
    name: 'AAA-ICDR',
    url: 'https://www.adr.org',
    description: 'American Arbitration Association / International Centre for Dispute Resolution',
    category: 'Arbitral Institution',
  },
  {
    name: 'SCC',
    url: 'https://sccarbitrationinstitute.se',
    description: 'Stockholm Chamber of Commerce — Arbitration Institute',
    category: 'Arbitral Institution',
  },
  {
    name: 'VIAC',
    url: 'https://www.viac.eu',
    description: 'Vienna International Arbitral Centre',
    category: 'Arbitral Institution',
  },
  {
    name: 'CRCICA',
    url: 'https://crcica.org',
    description: 'Cairo Regional Centre for International Commercial Arbitration',
    category: 'Arbitral Institution',
  },
  {
    name: 'WIPO AMC',
    url: 'https://www.wipo.int',
    description: 'World Intellectual Property Organization — arbitration, mediation, and domain name disputes',
    category: 'Arbitral Institution',
  },
  {
    name: 'DIAC',
    url: 'https://www.diac.com',
    description: 'Dubai International Arbitration Centre',
    category: 'Arbitral Institution',
  },
  {
    name: 'SCCA',
    url: 'https://www.sadr.org',
    description: 'Saudi Center for Commercial Arbitration',
    category: 'Arbitral Institution',
  },
  {
    name: 'DIS',
    url: 'https://www.disarb.org',
    description: 'German Arbitration Institute (Deutsche Institution für Schiedsgerichtsbarkeit)',
    category: 'Arbitral Institution',
  },
  {
    name: 'ACICA',
    url: 'https://acica.org.au',
    description: 'Australian Centre for International Commercial Arbitration',
    category: 'Arbitral Institution',
  },
  {
    name: 'CIETAC',
    url: 'https://www.cietac.org',
    description: 'China International Economic and Trade Arbitration Commission',
    category: 'Arbitral Institution',
  },

  // =========================================================================
  // National Courts & Judiciary
  // =========================================================================
  {
    name: 'UK Supreme Court',
    url: 'https://www.supremecourt.uk',
    description: 'Judgments and case details — United Kingdom',
    category: 'National Court / Judiciary',
  },
  {
    name: 'US Supreme Court',
    url: 'https://www.supremecourt.gov',
    description: 'Opinions and case information — United States',
    category: 'National Court / Judiciary',
  },
  {
    name: 'Singapore Judiciary',
    url: 'https://www.judiciary.gov.sg',
    description: 'Judgments and resources — Supreme Court of Singapore',
    category: 'National Court / Judiciary',
  },
  {
    name: 'Hong Kong Judiciary (LRS)',
    url: 'https://legalref.judiciary.hk',
    description: 'Legal Reference System — Hong Kong court judgments',
    category: 'National Court / Judiciary',
  },
  {
    name: 'Hong Kong Judiciary',
    url: 'https://www.judiciary.gov.hk',
    description: 'Judiciary of the Hong Kong SAR — public information',
    category: 'National Court / Judiciary',
  },
  {
    name: 'CourtListener / RECAP',
    url: 'https://www.courtlistener.com',
    description: 'US federal court opinions and PACER documents',
    category: 'National Court / Judiciary',
  },
  {
    name: 'UAE Ministry of Justice',
    url: 'https://www.moj.gov.ae',
    description: 'Laws and legislation — United Arab Emirates',
    category: 'National Court / Judiciary',
  },
  {
    name: 'Singapore Ministry of Law',
    url: 'https://www.mlaw.gov.sg',
    description: 'Legal policy and legislation — Singapore',
    category: 'National Court / Judiciary',
  },
  {
    name: 'India Supreme Court',
    url: 'https://www.sci.gov.in',
    description: 'Supreme Court of India — judgments',
    category: 'National Court / Judiciary',
  },
  {
    name: 'IndianKanoon',
    url: 'https://indiankanoon.org',
    description: 'Indian legal search engine — court decisions including arbitration jurisprudence',
    category: 'National Court / Judiciary',
  },
  {
    name: 'Netherlands Courts',
    url: 'https://www.rechtspraak.nl',
    description: 'Netherlands judiciary — includes the Netherlands Commercial Court (English-language)',
    category: 'National Court / Judiciary',
  },
  {
    name: 'Japan Courts',
    url: 'https://www.courts.go.jp',
    description: 'Supreme Court of Japan — English translations of judgments',
    category: 'National Court / Judiciary',
  },

  // =========================================================================
  // National Legislation
  // =========================================================================
  {
    name: 'UK Legislation',
    url: 'https://www.legislation.gov.uk',
    description: 'Primary and secondary legislation — United Kingdom',
    category: 'National Legislation',
  },
  {
    name: 'Hong Kong e-Legislation',
    url: 'https://www.elegislation.gov.hk',
    description: 'Verified copies of Hong Kong legislation',
    category: 'National Legislation',
  },
  {
    name: 'Légifrance',
    url: 'https://www.legifrance.gouv.fr',
    description: 'Public service for the dissemination of law — France',
    category: 'National Legislation',
  },
  {
    name: 'Singapore Statutes',
    url: 'https://sso.agc.gov.sg',
    description: 'Singapore Statutes Online — International Arbitration Act and related legislation',
    category: 'National Legislation',
  },

  // =========================================================================
  // International Courts & Tribunals
  // =========================================================================
  {
    name: 'Court of Justice of the EU',
    url: 'https://curia.europa.eu',
    description: 'CJEU and General Court judgments and opinions',
    category: 'International Court / Tribunal',
  },
  {
    name: 'European Court of Human Rights',
    url: 'https://www.echr.coe.int',
    description: 'ECHR judgments and case law (HUDOC)',
    category: 'International Court / Tribunal',
  },
  {
    name: 'International Court of Justice',
    url: 'https://www.icj-cij.org',
    description: 'ICJ judgments, advisory opinions, and orders',
    category: 'International Court / Tribunal',
  },
  {
    name: 'International Criminal Court',
    url: 'https://www.icc-cpi.int',
    description: 'ICC decisions and filings',
    category: 'International Court / Tribunal',
  },
  {
    name: 'ITLOS',
    url: 'https://www.itlos.org',
    description: 'International Tribunal for the Law of the Sea',
    category: 'International Court / Tribunal',
  },

  // =========================================================================
  // Legal Information Institutes
  // =========================================================================
  {
    name: 'BAILII',
    url: 'https://www.bailii.org',
    description: 'British and Irish Legal Information Institute',
    category: 'Legal Information Institute',
  },
  {
    name: 'Find Case Law (National Archives)',
    url: 'https://caselaw.nationalarchives.gov.uk',
    description: 'The National Archives — official judgments of England and Wales, plus the UK Supreme Court and Privy Council',
    category: 'Legal Information Institute',
  },
  {
    name: 'HKLII',
    url: 'https://www.hklii.hk',
    description: 'Hong Kong Legal Information Institute',
    category: 'Legal Information Institute',
  },
  {
    name: 'AustLII',
    url: 'https://www.austlii.edu.au',
    description: 'Australasian Legal Information Institute',
    category: 'Legal Information Institute',
  },
  {
    name: 'CanLII',
    url: 'https://www.canlii.ca',
    description: 'Canadian Legal Information Institute',
    category: 'Legal Information Institute',
  },
  {
    name: 'Cornell LII',
    url: 'https://www.law.cornell.edu',
    description: 'Cornell Law School — Legal Information Institute',
    category: 'Legal Information Institute',
  },
  {
    name: 'WorldLII',
    url: 'https://www.worldlii.org',
    description: 'World Legal Information Institute — global aggregator',
    category: 'Legal Information Institute',
  },
  {
    name: 'CommonLII',
    url: 'https://www.commonlii.org',
    description: 'Commonwealth Legal Information Institute',
    category: 'Legal Information Institute',
  },
  {
    name: 'AfricanLII',
    url: 'https://africanlii.org',
    description: 'African Legal Information Institute',
    category: 'Legal Information Institute',
  },

  // =========================================================================
  // Treaty & Policy Repositories
  // =========================================================================
  {
    name: 'UNCTAD Investment Policy Hub',
    url: 'https://investmentpolicy.unctad.org',
    description: 'Investment treaties, disputes, and policy monitoring',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'New York Convention Guide',
    url: 'https://newyorkconvention1958.org',
    description: 'Guide to the Convention on the Recognition and Enforcement of Foreign Arbitral Awards',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'UNCITRAL',
    url: 'https://uncitral.un.org',
    description: 'UN Commission on International Trade Law — texts, working groups, and resources',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'European Commission',
    url: 'https://ec.europa.eu',
    description: 'EU policy, press releases, and legislative documents',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'EUR-Lex (Official Journal of EU Law)',
    url: 'https://eur-lex.europa.eu',
    description: 'Official Journal of the European Union and authentic EU legal texts',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'IISD',
    url: 'https://www.iisd.org',
    description: 'International Institute for Sustainable Development — Investment Treaty News',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'OAS',
    url: 'https://www.oas.org',
    description: 'Organisation of American States — Inter-American treaties and arbitration conventions',
    category: 'Treaty / Policy Repository',
  },
  {
    name: 'Energy Charter Treaty',
    url: 'https://www.energychartertreaty.org',
    description: 'ECT case tracking and treaty documentation',
    category: 'Treaty / Policy Repository',
  },

  // =========================================================================
  // Professional Bodies & Scholarship
  // =========================================================================
  {
    name: 'SSRN',
    url: 'https://papers.ssrn.com',
    description: 'Social Science Research Network — open-access legal scholarship and working papers',
    category: 'Professional Body / Scholarship',
  },
  {
    name: 'IBA',
    url: 'https://www.ibanet.org',
    description: 'International Bar Association — arbitration guidelines, rules, and reports',
    category: 'Professional Body / Scholarship',
  },
  {
    name: 'ICCA',
    url: 'https://www.arbitration-icca.org',
    description: 'International Council for Commercial Arbitration — NYC Guide, reports, and African Arbitration Database',
    category: 'Professional Body / Scholarship',
  },
  {
    name: 'CIArb',
    url: 'https://www.ciarb.org',
    description: 'Chartered Institute of Arbitrators — practice guidelines and ethical codes',
    category: 'Professional Body / Scholarship',
  },
  {
    name: 'SVAMC',
    url: 'https://svamc.org',
    description: 'Silicon Valley Arbitration & Mediation Center — AI in arbitration guidelines',
    category: 'Professional Body / Scholarship',
  },
  {
    name: 'Trans-Lex.org',
    url: 'https://www.trans-lex.org',
    description: 'Transnational commercial law principles (lex mercatoria) — University of Cologne',
    category: 'Professional Body / Scholarship',
  },
];
