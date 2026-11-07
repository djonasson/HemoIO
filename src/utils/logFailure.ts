/**
 * Logs that something failed, in fixed words. The caught error is never
 * logged: its message can name stored health data, a key, a lock or a
 * folder's path. Callers pass a fixed message, never one built from data.
 */
export function logFailure(message: string): void {
  console.error(message);
}
