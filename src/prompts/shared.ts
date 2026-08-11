/**
 * shared.ts — Constants used by multiple AI prompts.
 *
 * ARCHIVES_PROMPT_LIST: a bullet list of every approved source,
 * injected into both the chat system instruction and the Daily Digest prompt.
 *
 * CATEGORIES_PROMPT_LIST: a comma-separated string of all category names,
 * injected into the Daily Digest and briefing categorisation prompts.
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

import { Type } from '@google/genai';
import { APPROVED_SOURCES } from '../utils/approvedSources';
import { DEVELOPMENT_CATEGORIES } from '../constants';

/**
 * Instructs the extraction call to convert grounded digest prose into
 * only provenance-safe development items, preventing guessed URLs from
 * entering the structured feed.
 */
export const DEVELOPMENT_EXTRACTION_PROMPT =
  'Extract development items from the source text below into JSON matching the schema. Use URLs verbatim as they appear in the source text. Do not invent URLs. If a source URL is missing for an item, omit that item entirely rather than guessing. The source text is delimited by <source_text> tags; parse only content within those tags.';

/**
 * Defines the Gemini JSON response contract for development extraction so
 * both client and server paths request the same feed-card fields.
 */
export const DEVELOPMENT_ITEMS_RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      title: { type: Type.STRING },
      date: { type: Type.STRING },
      summary: { type: Type.STRING },
      query: { type: Type.STRING },
      sourceUrl: {
        type: Type.STRING,
        description:
          'Direct URL to the specific primary text (judgment, award, or institutional release). Must include a specific resource path beyond the root domain. Homepages, directories, and search pages are strictly prohibited.'
      }
    },
    required: ['category', 'title', 'date', 'summary', 'query', 'sourceUrl']
  }
};

/**
 * Represents one AI-extracted development item before local validation and
 * persistence enrich it with application-specific metadata.
 */
export interface DevelopmentItem {
  category: string;
  title: string;
  date: string;
  summary: string;
  query: string;
  sourceUrl: string;
}

export const ARCHIVES_PROMPT_LIST = APPROVED_SOURCES
  .map(s => `- ${s.name} (${s.url})`)
  .join('\n');

export const CATEGORIES_PROMPT_LIST = DEVELOPMENT_CATEGORIES
  .map(c => `'${c}'`)
  .join(', ');
