/**
 * What setup tells the user when it does not end as asked: another tab's
 * setup came first, or setup failed. Fixed text: never a value entered,
 * an API key above all, nor an error's detail.
 */

import { notifications } from '@mantine/notifications';

const SETUP_NOTICE_ID = 'setup-outcome';

/** "a", "a and b", "a, b and c" */
function listOf(items: string[]): string {
  return items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Another tab's setup came first, and its choices are the ones kept.
 * `choices` names what was chosen here (never its value); `unlock` adds
 * that the login screen takes that tab's password.
 */
export function notifySetUpElsewhere(choices: string[], { unlock = false } = {}): void {
  const made = choices.length > 0 ? `The choices made here (${listOf(choices)})` : 'The choices made here';
  notifications.show({
    id: SETUP_NOTICE_ID,
    title: 'Already set up',
    message:
      'HemoIO was set up in another tab.' +
      (unlock ? ' Unlock with that password.' : '') +
      ` ${made} were not saved; set them in Settings.`,
    color: 'yellow',
    // Stays until dismissed, announced as an alert
    autoClose: false,
  });
}

/** Another tab's setup came first, and this password does not open it */
export function notifySetUpElsewhereLocked(): void {
  notifications.show({
    id: SETUP_NOTICE_ID,
    title: 'Already set up',
    message: 'HemoIO was set up in another tab. Unlock with that password.',
    color: 'yellow',
    autoClose: false,
  });
}

export function notifySetupFailed(): void {
  notifications.show({
    id: SETUP_NOTICE_ID,
    title: 'Setup failed',
    message: 'HemoIO could not be set up. Please try again.',
    color: 'red',
    autoClose: false,
  });
}
