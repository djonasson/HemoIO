/**
 * A fake navigator.locks for jsdom, which has no Web Locks: tasks under one
 * name run one at a time, in order, and each request is recorded
 */

export interface FakeWebLocks {
  requests: Array<{ name: string; options: unknown }>;
  /** The name of the lock held now, if any */
  held: () => string | null;
  uninstall: () => void;
}

export function installFakeWebLocks(): FakeWebLocks {
  const requests: FakeWebLocks['requests'] = [];
  const queues = new Map<string, Promise<void>>();
  let held: string | null = null;

  const locks = {
    request: (name: string, options: unknown, task: () => Promise<unknown>): Promise<unknown> => {
      requests.push({ name, options });
      const run = (queues.get(name) ?? Promise.resolve()).then(async () => {
        held = name;
        try {
          return await task();
        } finally {
          held = null;
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
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });

  return {
    requests,
    held: () => held,
    uninstall: () => {
      delete (navigator as unknown as { locks?: unknown }).locks;
    },
  };
}
