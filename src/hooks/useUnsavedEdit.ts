import { useEffect } from 'react';
import { markUnsavedEdit } from '@/utils/unsavedEdits';

/** Holds automatic loads from the folder while `dirty` (utils/unsavedEdits.ts) */
export function useUnsavedEdit(dirty: boolean): void {
  useEffect(() => (dirty ? markUnsavedEdit() : undefined), [dirty]);
}
