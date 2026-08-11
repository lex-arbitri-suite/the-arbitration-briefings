/**
 * Utility functions for development card display — hashing, title formatting, recency checks, and relative time labels.
 */

/**
 * Converts the supplied `str` to title case (first letter of each word capitalised).
 */
export const toTitleCase = (str: string) => {
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
  );
};

/** Resolves `createdAt` to epoch milliseconds, or null if it cannot be parsed. */
function getCreatedAtMillis(createdAt: any): number | null {
  if (!createdAt) return null;
  if (typeof createdAt.toMillis === 'function') {
    return createdAt.toMillis();
  }
  if (typeof createdAt.toDate === 'function') {
    return createdAt.toDate().getTime();
  }
  if (createdAt instanceof Date && !isNaN(createdAt.getTime())) {
    return createdAt.getTime();
  }
  if (typeof createdAt === 'number' && !isNaN(createdAt)) {
    return createdAt;
  }
  const parsed = new Date(createdAt).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Returns true when `createdAt` denotes a development created within the last 48 hours; false if absent or unparseable.
 * Accepts Firestore `Timestamp` (with `toMillis` or `toDate`), a `Date`, a numeric epoch, or a string parseable by `Date`.
 */
export const isNewDevelopment = (createdAt: any): boolean => {
  const createdMs = getCreatedAtMillis(createdAt);
  if (createdMs == null) return false;
  return (Date.now() - createdMs) < 48 * 60 * 60 * 1000;
};

/**
 * Returns a compact relative time label derived from `createdAt`: 'Just now' (under one hour),
 * 'Nh ago' (under 24 hours), 'Nd ago' (under seven days), or null when older or unparseable.
 * Accepts the same `createdAt` shapes as {@link isNewDevelopment}.
 */
export const getRelativeTimeLabel = (createdAt: any): string | null => {
  const createdMs = getCreatedAtMillis(createdAt);
  if (createdMs == null) return null;
  const diffMs = Date.now() - createdMs;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return null;
};
