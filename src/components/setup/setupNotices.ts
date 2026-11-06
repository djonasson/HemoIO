/**
 * What setup tells the user when it does not end as asked: another tab's
 * setup came first, or setup failed. Fixed text: never a value entered,
 * an API key above all, nor an error's detail.
 */

import { notifications } from '@mantine/notifications';

const SETUP_NOTICE_ID = 'setup-outcome';

/**
 * One setup notice at a time, the latest: Mantine ignores a show() whose id
 * is already on screen, so the earlier one is hidden first
 */
function showSetupNotice(notice: Omit<Parameters<typeof notifications.show>[0], 'id'>): void {
  notifications.hide(SETUP_NOTICE_ID);
  notifications.show({
    ...notice,
    id: SETUP_NOTICE_ID,
    // Stays until dismissed, announced as an alert
    autoClose: false,
  });
}

/** "The choices made here", naming them when there are some */
function choicesMadeHere(choices: string[]): string {
  return choices.length > 0 ? `the choices made here (${listOf(choices)})` : 'the choices made here';
}

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
  const made = choicesMadeHere(choices);
  showSetupNotice({
    title: 'Already set up',
    message:
      'HemoIO was set up in another tab.' +
      (unlock ? ' Unlock with that password.' : '') +
      ` ${made.charAt(0).toUpperCase()}${made.slice(1)} were not saved; set them in Settings.`,
    color: 'yellow',
  });
}

/** Set up, with the password lock saved, but the other choices could not be stored */
export function notifySetupChoicesNotSaved(choices: string[]): void {
  showSetupNotice({
    title: 'Some choices not saved',
    message: `HemoIO is set up, but ${choicesMadeHere(choices)} were not saved; set them in Settings.`,
    color: 'yellow',
  });
}

/** Setup failed before the password lock was saved: nothing was set up */
export function notifySetupFailed(): void {
  showSetupNotice({
    title: 'Setup failed',
    message: 'HemoIO could not be set up. Please try again.',
    color: 'red',
  });
}
