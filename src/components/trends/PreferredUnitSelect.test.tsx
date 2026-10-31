import { describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PreferredUnitSelect } from './PreferredUnitSelect';

function renderSelect(onChange = vi.fn(), aside?: React.ReactNode) {
  render(
    <MantineProvider env="test">
      <PreferredUnitSelect
        biomarkerName="Glucose"
        units={['mg/dL', 'mmol/L']}
        value="mg/dL"
        onChange={onChange}
        aside={aside}
      />
    </MantineProvider>
  );
  return { onChange, input: screen.getByRole('textbox', { name: 'Preferred unit' }) };
}

describe('PreferredUnitSelect', () => {
  it('shows the current unit', () => {
    const { input } = renderSelect();
    expect(input).toHaveValue('mg/dL');
  });

  it('offers the given units and reports the one chosen', async () => {
    const { input, onChange } = renderSelect();
    await userEvent.click(input);
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));
    expect(onChange).toHaveBeenCalledWith('mmol/L');
  });

  it('says a typed unit is not supported and keeps the current one', async () => {
    const { input, onChange } = renderSelect();
    await userEvent.clear(input);
    await userEvent.type(input, 'stones');

    expect(screen.getByText('Unit not supported for Glucose')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('Unit not supported for Glucose');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts what is beside it in the row of its input, above an error', async () => {
    const { input } = renderSelect(vi.fn(), <button type="button">Beside</button>);
    await userEvent.clear(input);
    await userEvent.type(input, 'stones');

    const beside = screen.getByRole('button', { name: 'Beside' });
    const error = screen.getByText('Unit not supported for Glucose');
    // The error comes after the row, so it cannot push what is beside the input
    expect(input.closest('.mantine-Select-root')).toContainElement(beside);
    expect(beside.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('replaces the current unit when typing after focusing', async () => {
    const { input } = renderSelect();
    act(() => input.focus());
    await userEvent.keyboard('mmol');
    expect(input).toHaveValue('mmol');
  });

  it('shows no error while the typed text matches a unit', async () => {
    const { input } = renderSelect();
    await userEvent.clear(input);
    await userEvent.type(input, 'mmol');
    expect(screen.queryByText('Unit not supported for Glucose')).not.toBeInTheDocument();
  });

  it('offers the unit typed in another spelling', async () => {
    render(
      <MantineProvider env="test">
        <PreferredUnitSelect
          biomarkerName="Creatinine"
          units={['mg/dL', 'µmol/L']}
          value="mg/dL"
          onChange={vi.fn()}
        />
      </MantineProvider>
    );
    const input = screen.getByRole('textbox', { name: 'Preferred unit' });
    await userEvent.clear(input);
    await userEvent.type(input, 'umol/L');
    expect(screen.queryByText('Unit not supported for Creatinine')).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'µmol/L' })).toBeInTheDocument();
  });
});
