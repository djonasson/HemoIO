import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PersonalTargetModal } from './PersonalTargetModal';
import type { PersonalTarget } from './PersonalTargets';

const GLUCOSE: PersonalTarget = {
  biomarkerKey: 'glucose',
  biomarkerName: 'Glucose',
  unit: 'mg/dL',
  standardLow: 70,
  standardHigh: 100,
  personalHigh: 95,
};

function renderModal(target: PersonalTarget | null = GLUCOSE) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <MantineProvider env="test">
      <PersonalTargetModal target={target} onSave={onSave} onClose={onClose} />
    </MantineProvider>
  );
  return { onSave, onClose };
}

describe('PersonalTargetModal', () => {
  it('is closed without a target', () => {
    renderModal(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on the current target with the standard range for reference', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Set Personal Target for Glucose' });
    expect(dialog).toHaveTextContent('Standard reference range: 70 - 100 mg/dL');
    expect(screen.getByLabelText('Personal target high value')).toHaveValue('95');
  });

  it('saves the entered bounds', async () => {
    const { onSave } = renderModal();
    await userEvent.type(screen.getByLabelText('Personal target low value'), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));
    expect(onSave).toHaveBeenCalledWith('glucose', 70, 95);
  });

  it('closes on Cancel without saving', async () => {
    const { onSave, onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
