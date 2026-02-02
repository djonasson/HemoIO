/**
 * Tests for EmptyTimeline component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { EmptyTimeline } from './EmptyTimeline';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('EmptyTimeline', () => {
  it('should render empty state message', () => {
    renderWithProviders(<EmptyTimeline onImportClick={() => {}} />);

    expect(screen.getByText('No Lab Results Yet')).toBeInTheDocument();
  });

  it('should render descriptive text', () => {
    renderWithProviders(<EmptyTimeline onImportClick={() => {}} />);

    expect(
      screen.getByText(/Import your lab reports to start tracking/i)
    ).toBeInTheDocument();
  });

  it('should render import button', () => {
    renderWithProviders(<EmptyTimeline onImportClick={() => {}} />);

    expect(
      screen.getByRole('button', { name: /import lab results/i })
    ).toBeInTheDocument();
  });

  it('should call onImportClick when button is clicked', () => {
    const handleClick = vi.fn();
    renderWithProviders(<EmptyTimeline onImportClick={handleClick} />);

    fireEvent.click(screen.getByRole('button', { name: /import lab results/i }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should have accessible button', () => {
    renderWithProviders(<EmptyTimeline onImportClick={() => {}} />);

    const button = screen.getByRole('button', { name: /import lab results/i });
    expect(button).toHaveAttribute('aria-label', 'Import lab results');
  });
});
