/** The page an E2E test makes fail on the dev server, by its view name */
declare global {
  interface Window {
    __hemoioFailingView?: string;
  }
}

/**
 * Throw while drawing `view` when an E2E test asks it to fail. Only on the
 * dev server: a production build drops it.
 */
export function failIfTestAsks(view: string): void {
  if (import.meta.env.DEV && window.__hemoioFailingView === view) {
    throw new Error(`The ${view} page was made to fail by a test`);
  }
}
