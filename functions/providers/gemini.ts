/**
 * gemini.ts — Gemini adapter (reference implementation)
 *
 * Implements AIProvider using Google's @google/genai SDK. All Gemini-specific
 * code moved verbatim from index.ts:
 *
 *   generateGroundedDigestText (~line 796) → groundedSearch()
 *   extractDevelopmentsFromText (~line 832) → extractJson()
 *   streamChatCompletion streaming loop (~line 1249) → streamChat()
 *   generateTextCompletion body (~line 1293) → generateText()
 *   toCallableError (~line 1188) → classifyError()
 *   isRetryableGeminiError (imported from retry.ts) → isProviderUnavailable()
 *
 * Model names, config objects, withRetry parameters, and abort-signal
 * wiring are byte-identical to the originals. Nothing substantive has
 * changed; this is relocation only.
 */

import { GoogleGenAI } from '@google/genai';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  DEVELOPMENT_EXTRACTION_PROMPT,
  DEVELOPMENT_ITEMS_RESPONSE_SCHEMA,
  type DevelopmentItem,
} from '../../src/prompts/shared';

import { type AIProvider, type ChatMessage } from './types';
import { isRetryableGeminiError, withRetry } from './retry';

// Re-export so index.ts can import both from one place if desired, and so
// the retry module is accessible to tests that import gemini.ts directly.
export { isRetryableGeminiError, withRetry };

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const;

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // --------------------------------------------------------------------------
  // streamChat — backs streamChatCompletion
  //
  // Moved verbatim from the try-block of streamChatCompletion (~line 1249).
  // The callable handler resolves the key and signal; this method receives
  // them as parameters. onChunk replaces the inline response.sendChunk call
  // so the callable can decide when to forward chunks.
  // --------------------------------------------------------------------------

  async streamChat(
    messages: ChatMessage[],
    systemInstruction: string,
    signal: AbortSignal | undefined,
    onChunk: (chunk: string) => Promise<void>,
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : ('user' as const),
      parts: [{ text: m.content }]
    }));
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-pro',
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
        abortSignal: signal
      }
    });
    let fullText = '';
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const text = chunk.text;
      if (text) {
        fullText += text;
        await onChunk(text);
      }
    }
    return fullText;
  }

  // --------------------------------------------------------------------------
  // generateText — backs generateTextCompletion (briefing generation)
  //
  // The modelName mapping (tier → SDK string) is preserved from the original.
  //
  // Retry is deliberately NOT applied here. In Stage B, generateText is reached
  // only through the briefing path's withGenerationFailover wrapper, which owns
  // the single retry-and-failover loop under one hoisted time budget (Stage B
  // spec §4). A second, inner withRetry here would NEST with the wrapper's retry
  // and could push the briefing callable past its function timeout during a
  // sustained provider outage — the budget-stacking the cross-review flagged
  // (invariant 6). The grounded methods below keep their own withRetry because
  // they are not wrapped by the failover loop.
  // --------------------------------------------------------------------------

  async generateText(prompt: string, tier: 'pro' | 'flash'): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const modelName = tier === 'flash' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
    const result = await ai.models.generateContent({ model: modelName, contents: prompt });
    return result.text || '';
  }

  // --------------------------------------------------------------------------
  // groundedSearch — Call 1 of the digest pipeline
  //
  // Moved verbatim from generateGroundedDigestText (~line 796).
  // Uses gemini-2.5-pro with tools:[{googleSearch:{}}] (no responseMimeType).
  // --------------------------------------------------------------------------

  async groundedSearch(prompt: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        }),
      isRetryableGeminiError,
      {
        label: 'grounded-search',
        maxAttempts: 5,
        initialWaitMs: 2000,
        maxBudgetMs: 240000,
      }
    );

    const text = response.text;
    if (text === undefined || text === '') {
      throw new Error('Grounded search returned no text content');
    }

    const chunkCount =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks?.length;
    console.info(
      `[generateGroundedDigestText] success: text length ${text.length}` +
        (chunkCount !== undefined ? `, grounding chunks ${chunkCount}` : '')
    );

    return text;
  }

  // --------------------------------------------------------------------------
  // extractJson — Call 2 of the digest pipeline
  //
  // Moved verbatim from extractDevelopmentsFromText (~line 832).
  // Uses gemini-2.5-flash with responseMimeType + responseSchema, NO tools.
  // The googleSearch + responseMimeType combination is rejected by Gemini;
  // the two-call split exists precisely to keep them apart.
  // --------------------------------------------------------------------------

  async extractJson(groundedText: string): Promise<DevelopmentItem[]> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const combinedPrompt = [
      '<instruction>',
      DEVELOPMENT_EXTRACTION_PROMPT,
      '</instruction>',
      '',
      '<source_text>',
      groundedText,
      '</source_text>',
    ].join('\n');

    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: combinedPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: DEVELOPMENT_ITEMS_RESPONSE_SCHEMA,
          },
        }),
      isRetryableGeminiError,
      {
        label: 'json-extraction',
        maxAttempts: 5,
        initialWaitMs: 2000,
        maxBudgetMs: 240000,
      }
    );

    try {
      return JSON.parse(response.text || '[]') as DevelopmentItem[];
    } catch (error) {
      console.error('Procedural anomaly: failed to parse AI JSON output.', error);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // classifyError — maps raw errors to HttpsError
  //
  // Moved verbatim from toCallableError (~line 1188). Preserves the exact
  // token set (PERMISSION_DENIED / INVALID_ARGUMENT / RESOURCE_EXHAUSTED /
  // UNAVAILABLE) that the client's mapAIErrorToUserMessage keys on.
  // --------------------------------------------------------------------------

  classifyError(error: unknown): HttpsError {
    if (error instanceof HttpsError) return error;

    const name = error instanceof Error ? error.name : '';
    const status = (typeof error === 'object' && error !== null)
      ? (error as { status?: unknown }).status
      : undefined;
    const msg = error instanceof Error ? error.message : String(error);

    // Inspect structured fields first (ApiError from @google/genai sets .status)
    if (name === 'ApiError') {
      if (status === 401 || status === 403) {
        return new HttpsError('unauthenticated', 'PERMISSION_DENIED: Invalid or unauthorised API key.');
      }
      if (status === 400 || status === 404) {
        return new HttpsError('invalid-argument', 'INVALID_ARGUMENT: Request could not be processed.');
      }
      if (status === 429) {
        return new HttpsError('resource-exhausted', 'RESOURCE_EXHAUSTED: Quota exceeded.');
      }
      if (status === 503) {
        return new HttpsError('unavailable', 'UNAVAILABLE: AI provider temporarily unavailable.');
      }
    }

    // Fall back to message-text matching
    if (/\bapi key\b/i.test(msg) || msg.includes('PERMISSION_DENIED') || /\b401\b/.test(msg) || /\b403\b/.test(msg)) {
      return new HttpsError('unauthenticated', 'PERMISSION_DENIED: Invalid or unauthorised API key.');
    }
    if (/INVALID_ARGUMENT|\b400\b|\b404\b/.test(msg)) {
      return new HttpsError('invalid-argument', 'INVALID_ARGUMENT: Request could not be processed.');
    }
    if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg) || msg.toLowerCase().includes('quota')) {
      return new HttpsError('resource-exhausted', 'RESOURCE_EXHAUSTED: Quota exceeded.');
    }
    if (/\b503\b|UNAVAILABLE/.test(msg)) {
      return new HttpsError('unavailable', 'UNAVAILABLE: AI provider temporarily unavailable.');
    }

    return new HttpsError('internal', 'AI provider temporarily unavailable.');
  }

  // --------------------------------------------------------------------------
  // isProviderUnavailable — gate equivalent to isRetryableGeminiError
  //
  // Delegates to the shared isRetryableGeminiError from retry.ts.
  // Behaviour is byte-identical; the AIProvider interface requires a method,
  // so this thin wrapper satisfies it without duplicating logic.
  // --------------------------------------------------------------------------

  isProviderUnavailable(err: unknown): boolean {
    return isRetryableGeminiError(err);
  }
}
