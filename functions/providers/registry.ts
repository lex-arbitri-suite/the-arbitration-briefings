/**
 * registry.ts — Route-aware provider selector and digest-pipeline orchestration
 *
 * Exposes three route-aware helpers and the digest-pipeline orchestrator:
 *
 *   getGroundedProvider(geminiApiKey)   — returns Gemini, always. Used by the
 *                                         Daily Digest sweep, related-developments,
 *                                         and research chat. Grounded/citation-critical
 *                                         paths cannot reach the generation selector.
 *
 *   getGenerationProvider(geminiApiKey) — resolves AI_PROVIDER; constructs the
 *                                         selected adapter; applies the misconfiguration
 *                                         policy (§4 of the Stage B spec). Used by
 *                                         briefing generation only.
 *
 *   withGenerationFailover(...)         — outer failover loop for briefing generation.
 *                                         Applies a single hoisted time budget across
 *                                         the whole provider chain so a multi-provider
 *                                         storm cannot exceed the callable timeout.
 *
 *   generateDevelopments(provider, prompt) — permanent two-call pipeline
 *                                            (groundedSearch → extractJson). Receives
 *                                            the grounded (Gemini) provider from the
 *                                            call site; unchanged from Stage A.
 *
 * Routing invariants enforced in code (and verified in tests):
 *   1. Digest, related-developments, and research chat always use getGroundedProvider;
 *      they never call getGenerationProvider.
 *   2. No failover is applied to grounded sweeps or research chat.
 *   3. OpenAICompatProvider.groundedSearch is unreachable on any live path (it throws).
 *   4. Auth/argument faults (400/401/403) never trigger failover.
 *   5. A selected provider missing required config fails per the misconfiguration policy;
 *      misconfigured fallback entries are excluded with an explicit log.
 *   6. One total time budget spans the whole failover chain, not per-provider budgets.
 *
 * Provider selection uses Firebase defineString/defineSecret params read at invocation
 * time via .value() — the same pattern as OWNER_UID. Switching provider is a pure param
 * change; no code redeploy required.
 */

import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import { type DevelopmentItem } from '../../src/prompts/shared';
import { type AIProvider } from './types';
import { GeminiProvider } from './gemini';
import { OpenAICompatProvider } from './openaiCompat';
import { withRetry } from './retry';

// ============================================================================
// Firebase params — non-secret runtime configuration
// ============================================================================

/** Runtime provider selector for briefing generation. Default: 'gemini'. */
export const AI_PROVIDER = defineString('AI_PROVIDER', { default: 'gemini' });

/**
 * Comma-separated list of fallback provider ids for briefing generation
 * (e.g. 'gemini,openai-compat'). Empty by default → no failover, behaviour
 * identical to Stage A.
 */
export const AI_PROVIDER_FALLBACKS = defineString('AI_PROVIDER_FALLBACKS', { default: '' });

/**
 * When true, a misconfigured selected provider falls back to Gemini with a
 * console.warn rather than throwing a hard config error. Intended for local
 * dev/experiment environments; must remain false in production.
 */
export const ALLOW_PROVIDER_CONFIG_FALLBACK = defineString(
  'ALLOW_PROVIDER_CONFIG_FALLBACK',
  { default: 'false' }
);

/** Base URL for the OpenAI-compatible endpoint (non-secret; the key is secret). */
export const OPENAI_COMPAT_BASE_URL = defineString('OPENAI_COMPAT_BASE_URL', { default: '' });

/** Pro-tier model name for the OpenAI-compatible endpoint. */
export const OPENAI_COMPAT_MODEL_PRO = defineString('OPENAI_COMPAT_MODEL_PRO', { default: '' });

/** Flash-tier model name for the OpenAI-compatible endpoint. */
export const OPENAI_COMPAT_MODEL_FLASH = defineString('OPENAI_COMPAT_MODEL_FLASH', { default: '' });

/** API key for the OpenAI-compatible endpoint (secret). */
export const openaiCompatApiKey = defineSecret('OPENAI_COMPAT_API_KEY');

// ============================================================================
// Route-aware provider helpers
// ============================================================================

/**
 * Returns a Gemini provider, always, regardless of AI_PROVIDER or
 * AI_PROVIDER_FALLBACKS. Used by all grounded/citation-critical paths:
 * the Daily Digest sweep, related-developments sweep, and research chat.
 *
 * The function exists so the invariant is enforced in code, not by convention.
 * Grounded sweeps must never silently acquire a different provider.
 */
