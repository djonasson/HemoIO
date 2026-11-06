/**
 * Editors holding text the user has typed and not saved, such as an open
 * note editor. A typed note is data: an automatic load from the folder,
 * which replaces every record and reloads the views, waits while any editor
 * holds unsaved text (P44), and the sync tries again at its next tick.
 */

const editors = new Set<symbol>();

/** Mark one editor as holding unsaved text; returns the function that clears it */
export function markUnsavedEdit(): () => void {
  const editor = Symbol('unsaved edit');
  editors.add(editor);
  return () => {
    editors.delete(editor);
  };
}

/** Whether any editor holds unsaved text */
export function hasUnsavedEdits(): boolean {
  return editors.size > 0;
}
