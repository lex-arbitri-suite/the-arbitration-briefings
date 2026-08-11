/**
 * briefingGeneration.ts — Prompts for the Generate Briefing workflow.
 *
 * Three prompts:
 *   1. getConsolidationPrompt — synthesises chat sessions into a legal report
 *   2. getTitlePrompt — generates a concise title (max 10 words)
 *   3. getCategoryPrompt — classifies into one development category
 *
 * Used by handleGenerateBriefing() in App.tsx, which is called from both
 * the nav bar "Generate Briefing" button (single chat) and the home page
 * "Compile Consolidated Briefing" button (multiple chats).
 */

import { CATEGORIES_PROMPT_LIST } from './shared';

/**
 * Builds the consolidation prompt that turns selected chat transcripts into
 * an authored legal report rather than a stitched transcript.
 * @param context Source chat content and metadata to be synthesised.
 * @returns Markdown-oriented prompt text for the consolidation model call.
 */
export function getConsolidationPrompt(context: string): string {
  return `
You are a Senior Arbitral Research Lead at a leading international law firm. Your task is to synthesise the provided research chat sessions into a single, formal, thematically structured legal report.

# CONSOLIDATION RULES
1. Strip all conversational scaffolding (e.g., 'Here is the information you requested', 'I hope this helps', 'Let me know if you need anything else'). The output must read as an authored report, not a transcript.
2. Where multiple chat sessions cover overlapping topics, consolidate the analysis — do not repeat the same point from different sessions. Resolve any contradictions between sessions by preferring the more recent or more authoritative source.
3. Preserve all case citations, statutory references, and source URLs from the original chats. Do not invent new citations or URLs that were not present in the source material.
4. If a source URL appeared in the original chat, reproduce it exactly. Do not modify, shorten, or reconstruct URLs.

# LINGUISTIC AND STYLISTIC CONSTRAINTS
1. Write EXCLUSIVELY in formal British English.
2. Apply British spelling conventions (e.g., synthesise, rigour, judgement [non-legal] / judgment [court decisions]).
3. Apply British punctuation conventions: single quotation marks for initial quotations; double quotation marks only for quotations within quotations. Punctuation placed outside quotation marks unless it forms part of the original quotation.
4. Adopt an authoritative, restrained, and highly professional tone — the quiet confidence of a well-bound legal volume.
5. Avoid conversational filler, promotional language, and speculative phrasing.

# REPORT STRUCTURE
Output the report in Markdown format. Do not include a main title (e.g., '# Research Briefing') at the very top — the application UI provides the title. Start directly with the first section.

Structure the report as follows:
1. **Executive Summary** — a concise synthesis of the key findings across all source sessions (3–5 sentences).
2. **Thematic sections** — organise the substantive analysis under clear headings. Group related findings thematically rather than by source session. Use sub-headings where a section covers multiple distinct points.
3. **Sources Consulted** — a compulsory final section listing every open-access source referenced in the report, formatted as a clean bulleted list using the '-' character. Where a verified URL exists, format as a clickable Markdown link: [Source Name](URL). Where no specific URL is available, list the source as plain text.

${context}
`;
}

/**
 * Builds a title-generation prompt so saved briefings receive concise,
 * formal labels consistent with the suite's legal style.
 * @param contentSlice Leading portion of the generated report.
 * @returns Prompt text requesting a maximum-ten-word title.
 */
export function getTitlePrompt(contentSlice: string): string {
  return `Based on the following legal report, generate a concise, formal title in British English (maximum 10 words). Do not use quotes, prefixes like 'Title:', or American spellings.\n\n${contentSlice}`;
}

/**
 * Builds a category-selection prompt so generated briefings align with the
 * controlled development taxonomy used across archive views.
 * @param contentSlice Leading portion of the generated report.
 * @returns Prompt text requesting exactly one canonical category tag.
 */
export function getCategoryPrompt(contentSlice: string): string {
  return `Based on the following legal report, categorise it into exactly ONE of the following tags: ${CATEGORIES_PROMPT_LIST}. Output ONLY the tag name, nothing else.\n\n${contentSlice}`;
}
