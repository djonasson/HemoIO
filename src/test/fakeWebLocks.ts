/**
 * A fake navigator.locks for jsdom, which has no Web Locks: tasks under one
 * name run one at a time, in order, and each request is recorded
 */

export interface FakeWebLocks {
  requests: Array<{ name: string; options: unknown }>;
  /** The name of the lock held now, if any */
  held: () => string | null;
  /** The names of every lock held now, in the order they were taken */
  heldNames: () => string[];
  uninstall: () => void;
}

export function installFakeWebLocks(): FakeWebLocks {
  const requests: FakeWebLocks['requests'] = [];
  const queues = new Map<string, Promise<void>>();
  let held: string | null = null;
  const heldNow = new Set<string>();

  const locks = {
    request: (name: string, options: unknown, task: () => Promise<unknown>): Promise<unknown> => {
      requests.push({ name, options });
      const run = (queues.get(name) ?? Promise.resolve()).then(async () => {
        held = name;
        heldNow.add(name);
        try {
          return await task();
        } finally {
          held = null;
          heldNow.delete(name);
        }
      });
      queues.set(
        name,
        run.then(
          () => undefined,
          () => undefined
        )
      );
      return run;
    },
  };
  Object.defineProperty(navigator, 'locks', {
    value: {
      ...locks,
      query: async () => ({ held: [...heldNow].map((name) => ({ name, mode: 'exclusive' })), pending: [] }),
    },
    configurable: true,
  });

  return {
    requests,
    held: () => held,
    heldNames: () => [...heldNow],
    uninstall: () => {
      delete (navigator as unknown as { locks?: unknown }).locks;
    },
  };
}
