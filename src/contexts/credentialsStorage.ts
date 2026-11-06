/**
 * Where the credentials live; setup holds SETUP_LOCK (utils/locks.ts)
 * while it reads and writes them. AuthContext is their only writer; setup reads them to find
 * out whether another tab has finished first.
 */

export const CREDENTIALS_STORAGE_KEY = 'hemoio_credentials';

/**
 * Loads stored credentials from localStorage. The format (v1, v2 or unknown)
 * is checked where they are used.
 */
export function loadStoredCredentials(): object | null {
  try {
    const stored = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether another tab's storage event may have changed the credentials: a
 * null key means that tab cleared all of localStorage
 */
export function mayChangeCredentials(event: StorageEvent): boolean {
  return event.key === CREDENTIALS_STORAGE_KEY || event.key === null;
}