export function getGroundedProvider(geminiApiKey: string): AIProvider {
  return new GeminiProvider(geminiApiKey);
}

/**
 * Resolves the configured AIProvider for briefing generation (AI_PROVIDER).
 * Applies the misconfiguration policy:
 *
 *   - Selected provider 'openai-compat' with missing key/base-URL/model:
 *     • ALLOW_PROVIDER_CONFIG_FALLBACK false (default, production): throw a
 *       clear config error.
 *     • ALLOW_PROVIDER_CONFIG_FALLBACK true (dev opt-in): warn and fall back
 *       to Gemini.
 *
 * Returns the constructed provider and its id. The id is used by
 * withGenerationFailover to track provider transitions in logs.
 */
export function getGenerationProvider(
  geminiApiKey: string
): { provider: AIProvider; providerId: string } {
  const selected = AI_PROVIDER.value().trim().toLowerCase() || 'gemini';
  const fallbackAllowed =
    ALLOW_PROVIDER_CONFIG_FALLBACK.value().trim().toLowerCase() === 'true';

  if (selected === 'openai-compat') {
    const baseUrl = OPENAI_COMPAT_BASE_URL.value().trim();
    const apiKey = openaiCompatApiKey.value().trim();
    const modelPro = OPENAI_COMPAT_MODEL_PRO.value().trim();
    const modelFlash = OPENAI_COMPAT_MODEL_FLASH.value().trim();

    if (!baseUrl || !apiKey || !modelPro || !modelFlash) {
      if (fallbackAllowed) {
        console.warn(
          '[registry] Selected provider openai-compat is misconfigured ' +
          '(missing base-URL, key, or model names). ' +
          'ALLOW_PROVIDER_CONFIG_FALLBACK is set; falling back to Gemini.'
        );
        return { provider: new GeminiProvider(geminiApiKey), providerId: 'gemini' };
      }
      // Production default: fail loudly so the misconfiguration is visible.
      throw new HttpsError(
        'internal',
        'AI provider misconfiguration: openai-compat selected but ' +
        'OPENAI_COMPAT_BASE_URL, OPENAI_COMPAT_API_KEY, ' +
        'OPENAI_COMPAT_MODEL_PRO, and/or OPENAI_COMPAT_MODEL_FLASH are not set.'
      );
    }

    return {
      provider: new OpenAICompatProvider({ baseUrl, apiKey, modelPro, modelFlash }),
      providerId: 'openai-compat',
    };
  }

  if (selected !== 'gemini') {
    // Unknown value: log and fall back to Gemini — same policy as Stage A.
    console.warn(
      `[registry] Unknown AI_PROVIDER value '${selected}'; falling back to gemini.`
    );
  }

  return { provider: new GeminiProvider(geminiApiKey), providerId: 'gemini' };
}

// ============================================================================
// Failover — briefing generation only
// ============================================================================

/**
 * Builds the ordered list of fallback providers from AI_PROVIDER_FALLBACKS.
 * Each entry is validated; misconfigured entries are excluded with a log.
 * The primary provider id is excluded from the fallback list (no self-loop).
 */
function buildFallbackChain(
  primaryId: string,
  geminiApiKey: string
): Array<{ provider: AIProvider; providerId: string }> {
  const raw = AI_PROVIDER_FALLBACKS.value().trim();
  if (!raw) return [];

  const ids = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const chain: Array<{ provider: AIProvider; providerId: string }> = [];

  for (const id of ids) {
    if (id === primaryId) continue; // skip self

    if (id === 'gemini') {
      chain.push({ provider: new GeminiProvider(geminiApiKey), providerId: 'gemini' });
      continue;
    }

    if (id === 'openai-compat') {
      const baseUrl = OPENAI_COMPAT_BASE_URL.value().trim();
      const apiKey = openaiCompatApiKey.value().trim();
      const modelPro = OPENAI_COMPAT_MODEL_PRO.value().trim();
      const modelFlash = OPENAI_COMPAT_MODEL_FLASH.value().trim();

      if (!baseUrl || !apiKey || !modelPro || !modelFlash) {
        console.warn(
          '[registry] Fallback provider openai-compat is misconfigured ' +
          '(missing base-URL, key, or model names); excluded from failover chain.'
        );
        continue;
      }

      chain.push({
        provider: new OpenAICompatProvider({ baseUrl, apiKey, modelPro, modelFlash }),
        providerId: 'openai-compat',
      });
      continue;
    }

    // Unknown fallback id — exclude with log.
    console.warn(
      `[registry] Unknown fallback provider id '${id}'; excluded from failover chain.`
    );
  }

  return chain;
}

