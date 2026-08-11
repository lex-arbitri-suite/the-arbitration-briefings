/**
 * aiProvider.ts — Thin Abstraction Layer
 *
 * All AI model calls are routed through this single file.
 * Gemini is invoked server-side via Firebase callable functions; no API key
 * is held in the client bundle.
 */

import { httpsCallable } from 'firebase/functions';
import { FirebaseError } from 'firebase/app';
import { functions } from '../firebase';

import {
  DEVELOPMENT_EXTRACTION_PROMPT,
  DEVELOPMENT_ITEMS_RESPONSE_SCHEMA,
  type DevelopmentItem
} from '../prompts/shared';

export {
  DEVELOPMENT_EXTRACTION_PROMPT,
  DEVELOPMENT_ITEMS_RESPONSE_SCHEMA,
  type DevelopmentItem
};

const STATUS_FOUR_WORD = /\b(400|401|403|404|429)\b/;
const WORD_503 = /\b503\b/;

/** Harmonised AI error copy for permission/auth failures */
const USER_AI_API_KEY =
  'AI features are available to the workspace owner. Please sign in to continue.';

/** Harmonised AI exhaustion / outage copy */
const USER_AI_PROVIDER_UNAVAILABLE =
  'AI provider temporarily unavailable. Please try again later.';

/** User-facing copy for request-shape failures */
const USER_AI_REQUEST_REJECTED =
  'This request could not be processed. Please try rephrasing or starting a new chat.';

export type AIProviderCallOptions = {
  signal?: AbortSignal;
};

export type RetryableGenerationOptions = AIProviderCallOptions & {
  onRetry?: (nextAttempt: number) => void;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function backoffSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finalize = (
      outcome: 'resolve' | 'reject',
      value?: unknown
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (outcome === 'resolve') resolve();
      else reject(value);
    };

    const onAbort = () => {
      finalize('reject', signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => finalize('resolve'), ms);
  });
}

function coerceErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return '';
  }
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

function isRetryableGeminiError(error: unknown): boolean {
  if (errorName(error) === 'AbortError') return false;

  // FirebaseError from callable: only unavailable is retryable
  if (error instanceof FirebaseError) {
    return error.code === 'functions/unavailable';
  }

  const msg = coerceErrorMessage(error);

  if (STATUS_FOUR_WORD.test(msg)) return false;

  const lower = msg.toLowerCase();
  if (
    /\bapi key\b/i.test(msg)
    || msg.includes('PERMISSION_DENIED')
    || msg.includes('INVALID_ARGUMENT')
    || msg.includes('RESOURCE_EXHAUSTED')
    || lower.includes('quota')
  ) {
    return false;
  }

  if (WORD_503.test(msg) || msg.includes('UNAVAILABLE')) return true;
  if (
    msg.includes('Failed to fetch')
    || msg.includes('NetworkError')
    || msg.includes('Load failed')
  ) {
    return true;
  }
  if (error instanceof TypeError) {
    return /Failed to fetch|NetworkError|Load failed|fetch/i.test(msg);
  }

  return false;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options?: { signal?: AbortSignal; onRetry?: (nextAttempt: number) => void; label?: string }
): Promise<T> {
  const delays = [2000, 4000];
  let lastCaught: unknown;
  const label = options?.label ?? 'unknown';

  for (let attempt = 1; attempt <= 3; attempt++) {
    throwIfAborted(options?.signal);
    try {
      return await operation();
    } catch (err) {
      lastCaught = err;
      if (!isRetryableGeminiError(err) || attempt === 3) {
        throw err;
      }
      throwIfAborted(options?.signal);
      const reason = coerceErrorMessage(err);
      console.warn(`[retry][${label}] attempt ${attempt} of 3 after ${reason}`);
      options?.onRetry?.(attempt + 1);
      await backoffSleep(delays[attempt - 1], options?.signal);
    }
  }
  throw lastCaught;
}

// ---------------------------------------------------------------------------
// Shared client-side mapping for AI callable failures
// ---------------------------------------------------------------------------

export function mapAIErrorToUserMessage(error: unknown): string {
  if (errorName(error) === 'AbortError') {
    return '';
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '';
  }

  // FirebaseError from callable: read .code first for reliable mapping
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'functions/unauthenticated':
      case 'functions/permission-denied':
        return USER_AI_API_KEY;
      case 'functions/invalid-argument':
        return USER_AI_REQUEST_REJECTED;
      case 'functions/resource-exhausted':
        return USER_AI_PROVIDER_UNAVAILABLE;
      case 'functions/unavailable':
      case 'functions/internal':
      case 'functions/deadline-exceeded':
        return USER_AI_PROVIDER_UNAVAILABLE;
      default:
        return USER_AI_PROVIDER_UNAVAILABLE;
    }
  }

  // Legacy text-matching fallback (network errors before the callable layer)
  const msg = coerceErrorMessage(error);
  const lower = msg.toLowerCase();

  if (
    /\bapi key\b/i.test(msg)
    || msg.includes('PERMISSION_DENIED')
    || /\b401\b/.test(msg)
    || /\b403\b/.test(msg)
  ) {
    return USER_AI_API_KEY;
  }

  if (/INVALID_ARGUMENT\b/.test(msg) || /\b400\b/.test(msg) || /\b404\b/.test(msg)) {
    return USER_AI_REQUEST_REJECTED;
  }

  if (
    /\b429\b/.test(msg)
    || msg.includes('RESOURCE_EXHAUSTED')
    || lower.includes('quota')
  ) {
    return USER_AI_PROVIDER_UNAVAILABLE;
  }

  if (isRetryableGeminiError(error)) {
    return USER_AI_PROVIDER_UNAVAILABLE;
  }

  return USER_AI_PROVIDER_UNAVAILABLE;
}

