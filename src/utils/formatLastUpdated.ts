/** Formats a Firestore timestamp into a human-readable British English date string for the intelligence feed header. */

/**
 * Accepts a numeric instant expressed as milliseconds since the Unix epoch (for example, the value returned by `Timestamp.toMillis()`).
 * When that value is falsy, the function returns `null`. Otherwise it returns a calendar date in British English long form (`en-GB`), such as `12 March 2026`.
 */
export function formatLastUpdated(timestamp: number) {
  if (!timestamp) return null;
  const date = new Date(timestamp);

  // British 'Day Month Year' sequence with full month name (e.g., 12 March 2026)
  const dateOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };

  const datePart = date.toLocaleDateString('en-GB', dateOptions);
  return datePart;
}