/**
 * Failover loop for briefing generation only.
 *
 * Tries the operation with the primary provider (which already incorporates
 * withRetry). If the primary is unavailable (isProviderUnavailable = true)
 * after retry exhaustion, advances to the next provider in the fallback chain.
 *
 * One hoisted maxBudgetMs spans the whole chain — providers do not get
 * independent budgets that stack. Auth/argument faults (400/401/403) never
 * trigger failover; they propagate unchanged.
 *
 * @param operation       A function that takes a provider and calls generateText.
 * @param primaryId       Id of the primary provider (for fallback-chain exclusion
 *                        and logging).
 * @param primary         The primary provider instance (already constructed).
 * @param geminiApiKey    Passed through to construct fallback Gemini instances.
 * @param maxBudgetMs     Total time budget across the whole failover chain.
 */
export async function withGenerationFailover<T>(
  operation: (provider: AIProvider) => Promise<T>,
  primaryId: string,
  primary: AIProvider,
  geminiApiKey: string,
  maxBudgetMs: number
): Promise<T> {
  const chainStart = Date.now();

  // Build the full chain: primary first, then eligible fallbacks.
  const fallbacks = buildFallbackChain(primaryId, geminiApiKey);
  const chain: Array<{ provider: AIProvider; providerId: string }> = [
    { provider: primary, providerId: primaryId },
    ...fallbacks,
  ];

  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const { provider, providerId } = chain[i];
    const isLast = i === chain.length - 1;

    // Enforce the global budget before attempting this provider.
    const elapsed = Date.now() - chainStart;
    if (elapsed >= maxBudgetMs) {
      console.warn(
        `[registry][failover] Global budget (${maxBudgetMs}ms) exhausted before ` +
        `attempting provider '${providerId}'. Aborting.`
      );
      break;
    }

    try {
      const result = await withRetry(
        () => operation(provider),
        (err) => provider.isProviderUnavailable(err),
        {
          label: `generation[${providerId}]`,
          maxAttempts: 3,
          initialWaitMs: 2000,
          // Remaining budget for this provider's retry loop.
          maxBudgetMs: maxBudgetMs - elapsed,
        }
      );
      if (i > 0) {
        console.info(
          `[registry][failover] Succeeded on fallback provider '${providerId}' ` +
          `after primary '${chain[0].providerId}' was unavailable.`
        );
      }
      return result;
    } catch (err) {
      lastError = err;

      // Auth/argument faults never fail over — propagate immediately.
      if (!provider.isProviderUnavailable(err)) {
        throw err;
      }

      if (!isLast) {
        console.warn(
          `[registry][failover] Provider '${providerId}' unavailable; ` +
          `advancing to fallback '${chain[i + 1].providerId}'.`
        );
      }
    }
  }

  // All providers exhausted or budget expired.
  throw lastError ?? new HttpsError('unavailable', 'UNAVAILABLE: All configured AI providers are unavailable.');
}

// ============================================================================
// Digest-pipeline orchestrator — unchanged from Stage A
// ============================================================================

/**
 * Two-call digest pipeline orchestrator.
 *
 * Permanently enforces the split between Call 1 (grounded free-text with
 * googleSearch, no JSON contract) and Call 2 (JSON extraction with no
 * search tools). This constraint is architectural, not a Gemini quirk:
 * googleSearch + responseMimeType: 'application/json' is a rejected
 * combination, and separating the calls also gives cleaner separation of
 * concerns for non-Gemini providers.
 *
 * Receives the grounded (Gemini) provider from the call site. Replaces
 * generateJSON() in index.ts — same inputs, same output type.
 */
export async function generateDevelopments(
  provider: AIProvider,
  prompt: string,
): Promise<DevelopmentItem[]> {
  const groundedText = await provider.groundedSearch(prompt);
  return provider.extractJson(groundedText);
}
