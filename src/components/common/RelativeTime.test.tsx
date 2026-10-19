import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { RelativeTime } from './RelativeTime';

function renderTime(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

describe('RelativeTime', () => {
  it('shows the relative time in a focusable time element', () => {
    const date = new Date(Date.now() - 5 * 60_000);
    renderTime(<RelativeTime date={date} />);

    const time = screen.getByText('5 minutes ago');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', date.toISOString());
    expect(time).toHaveAttribute('tabindex', '0');
  });

  it('shows the full date and time when focused', async () => {
    const date = new Date('2024-01-16T12:00:00Z');
    renderTime(<RelativeTime date={date} />);

    const time = screen.getByText(/ago$/);
    act(() => time.focus());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    );
  });

  it('wraps the relative time with a template', () => {
    renderTime(<RelativeTime date={new Date()} template={(r) => `(edited ${r})`} />);
    expect(screen.getByText('(edited just now)')).toBeInTheDocument();
  });

  it('uses day precision on request', () => {
    renderTime(<RelativeTime date={new Date()} precision="day" />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});
