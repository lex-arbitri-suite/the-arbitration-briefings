/**
 * openaiCompat.ts — OpenAI-compatible adapter
 *
 * Implements AIProvider using the official `openai` npm SDK, configured
 * with a custom baseURL so it can target any OpenAI-API-compatible endpoint
 * (e.g. a self-hosted vLLM/Ollama instance or a hosted no-training tier).
 *
 * In v1, the only live path is briefing generation (generateText). All
 * grounded/citation-critical work (groundedSearch, extractJson, streamChat
 * on the research-chat path) remains on Gemini — this adapter never receives
 * those calls through the route-aware registry.
 *
 *   generateText     — the sole live v1 method; used by briefing generation.
 *   streamChat       — implemented for interface completeness; on no live path
 *                      in v1 (research chat is Gemini-pinned).
 *   groundedSearch   — throws a clear not-supported error. Belt-and-braces:
 *                      the registry never routes grounded work here.
 *   extractJson      — implemented via response_format json_object; unused in
 *                      v1 (extraction stays on Gemini) but tested in isolation.
 *   classifyError    — maps the openai SDK error shape to the same canonical
 *                      tokens the client keys on (PERMISSION_DENIED /
 *                      INVALID_ARGUMENT / RESOURCE_EXHAUSTED / UNAVAILABLE).
 *   isProviderUnavailable — true on 429/5xx/network, false on 400/401/403.
 *
 * Logging discipline — never log prompts, messages, keys, base URLs, or full
 * SDK error bodies. Safe structured logs may include provider id, model,
 * route, and whether failover occurred — never content.
 *
 * Live-endpoint verification (streaming delta shape, response_format support,
 * baseURL override) is deferred to a named pre-production gate (spec §6) once
 * Lu selects the target endpoint.
 */

import OpenAI, { APIError } from 'openai';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  DEVELOPMENT_EXTRACTION_PROMPT,
  type DevelopmentItem,
} from '../../src/prompts/shared';

import { type AIProvider, type ChatMessage } from './types';

// ============================================================================
// Constructor config
// ============================================================================

export interface OpenAICompatConfig {
  /** Base URL for the OpenAI-compatible endpoint (e.g. https://api.example.com/v1). */
  baseUrl: string;
  /** API key for the endpoint. Never logged. */
  apiKey: string;
  /** Model name for the pro (capable, slower) tier. */
  modelPro: string;
  /** Model name for the flash (faster, structured) tier. */
  modelFlash: string;
}

// ============================================================================
// Adapter
// ============================================================================

export class OpenAICompatProvider implements AIProvider {
  readonly id = 'openai-compat' as const;

  private readonly client: OpenAI;
  private readonly modelPro: string;
  private readonly modelFlash: string;

  constructor(config: OpenAICompatConfig) {
    // Validate all required fields at construction time — never construct a
    // half-configured adapter that would produce confusing runtime failures.
    if (!config.baseUrl) throw new Error('[openai-compat] baseUrl is required.');
    if (!config.apiKey) throw new Error('[openai-compat] apiKey is required.');
    if (!config.modelPro) throw new Error('[openai-compat] modelPro is required.');
    if (!config.modelFlash) throw new Error('[openai-compat] modelFlash is required.');

    this.modelPro = config.modelPro;
    this.modelFlash = config.modelFlash;

    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  // --------------------------------------------------------------------------
  // generateText — the only live v1 method
  //
  // Non-streaming chat.completions.create on the appropriate model tier.
  // An empty completion (no choices, or an empty message) is mapped to a
  // canonical provider error — it is never silently returned as blank success.
  // --------------------------------------------------------------------------

  async generateText(prompt: string, tier: 'pro' | 'flash'): Promise<string> {
    const model = tier === 'flash' ? this.modelFlash : this.modelPro;

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      // Re-throw; the caller (withGenerationFailover / withRetry) handles
      // retry and failover. Never log the prompt or full error body.
      console.error(
        `[openai-compat] generateText error on model '${model}'.`,
        this.safeErrorSummary(err)
      );
      throw err;
    }

    const text = completion.choices[0]?.message?.content ?? '';

    if (!text) {
      // An empty completion is a provider anomaly, not a blank success.
      const msg =
        `[openai-compat] generateText returned an empty completion ` +
        `(model '${model}', choices: ${completion.choices.length}).`;
      console.error(msg);
      throw new HttpsError('unavailable', 'UNAVAILABLE: AI provider returned an empty response.');
    }

    return text;
  }