// ---------------------------------------------------------------------------
// 1. streamChat — streaming conversational response (used by chat interrogation)
//    Returns an async iterable that yields text chunks.
// ---------------------------------------------------------------------------
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function* streamChatUnderlying(
  messages: ChatMessage[],
  systemInstruction: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  throwIfAborted(signal);
  const callable = httpsCallable<
    { messages: ChatMessage[]; systemInstruction: string },
    string
  >(functions, 'streamChatCompletion');
  const { stream } = await callable.stream({ messages, systemInstruction }, signal ? { signal } : undefined);
  for await (const chunk of stream) {
    throwIfAborted(signal);
    const text = typeof chunk === 'string' ? chunk : '';
    if (text) yield text;
  }
}

export async function* streamChat(
  messages: ChatMessage[],
  systemInstruction: string,
  options?: RetryableGenerationOptions
): AsyncGenerator<string> {
  const signal = options?.signal;
  throwIfAborted(signal);

  const { iterator: firstIterationIterator, first } = await withRetry(
    async () => {
      const gen = streamChatUnderlying(messages, systemInstruction, signal);
      const iterator = gen[Symbol.asyncIterator]() as AsyncIterator<string>;
      const firstStep = await iterator.next();
      return { iterator, first: firstStep };
    },
    { signal, onRetry: options?.onRetry, label: 'streamChat' }
  );

  try {
    if (!first.done) {
      yield first.value;
      for (;;) {
        const step = await firstIterationIterator.next();
        if (step.done) break;
        yield step.value;
      }
    }
  } finally {
    const maybeReturn = (
      firstIterationIterator as AsyncIterator<string> & { return?: () => Promise<unknown> }
    ).return;
    if (typeof maybeReturn === 'function') {
      try {
        await maybeReturn.call(firstIterationIterator);
      } catch {
        /* best-effort generator close */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. generateText — simple prompt in, text out
//    Used for briefing consolidation, title generation, category generation.
//    Retried server-side; no client retry to avoid double-retry.
// ---------------------------------------------------------------------------
export async function generateText(
  prompt: string,
  options?: { model?: 'pro' | 'flash' } & AIProviderCallOptions & {
      onRetry?: (nextAttempt: number) => void;
    }
): Promise<string> {
  throwIfAborted(options?.signal);
  const callable = httpsCallable<
    { prompt: string; model?: 'pro' | 'flash' },
    { text: string }
  >(functions, 'generateTextCompletion');
  const result = await callable({ prompt, model: options?.model });
  return result.data.text;
}

// ---------------------------------------------------------------------------
// 3. generateJSON — prompt in, parsed JSON out
//    Used by useRelatedDevelopments for related-authorities lookup.
//    The two-call grounded pipeline runs server-side in generateRelatedDevelopments.
// ---------------------------------------------------------------------------
export async function generateJSON(
  prompt: string,
  options?: RetryableGenerationOptions
): Promise<DevelopmentItem[]> {
  throwIfAborted(options?.signal);
  const callable = httpsCallable<{ prompt: string }, DevelopmentItem[]>(
    functions, 'generateRelatedDevelopments'
  );
  const result = await callable({ prompt });
  return result.data;
}

// ---------------------------------------------------------------------------
// 4. isApiKeyConfigured — returns true; the key is now server-side only
// ---------------------------------------------------------------------------
export function isApiKeyConfigured(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// 5. getAIConfig — runtime AI configuration for Methodology disclosure
//    Returns the sanitised runtime config from the server. No secrets are
//    returned; the callable is public (no owner auth required).
// ---------------------------------------------------------------------------

export interface AIConfigResponse {
  generationProviderId: string;
  generationModelPro: string;
  generationModelFlash: string;
  groundedProviderId: 'gemini';
  chatProviderId: 'gemini';
  fallbackProviderIds: string[];
  failoverEnabled: boolean;
  generationIsGemini: boolean;
  generationProviderConfigured: boolean;
}

export async function getAIConfig(): Promise<AIConfigResponse> {
  const callable = httpsCallable<void, AIConfigResponse>(functions, 'getAIConfig');
  const result = await callable();
  return result.data;
}
