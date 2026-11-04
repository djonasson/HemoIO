import { describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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

  it('shows the number it opens with', () => {
    expect(renderField(7.5).input).toHaveValue('7.5');
  });

  it('opens blank for no number, or for one that is not a number', () => {
    expect(renderField(undefined).input).toHaveValue('');
    cleanup();
    expect(renderField(NaN).input).toHaveValue('');
  });

  it.each(['-0', '-0.', '-00.'])('keeps a half-typed "%s" when the field loses focus', async (typed) => {
    const { input, onValueChange } = renderField(undefined);

    await userEvent.type(input, typed);
    await userEvent.tab();
    await userEvent.click(input);
    await userEvent.type(input, '5');

    expect(input).toHaveValue(`${typed}5`);
    expect(onValueChange).toHaveBeenLastCalledWith(Number(`${typed}5`));
  });

  it('reports "1." as 1', async () => {
    const { input, onValueChange } = renderField(undefined);

    await userEvent.type(input, '1.');

    expect(onValueChange).toHaveBeenLastCalledWith(1);
  });
});
