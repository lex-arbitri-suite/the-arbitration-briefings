// Development Card Categories — 11-category taxonomy
// Updated: 6 April 2026
// Replaces the previous 10-category taxonomy.
// "ISDS Reform" absorbed into "Investment Treaty".
// "Technology & Ethics" split into "Technology & AI" and "Arbitrator Conduct & Ethics".
// "Climate & Energy" renamed to "Climate, Energy & ESG".
// "Procedure & Costs" renamed to "Procedure & Evidence".
// "Damages & Funding" added as new category.

/**
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

export const DEVELOPMENT_CATEGORIES = [
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

export type DevelopmentCategory = typeof DEVELOPMENT_CATEGORIES[number];

/**
 * Maps a free-text category string to the controlled taxonomy.
 *
 * Performs a priority-ordered keyword search: the input is lowercased and
 * tested against each keyword in the map sequentially. The first keyword
 * found within the string determines the category (first match wins).
 * Falls back to the raw value if it exactly matches a canonical category,
 * or to 'General' if no match is found.
 */
export function normaliseCategory(raw: string): DevelopmentCategory {
  const lower = raw.toLowerCase().trim();

  const map: Record<string, DevelopmentCategory> = {
    // --- Investment Treaty (absorbs old "Treaty Arbitration" and "ISDS Reform") ---
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

    // --- Enforcement ---
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

    // --- Jurisprudence ---
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

    // --- Technology & AI ---
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

    // --- Arbitrator Conduct & Ethics ---
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

    // --- Climate, Energy & ESG ---
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

    // --- Procedure & Evidence ---
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

    // --- Damages & Funding ---
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

    // --- Institutional Rules ---
    'institutional': 'Institutional Rules',
    'rules': 'Institutional Rules',

    // --- Legislation ---
    'legislation': 'Legislation',

    // --- Backwards compatibility for old category names ---
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
