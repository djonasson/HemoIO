import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { NumberField } from './NumberField';

function renderField(value: number | undefined) {
  const onValueChange = vi.fn();
  render(
    <MantineProvider env="test">
      <NumberField value={value} onValueChange={onValueChange} placeholder="Value" decimalScale={2} />
    </MantineProvider>
  );
  return { input: screen.getByPlaceholderText('Value'), onValueChange };
}

describe('NumberField', () => {
  it('keeps a minus typed into an empty field', async () => {
    const { input, onValueChange } = renderField(undefined);

    await userEvent.type(input, '-0.5');

    expect(input).toHaveValue('-0.5');
    expect(onValueChange).toHaveBeenLastCalledWith(-0.5);
  });

  it('reports no number while the field is blank or half typed', async () => {
    const { input, onValueChange } = renderField(3);

    await userEvent.clear(input);
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);

    await userEvent.type(input, '-');
    expect(onValueChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows the number it opens with, and a blank for none', () => {
    expect(renderField(7.5).input).toHaveValue('7.5');
  });
});