  // --------------------------------------------------------------------------
  // streamChat — interface completeness; no live path in v1
  //
  // Streaming chat completion: maps SDK stream deltas to onChunk, honours the
  // AbortSignal, accumulates and returns the full text. Handle tool-call
  // deltas defensively even though no tools are sent.
  //
  // NOTE: streaming-delta verification against the actual target endpoint is
  // deferred to the named live-endpoint pre-production gate (spec §6 Lu decision 3).
  // --------------------------------------------------------------------------

  async streamChat(
    messages: ChatMessage[],
    systemInstruction: string,
    signal: AbortSignal | undefined,
    onChunk: (chunk: string) => Promise<void>,
  ): Promise<string> {
    const sdkMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemInstruction },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const stream = await this.client.chat.completions.create(
      {
        model: this.modelPro,
        messages: sdkMessages,
        stream: true,
      },
      signal ? { signal } : undefined
    );

    let fullText = '';

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      // Delta may carry a text content part or a tool-call part; only forward text.
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) {
        fullText += text;
        await onChunk(text);
      }
    }

    return fullText;
  }

  // --------------------------------------------------------------------------
  // groundedSearch — belt-and-braces not-supported guard
  //
  // This adapter has no native web-search grounding capability. Throwing
  // here ensures that if a future code path accidentally routes a grounded
  // sweep to this adapter, it fails loudly rather than returning ungrounded
  // prose dressed as a grounded search.
  // --------------------------------------------------------------------------

  groundedSearch(_prompt: string): Promise<string> {
    return Promise.reject(
      new HttpsError(
        'unimplemented',
        '[openai-compat] groundedSearch is not supported. ' +
        'Grounded sweeps must use the Gemini provider.'
      )
    );
  }

  // --------------------------------------------------------------------------
  // extractJson — via response_format json_object
  //
  // Unused in v1 (extraction stays on Gemini); implemented for interface
  // completeness and tested in isolation. Fails clearly if the endpoint
  // rejects JSON mode — does not silently degrade to text parsing.
  // --------------------------------------------------------------------------

  async extractJson(groundedText: string): Promise<DevelopmentItem[]> {
    const combinedPrompt = [
      '<instruction>',
      DEVELOPMENT_EXTRACTION_PROMPT,
      '</instruction>',
      '',
      '<source_text>',
      groundedText,
      '</source_text>',
    ].join('\n');

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.modelFlash,
        messages: [{ role: 'user', content: combinedPrompt }],
        response_format: { type: 'json_object' },
      });
    } catch (err) {
      // If the endpoint actively rejects the response_format field, surface
      // it clearly rather than retrying without JSON mode.
      const summary = this.safeErrorSummary(err);
      console.error('[openai-compat] extractJson failed.', summary);
      if (this.isJsonModeRejection(err)) {
        throw new HttpsError(
          'unimplemented',
          '[openai-compat] This endpoint does not support response_format json_object. ' +
          'JSON extraction is not available on this provider.'
        );
      }
      throw err;
    }

    const raw = completion.choices[0]?.message?.content ?? '';

    if (!raw) {
      console.error('[openai-compat] extractJson received an empty completion.');
      return [];
    }

    try {
      return JSON.parse(raw) as DevelopmentItem[];
    } catch (parseErr) {
      console.error('[openai-compat] Procedural anomaly: failed to parse JSON output.', parseErr);
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // classifyError — maps openai SDK error shape to canonical tokens
  //
  // The client's mapAIErrorToUserMessage keys on four token strings:
  //   PERMISSION_DENIED / INVALID_ARGUMENT / RESOURCE_EXHAUSTED / UNAVAILABLE
  //
  // Mirrors GeminiProvider.classifyError so the client contract is identical
  // regardless of which provider is active.
  // --------------------------------------------------------------------------

  classifyError(error: unknown): HttpsError {
    if (error instanceof HttpsError) return error;

    // openai SDK wraps HTTP errors as APIError with a .status number.
    if (error instanceof APIError) {
      const status = error.status;
      if (status === 401 || status === 403) {
        return new HttpsError('unauthenticated', 'PERMISSION_DENIED: Invalid or unauthorised API key.');
      }
      if (status === 400 || status === 404) {
        return new HttpsError('invalid-argument', 'INVALID_ARGUMENT: Request could not be processed.');
      }
      if (status === 429) {
        return new HttpsError('resource-exhausted', 'RESOURCE_EXHAUSTED: Quota exceeded.');
      }
      if (status !== undefined && status >= 500) {
        return new HttpsError('unavailable', 'UNAVAILABLE: AI provider temporarily unavailable.');
      }
    }

    // Network/timeout errors surface as non-APIError instances (TypeError,
    // AbortError, etc.). Fall back to message-text matching.
    const msg = error instanceof Error ? error.message : String(error);

    if (/\bapi key\b/i.test(msg) || msg.includes('PERMISSION_DENIED') || /\b401\b/.test(msg) || /\b403\b/.test(msg)) {
      return new HttpsError('unauthenticated', 'PERMISSION_DENIED: Invalid or unauthorised API key.');
    }
    if (/INVALID_ARGUMENT|\b400\b|\b404\b/.test(msg)) {
      return new HttpsError('invalid-argument', 'INVALID_ARGUMENT: Request could not be processed.');
    }
    if (/\b429\b|RESOURCE_EXHAUSTED/i.test(msg) || msg.toLowerCase().includes('quota')) {
      return new HttpsError('resource-exhausted', 'RESOURCE_EXHAUSTED: Quota exceeded.');
    }
    if (/\b5\d\d\b|UNAVAILABLE/.test(msg)) {
      return new HttpsError('unavailable', 'UNAVAILABLE: AI provider temporarily unavailable.');
    }

    return new HttpsError('internal', 'AI provider temporarily unavailable.');
  }

  // --------------------------------------------------------------------------
  // isProviderUnavailable — transient unavailability gate
  //
  // True on 429 (rate limit), 5xx (server error), or network failure.
  // False on 400/401/403 — those are argument/auth faults that should not
  // be retried and must never trigger failover.
  // --------------------------------------------------------------------------

  isProviderUnavailable(error: unknown): boolean {
    if (error instanceof APIError) {
      const status = error.status;
      if (status === 429) return true;
      if (status !== undefined && status >= 500) return true;
      return false; // includes 400/401/403/404
    }

    // Network/timeout errors not wrapped by APIError.
    if (error instanceof Error) {
      const name = error.name;
      if (name === 'AbortError') return false; // deliberate cancellation
      // Connection reset, ECONNREFUSED, timeout etc.
      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('network') ||
        error.message.includes('Network') ||
        error.message.includes('timeout') ||
        error.message.includes('Failed to fetch')
      ) {
        return true;
      }
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Returns a safe, non-sensitive error summary for structured logging.
   * Never includes the message body, prompt content, API keys, or base URL.
   */
  private safeErrorSummary(err: unknown): object {
    if (err instanceof APIError) {
      return { type: 'APIError', status: err.status, name: err.name };
    }
    if (err instanceof Error) {
      return { type: 'Error', name: err.name };
    }
    return { type: typeof err };
  }

  /**
   * Heuristic: did the endpoint actively reject the response_format field?
   * OpenAI-compatible endpoints that do not support JSON mode typically
   * return a 400 with a message mentioning the field name.
   */
  private isJsonModeRejection(err: unknown): boolean {
    if (err instanceof APIError && err.status === 400) {
      const msg = err.message ?? '';
      return (
        msg.includes('response_format') ||
        msg.includes('json_object') ||
        msg.includes('not supported')
      );
    }
    return false;
  }
}
