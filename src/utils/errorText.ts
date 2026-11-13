/**
 * What a failed error says: its name and message, never its stack. It is
 * shown on screen only, so the user can tell what went wrong.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error);
}
