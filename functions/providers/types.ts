/**
 * types.ts — AIProvider interface
 *
 * One internal interface that each provider adapter implements. Methods map
 * 1:1 onto the existing Gemini work in index.ts (see §3.1 of the
 * provider-neutrality design plan). Only Gemini exists at this stage; the
 * interface is the seam, not a runtime switch.
 */

import { HttpsError } from 'firebase-functions/v2/https';
import { type DevelopmentItem } from '../../src/prompts/shared';

/**
 * A message turn as passed to streamChat.
 *
 * Matches the shape the streamChatCompletion callable receives from the
 * client; the adapter is responsible for mapping to its SDK's native
 * message format.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Core provider interface. Each method corresponds to one existing
 * Gemini free function in index.ts:
 *
 *   streamChat       ← generateContentStream loop in streamChatCompletion
 *   generateText     ← generateContent call in generateTextCompletion
 *   groundedSearch   ← generateGroundedDigestText (Call 1 of the digest pipeline)
 *   extractJson      ← extractDevelopmentsFromText (Call 2 of the digest pipeline)
 *   classifyError    ← toCallableError
 *   isProviderUnavailable ← isRetryableGeminiError (gate for retry/failover)
 *
 * The two-call pipeline (groundedSearch → extractJson) is composed at the
 * registry layer in generateDevelopments(); neither method calls the other.
 */
export interface AIProvider {
  /** Short stable identifier, e.g. 'gemini'. */
  readonly id: 'gemini' | 'openai-compat';

  /**
   * Streams a chat completion and returns the full accumulated text.
   *
   * @param messages       Ordered conversation turns.
   * @param systemInstruction  Top-level system prompt.
   * @param signal         Optional AbortSignal from the callable response.
   * @param onChunk        Called for each text chunk as it arrives.
   */
  streamChat(
    messages: ChatMessage[],
    systemInstruction: string,
    signal: AbortSignal | undefined,
    onChunk: (chunk: string) => Promise<void>,
  ): Promise<string>;

  /**
   * Generates a non-streaming text completion.
   *
   * @param prompt  The full prompt string.
   * @param tier    'pro' for the more capable model, 'flash' for the
   *                faster structured-output model.
   */
  generateText(prompt: string, tier: 'pro' | 'flash'): Promise<string>;

  /**
   * Call 1 of the digest pipeline. Issues a grounded search prompt and
   * returns the free-text response (which may contain citation artefacts).
   * Must use the provider's native web-search grounding — never a
   * standalone search-API call.
   */
  groundedSearch(prompt: string): Promise<string>;

  /**
   * Call 2 of the digest pipeline. Converts grounded prose into typed
   * development items. Must NOT use any search tool (googleSearch +
   * responseMimeType: 'application/json' is a rejected combination in
   * Gemini; the two-call split exists precisely to avoid it).
   */
  extractJson(groundedText: string): Promise<DevelopmentItem[]>;

  /**
   * Maps a raw provider error to an HttpsError whose code and message
   * preserve the tokens that the client's mapAIErrorToUserMessage keys on:
   * PERMISSION_DENIED / INVALID_ARGUMENT / RESOURCE_EXHAUSTED / UNAVAILABLE.
   */
  classifyError(err: unknown): HttpsError;

  /**
   * Returns true if the error is a transient unavailability signal (429,
   * 503, network failure) worth retrying or failing over to another
   * provider. Returns false for authentication and argument faults
   * (400/401/403) — those propagate unchanged.
   */
  isProviderUnavailable(err: unknown): boolean;
}
