/**
 * Check if the app is running on localhost
 */
export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return true;

  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Get the current origin for CORS configuration instructions
 */
export function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
