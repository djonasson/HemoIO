import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { SaveError } from '@data/db/saveError';
import { LearnedAliases } from './LearnedAliases';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const removeLearnedAlias = vi.fn(async (name: string): Promise<void> => {
  void name;
});
let learnedAliases: Record<string, string> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({ learnedAliases, removeLearnedAlias }),
}));

function renderList() {
  render(
    <MantineProvider env="test">
      <LearnedAliases />
    </MantineProvider>
  );
}

describe('LearnedAliases', () => {
  it('lists each learned name with its test, and removes one', () => {
    learnedAliases = { 'zorb (urine)': 'urine-urea' };
    renderList();

    const list = screen.getByRole('list', { name: 'Learned names' });
    expect(within(list).getByText(/zorb \(urine\)/)).toBeInTheDocument();
    expect(within(list).getByText(/Urine Urea/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove zorb (urine)' }));
    expect(removeLearnedAlias).toHaveBeenCalledWith('zorb (urine)');
  });

  it('says when there are none', () => {
    learnedAliases = {};
    renderList();
    expect(screen.getByText('No learned names yet.')).toBeInTheDocument();
  });

  it('tells the user a name could not be removed, without naming it', async () => {
    learnedAliases = { 'zorb (urine)': 'urine-urea' };
    removeLearnedAlias.mockRejectedValueOnce(new SaveError('closed'));
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Remove zorb (urine)' }));

    await vi.waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Learned name not removed',
          message: expect.stringMatching(/Reload the page/),
          color: 'red',
        })
      )
    );
    expect(JSON.stringify(vi.mocked(notifications.show).mock.calls)).not.toMatch(/zorb/);
  });
});
