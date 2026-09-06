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
 * Compact relative time, e.g. "8h ago". Falls back to a date past 30 days.
 */
export function formatRelativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(isoString).toLocaleDateString();
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
