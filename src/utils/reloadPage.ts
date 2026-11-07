/**
 * Reloads the page: a fresh start, with nothing an earlier setup left in
 * memory. Its own module, so unit tests (jsdom cannot navigate) mock it.
 */
export function reloadPage(): void {
  window.location.reload();
}
