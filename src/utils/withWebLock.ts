/**
 * Runs `task` holding the named Web Lock, so tabs of this origin run it one
 * at a time; runs it directly where navigator.locks is missing (jsdom)
 */
export function withWebLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  // Optional in practice: older browsers and jsdom have no Web Locks
  const locks = (navigator as Partial<Navigator>).locks;
  if (!locks) return task();
  // The DOM typing wraps the callback's promise in another; at runtime the
  // request resolves with what the task resolves with
  return locks.request(name, { mode: 'exclusive' }, task) as Promise<Awaited<T>> as Promise<T>;
}
