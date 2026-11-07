import { describe, it, expect, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { showPersistentNotice } from './showPersistentNotice';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

describe('showPersistentNotice', () => {
  it('shows a notice that stays until dismissed, with a close button that has a name', () => {
    showPersistentNotice({ id: 'n', title: 'T', message: 'M', color: 'yellow' });
    showPersistentNotice({ id: 'm', title: 'T', message: 'M' });

    expect(notifications.show).toHaveBeenNthCalledWith(1, {
      id: 'n',
      title: 'T',
      message: 'M',
      color: 'yellow',
      autoClose: false,
      closeButtonProps: { 'aria-label': 'Dismiss notice' },
    });
    expect(notifications.show).toHaveBeenNthCalledWith(2, {
      id: 'm',
      title: 'T',
      message: 'M',
      autoClose: false,
      closeButtonProps: { 'aria-label': 'Dismiss notice' },
    });
  });
});
