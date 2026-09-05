/**
 * Recursively strips undefined values from an object or array to prevent Firestore
 * SDK write exceptions.
 */
export function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => (value === undefined ? null : value))
  );
}

/**
 * Defensive text trimmer
 */
export function sanitizeInputText(text: unknown, maxLength = 20000): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.trim().slice(0, maxLength);
}

/**
 * Format ISO timestamp into a readable date & time
 */
export function formatJournalDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recently';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}
