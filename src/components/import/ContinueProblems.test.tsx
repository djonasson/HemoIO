import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ContinueProblems } from './ContinueProblems';

const problems = Array.from({ length: 8 }, (_, index) => `Problem ${index + 1}`);

function renderProblems(list: string[], onClose = vi.fn()) {
  render(
    <MantineProvider>
      <ContinueProblems problems={list} onClose={onClose} />
    </MantineProvider>
  );
}

describe('ContinueProblems', () => {
  it('shows the first five problems and how many more there are', () => {
    renderProblems(problems);

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('Problem 5')).toBeInTheDocument();
    expect(screen.queryByText('Problem 6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
  });

  it('shows every problem once asked', async () => {
    renderProblems(problems);

    await userEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByText('Problem 8')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('offers no more when every problem is shown', () => {
    renderProblems(problems.slice(0, 5));

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('is dismissed with its close button', async () => {
    const onClose = vi.fn();
    renderProblems(problems, onClose);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onClose).toHaveBeenCalled();
  });
});
