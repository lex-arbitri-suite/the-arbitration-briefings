/**
 * urlValidator.ts — URL Hardening Layer (client render path)
 *
 * Validates sourceUrl fields in AI-generated development items before they
 * reach the UI. Catches hallucinated, malformed, or off-list URLs and demotes
 * them to plain text rather than rendering broken links.
 *
 * Current consumers, all first-party and all on the render path:
 *   - src/components/HomeView.tsx    — link vs. plain-text source line
 *   - src/components/ChatView.tsx    — link vs. plain-text source line
 *   - src/utils/printDailyDigest.ts  — link vs. plain text in the print copy
 *
 * This module stays: it is the client-side half of the URL gate. (An earlier
 * note here said no first-party path invoked it — true of the write path
 * only, and overtaken when the three consumers above landed.)
 *
 * A second copy of the same five checks lives in functions/index.ts and runs
 * before Firestore writes; Cloud Functions cannot import from src/, so the
 * duplication is deliberate. The two must move together — the server copy
 * decides what is stored, this one decides what is shown, and a client
 * stricter than the server silently hides links that were stored as good.
 *
 * The domain allowlist derives entirely from the consolidated
 * APPROVED_SOURCES registry in approvedSources.ts. Domains are extracted
 * and cached at module initialisation for uniform matching.
 */

import { APPROVED_SOURCES } from './approvedSources';

// ---------------------------------------------------------------------------
// Build the domain allowlist (cached at module level)
// ---------------------------------------------------------------------------
// Extracts domains from APPROVED_SOURCES at import time and strips 'www.'
// prefixes for uniform matching.
// ---------------------------------------------------------------------------
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const ALLOWED_DOMAINS: Set<string> = (() => {
  const domains = new Set<string>();

  for (const source of APPROVED_SOURCES) {
    const domain = extractDomain(source.url);
    if (domain) domains.add(domain);
  }

  return domains;
})();

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates a single sourceUrl against structural rules.
 *
 * Checks performed (in order):
 *  1. Non-empty string
 *  2. Parseable URL format
 *  3. HTTPS protocol (rejects http, ftp, javascript: etc.)
 *  4. Domain is on the approved allowlist
 *  5. Path specificity (rejects bare homepages like "https://italaw.com/")
 *
 * Note: We cannot make an HTTP request to verify the page actually exists
 * (CORS blocks cross-origin fetches in the browser). These structural
 * checks catch the vast majority of hallucinated URLs.
 */
export function validateSourceUrl(url: string): ValidationResult {
  // 1. Empty or missing
  if (!url || url.trim() === '') {
    return { isValid: false, reason: 'Empty URL' };
  }

  // 2. Valid URL format
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { isValid: false, reason: 'Malformed URL' };
  }

  // 3. HTTPS only
  if (parsed.protocol !== 'https:') {
    return { isValid: false, reason: `Insecure protocol: ${parsed.protocol}` };
  }

  // 4. Domain allowlist
  //    We check the hostname and all parent domains so that
  //    "cases.bailii.org" matches the allowlisted "bailii.org".
  const hostname = parsed.hostname.replace(/^www\./, '');
  const parts = hostname.split('.');
  let domainApproved = false;

  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (ALLOWED_DOMAINS.has(candidate)) {
      domainApproved = true;
      break;
    }
  }

  if (!domainApproved) {
    return { isValid: false, reason: `Domain not on approved list: ${hostname}` };
  }

  // 5. Path specificity — reject bare homepages
  //    A URL like "https://www.italaw.com/" has no specific resource.
  //    We require at least one non-empty path segment.
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  if (pathSegments.length === 0) {
    return { isValid: false, reason: 'Generic homepage — no specific resource path' };
  }

  return { isValid: true };
}

