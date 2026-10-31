import { describe, it, expect, vi } from 'vitest';
import { notifications } from '@mantine/notifications';
import { SaveError } from '@data/db/saveError';
import { notifySaveFailed } from './notifySaveFailed';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

describe('notifySaveFailed', () => {
  it('says what was not saved and why, without the text of the error', () => {
    const err = Object.assign(new SaveError('quota'), { cause: 'Glucose 125 mg/dL' });

    notifySaveFailed('Import not saved', err, 'Nothing was saved.');

    const shown = vi.mocked(notifications.show).mock.calls[0][0];
    expect(shown).toMatchObject({ title: 'Import not saved', color: 'red' });
    expect(shown.message).toMatch(/^Nothing was saved\. .*no room left/);
    expect(String(shown.message)).not.toMatch(/Glucose/);
  });

});
