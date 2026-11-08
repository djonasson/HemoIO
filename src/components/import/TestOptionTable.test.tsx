import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { TestOptionTable } from './TestOptionTable';
import { BLOOD_GLUCOSE_OPTION } from './testOptionFixture';

function renderTable(onChoose = vi.fn()) {
  render(
    <MantineProvider>
      <TestOptionTable options={[BLOOD_GLUCOSE_OPTION]} current={undefined} notLoinc unit="mg/dL" onChoose={onChoose} />
    </MantineProvider>
  );
  return onChoose;
}

describe('TestOptionTable', () => {
  it('marks "Not a LOINC test" when the value is saved so, and chooses it by its row', () => {
    const onChoose = renderTable();
    const notLoinc = screen.getByRole('button', { name: 'Not a LOINC test' });
    expect(notLoinc).toHaveAttribute('aria-current', 'true');
    fireEvent.click(notLoinc);
    expect(onChoose).toHaveBeenCalledWith(null);
  });

  it('shows a dash for a test with no method, and its code in its own column', () => {
    renderTable();
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2339-0' })).toBeInTheDocument();
  });
});
