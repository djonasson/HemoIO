import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { SaveError } from '@data/db/saveError';
import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { LearnedTests } from './LearnedTests';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));

const removeLearnedTest = vi.fn(async (key: string): Promise<void> => {
  void key;
});
let learnedTests: Record<string, string> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({ learnedTests, removeLearnedTest }),
}));

const catalog = fixtureCatalog();

function renderList() {
  render(
    <MantineProvider env="test">
      <CatalogContext.Provider value={catalog}>
        <LearnedTests />
      </CatalogContext.Provider>
    </MantineProvider>
  );
}

describe('LearnedTests', () => {
  it('lists each learned wording and unit with its LOINC test, and removes one', () => {
    learnedTests = { 'zorb|mg/dL': '2339-0', 'nitriti|': 'unknown:nitriti' };
    renderList();

    const list = screen.getByRole('list', { name: 'Learned names' });
    expect(within(list).getByText('zorb (mg/dL) → Glucose [Mass/volume] in Blood · 2339-0')).toBeInTheDocument();
    expect(within(list).getByText('nitriti → Not a LOINC test')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove zorb (mg/dL)' }));
    expect(removeLearnedTest).toHaveBeenCalledWith('zorb|mg/dL');
  });

  it('says when there are none', () => {
    learnedTests = {};
    renderList();
    expect(screen.getByText('No learned names yet.')).toBeInTheDocument();
  });

  it('tells the user a name could not be removed, without naming it', async () => {
    learnedTests = { 'zorb|mg/dL': '2339-0' };
    removeLearnedTest.mockRejectedValueOnce(new SaveError('closed'));
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Remove zorb (mg/dL)' }));

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
