/**
 * Safe date parsing and formatting utilities for handling strings, numbers, Dates,
 * and Firestore Timestamp objects ({ seconds, nanoseconds, toDate }).
 */

export function parseSafeDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {
        // continue
      }
    }
    if (typeof val.seconds === 'number') {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val._seconds === 'number') {
      const d = new Date(val._seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatSafeDate(val: any, fallback: string = '—'): string {
  if (!val) return fallback;
  if (typeof val === 'string' && val.includes('T')) {
    const parts = val.split('T');
    if (parts[0]) return parts[0];
  }
  const d = parseSafeDate(val);
  if (d) {
    try {
      return d.toISOString().split('T')[0];
    } catch {
      return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
    }
  }
  return typeof val === 'string' ? val : fallback;
}

export function formatSafeDateTime(val: any, locale?: string, fallback: string = '—'): string {
  if (!val) return fallback;
  const d = parseSafeDate(val);
  if (d) {
    return locale ? d.toLocaleString(locale) : d.toLocaleString();
  }
  return typeof val === 'string' ? val : fallback;
}
