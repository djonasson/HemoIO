import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LearnedAliases } from './LearnedAliases';

const removeLearnedAlias = vi.fn(async () => {});
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
});
