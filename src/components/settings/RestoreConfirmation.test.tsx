/**
 * Tests for RestoreConfirmation
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { RestoreConfirmation, type RestoreConfirmationProps } from './RestoreConfirmation';
import { formatDateTime } from '@/utils/formatDateTime';

const exportedAt = new Date(2026, 9, 29, 8, 30);

function renderConfirmation(props: Partial<RestoreConfirmationProps> = {}) {
  const all: RestoreConfirmationProps = {
    preview: { exportedAt, labResultCount: 2, testValueCount: 1, noteCount: 3 },
    setAsideCount: 0,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    isRestoring: false,
    ...props,
  };
  render(
    <MantineProvider env="test">
      <RestoreConfirmation {...all} />
    </MantineProvider>
  );
  return all;
}

describe('RestoreConfirmation', () => {
  it('shows counts, date and the set-aside line', async () => {
    const { onConfirm, onCancel } = renderConfirmation({ setAsideCount: 3 });

    expect(screen.getByText(/replace all your current data/)).toBeInTheDocument();
    expect(screen.getByText(`Created: ${formatDateTime(exportedAt)}`)).toBeInTheDocument();
    expect(screen.getByText('2 lab results, 1 test value, 3 notes')).toBeInTheDocument();
    expect(
      screen.getByText("3 records that can't be opened are kept aside and are not affected.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('says nothing of set-aside records when there are none', () => {
    renderConfirmation();

    expect(screen.queryByText(/can't be opened/)).not.toBeInTheDocument();
  });

  it('shows extra notes', () => {
    renderConfirmation({
      notes: ['Your folder copy is kept as a dated backup.'],
      children: <span>AI checkbox</span>,
    });

    expect(screen.getByText('Your folder copy is kept as a dated backup.')).toBeInTheDocument();
    expect(screen.getByText('AI checkbox')).toBeInTheDocument();
  });

  it('marks an encrypted backup and one with an API key', () => {
    renderConfirmation({
      preview: { exportedAt, labResultCount: 1, testValueCount: 0, noteCount: 0, wasEncrypted: true, hasApiKey: true },
    });

    expect(screen.getByText('Encrypted')).toBeInTheDocument();
    expect(screen.getByText('Includes API key')).toBeInTheDocument();
  });
});
