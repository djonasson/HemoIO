/**
 * Editors holding text the user has typed and not saved, such as an open
 * note editor. A typed note is data: an automatic load from the folder,
 * which replaces every record and reloads the views in every tab, waits
 * while any editor in any tab of this browser holds unsaved text (P44), and
 * the sync tries again at its next tick.
 *
 * Each such editor holds a Web Lock of its own, named with the prefix and a
 * random id, which the sync finds with navigator.locks.query(). A tab that
 * closes releases its locks, so nothing can hold the load for good. Where
 * Web Locks are missing (jsdom), only this tab's editors are seen.
 */

export const UNSAVED_EDIT_LOCK_PREFIX = 'hemoio-unsaved-edit:';

/** This tab's editors: seen at once, before their locks are granted */
const editors = new Set<symbol>();

function webLocks(): LockManager | undefined {
  return (navigator as Partial<Navigator>).locks;
}

/** Mark one editor as holding unsaved text; returns the function that clears it */
export function markUnsavedEdit(): () => void {
  const editor = Symbol('unsaved edit');
  editors.add(editor);
  let release = (): void => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  const locks = webLocks();
  if (locks) {
    // Held until cleared; a lock granted after the clear is let go at once
    locks
      .request(`${UNSAVED_EDIT_LOCK_PREFIX}${crypto.randomUUID()}`, { mode: 'shared' }, () => released)
      .catch(() => undefined);
  }
  return () => {
    editors.delete(editor);
    release();
  };
}

/** Whether any editor, in this tab or another of this browser, holds unsaved text */
export async function hasUnsavedEdits(): Promise<boolean> {
  if (editors.size > 0) return true;
  const locks = webLocks();
  if (!locks?.query) return false;
  try {
    const { held = [] } = await locks.query();
    return held.some((lock) => lock.name?.startsWith(UNSAVED_EDIT_LOCK_PREFIX) === true);
  } catch {
    // Unknown: the load waits for the next sync rather than risk a typed note
    return true;
  }
}
