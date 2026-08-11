/**
 * retry.ts — Generic retry helper
 *
 * Moved verbatim from index.ts (isRetryableGeminiError ~line 737,
 * withRetry ~line 751). Both functions are provider-agnostic; placing
 * them here avoids circular imports between gemini.ts and index.ts.
 *
 * The word "Gemini" appears only in isRetryableGeminiError because
 * the error-message patterns it inspects are Gemini SDK–specific.
 * Later providers supply their own isProviderUnavailable predicate
 * (AIProvider interface) and pass it into withRetry; this file remains
 * stable.
 */

/**
 * Returns true if the error is a Gemini transient unavailability signal
 * worth retrying. Matches both the canonical gRPC status and the HTTP
 * code embedded in the SDK's ApiError.message JSON string.
 */
export function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('"status":"UNAVAILABLE"') || msg.includes('"code":503');
}

/**
 * Generic retry wrapper. Invokes `operation`; on a retryable error
 * (per `shouldRetry`), waits with exponential backoff and tries again,
 * up to `maxAttempts` total. On exhaustion, budget exhaustion, or a
 * non-retryable error, the original error is rethrown.
 *
 * `label` is a short identifier used in the per-attempt log line.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  opts: {
    maxAttempts: number;
    initialWaitMs: number;
    maxBudgetMs: number;
    label: string;
  }
): Promise<T> {
  const startTime = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err) || attempt === opts.maxAttempts) {
        throw err;
      }
      const waitMs = opts.initialWaitMs * 2 ** (attempt - 1);
      // Guard against retry-induced function timeout. The function itself
      // has a 300s hard timeout (set on the trigger). Each Gemini call
      // can take 10-90s. Without this check, a worst-case retry sequence
      // could time out mid-attempt, leaving the request document stuck
      // at status: 'running' with no clean failed-status write. Capping
      // the retry budget at 240s leaves ~60s for the post-call work
      // (Firestore writes, status update) on the current attempt's path.
      if (Date.now() - startTime + waitMs > opts.maxBudgetMs) {
        console.warn(
          `[retry][${opts.label}] budget exhausted; aborting before attempt ${attempt + 1}`
        );
        throw err;
      }
      console.warn(
        `[retry][${opts.label}] attempt ${attempt} of ${opts.maxAttempts} ` +
          `after 503 UNAVAILABLE; retrying in ${waitMs}ms`
      );
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  // Unreachable: the loop either returns or throws. Present for type narrowing.
  throw lastError;
}
