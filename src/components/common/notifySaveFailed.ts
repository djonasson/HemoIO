/**
 * Tell the user that something was not saved, and why: the notification
 * counterpart of SaveFailedAlert. The reason comes from the error's kind
 * only, never from its text, which can quote stored data.
 */

import { notifications } from '@mantine/notifications';
import { saveErrorMessage } from '@data/db/saveError';

/**
 * @param title - What was not saved, e.g. "Preferred unit not saved"
 * @param err - The error the save failed with
 * @param before - Said before the reason, e.g. "Nothing was saved."
 */
export function notifySaveFailed(title: string, err: unknown, before?: string): void {
  const reason = saveErrorMessage(err);
  notifications.show({ title, message: before ? `${before} ${reason}` : reason, color: 'red' });
}
