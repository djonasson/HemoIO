import { describe, it, expect, afterEach } from 'vitest';
import { notifications, notificationsStore } from '@mantine/notifications';
import {
  notifySetUpElsewhere,
  notifySetupChoicesNotSaved,
  notifySetupFailed,
} from './setupNotices';

const shownMessages = (): unknown[] =>
  notificationsStore.getState().notifications.map((notice) => notice.message);

describe('setupNotices', () => {
  afterEach(() => notifications.clean());

  it('a later setup notice replaces one still shown', () => {
    notifySetupFailed();

    notifySetUpElsewhere(['AI provider'], { unlock: true });

    expect(shownMessages()).toEqual([
      'HemoIO was set up in another tab. Unlock with that password. ' +
        'The choices made here (AI provider) were not saved; set them in Settings.',
    ]);
  });

  it('names the choices not saved once set up, never their values', () => {
    notifySetupChoicesNotSaved(['folder storage', 'AI provider', 'API key']);

    expect(shownMessages()).toEqual([
      'HemoIO is set up, but the choices made here (folder storage, AI provider and API key) ' +
        'were not saved; set them in Settings.',
    ]);
  });
});
