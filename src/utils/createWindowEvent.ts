/**
 * A notify/listen pair for one event within this tab, carried by window, so
 * parts of the app that do not know each other (the database and the
 * banner, Settings and folder sync) can tell each other something changed
 */

export interface WindowEvent<T> {
  notify: (detail: T) => void;
  /** Listen; returns the function that stops listening */
  on: (listener: (detail: T) => void) => () => void;
}

export function createWindowEvent<T = void>(name: string): WindowEvent<T> {
  return {
    notify: (detail) => {
      window.dispatchEvent(new CustomEvent<T>(name, { detail }));
    },
    on: (listener) => {
      const handle = (event: Event): void => listener((event as CustomEvent<T>).detail);
      window.addEventListener(name, handle);
      return () => window.removeEventListener(name, handle);
    },
  };
}
