/**
 * dailyDigest.ts — The Live Refresh / Daily Digest sweep prompt (Call 1).
 *
 * Tells the AI to sweep approved archives and identify the 12 most significant
 * recent arbitration developments. Output is narrative text grounded in Google
 * Search; Call 2 (DEVELOPMENT_EXTRACTION_PROMPT in shared.ts) extracts the
 * structured JSON from this output.
 *
 * This file remains the canonical client-side source for the prompt text.
 * An equivalent prompt exists in functions/index.ts and serves the actual
 * Daily Digest sweep on the server. The client no longer invokes this
 * prompt during normal operation.
 */

import { ARCHIVES_PROMPT_LIST, CATEGORIES_PROMPT_LIST } from './shared';
import {
  ACCEPTABLE_URL_EXAMPLES,
  NOT_ACCEPTABLE_URL_EXAMPLES,
  CANONICAL_URL_PATTERNS,
  CITE_BY_NAME_ONLY,
} from './urlPatterns';

/**
 * Builds the Daily Digest sweep prompt used to identify high-value,
 * provenance-safe arbitration developments for structured extraction.
 * @returns The complete Call 1 prompt text wrapped in instruction tags.
 */
export function getDailyDigestPrompt(): string {
  return `<instruction>
Per §5.1 (Prompt Delimiter Standard): this tag contains static instructions only.

Adopt the voice of a Senior Partner conducting a forensic arbitration intelligence review.
Tone requirements: minimalist, exacting, and authoritative. Avoid promotional language, conversational filler, and speculative phrasing.
Each output must read as chamber-ready legal intelligence.

Conduct a global sweep of international arbitration developments from 2025 and 2026.
You MUST consult the following non-exhaustive list of arbitration archives, together with other official and authoritative institutional sources where strictly necessary:

${ARCHIVES_PROMPT_LIST}

Select the 12 most significant and authoritative developments.
PRIORITISATION: Prioritise landmark cases, court judgments, and official institutional awards (category: 'Jurisprudence') over secondary commentary, trade press, or general legislative noise.

Return ONLY a JSON array of objects with these exact fields:
- category: string — MUST be exactly one of: ${CATEGORIES_PROMPT_LIST}. Do not invent categories outside this list.
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
${ACCEPTABLE_URL_EXAMPLES}

${NOT_ACCEPTABLE_URL_EXAMPLES}

${CANONICAL_URL_PATTERNS}

${CITE_BY_NAME_ONLY}

DRAFTING STANDARD FOR SUMMARIES:
- sentence 1: identify the tribunal/court, instrument, and procedural context;
- sentence 2: analyse the doctrinal or enforcement significance;
- sentence 3 (optional): state practical implication for counsel, tribunal strategy, or award enforcement.
- Where a case number, party name, named instrument, or treaty reference appears in the title, repeat the most specific identifier in the summary as well, using the exact same formatting and punctuation. This aids downstream research, citation, and traceability.
</instruction>`;
}
