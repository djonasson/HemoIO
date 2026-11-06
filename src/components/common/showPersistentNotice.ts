/**
 * A notice that stays until the user dismisses it: for what they must know
 * or act on (a sync that held back, a recovery that did not finish). Shown
 * by its id, so the same notice is never stacked twice.
 */

import { notifications } from '@mantine/notifications';

export interface PersistentNotice {
  id: string;
  title: string;
  /** Fixed text: never a value entered, nor an error's detail */
  message: string;
  color?: string;
}

export function showPersistentNotice({ id, title, message, color }: PersistentNotice): void {
  notifications.show({ id, title, message, ...(color !== undefined && { color }), autoClose: false });
}
