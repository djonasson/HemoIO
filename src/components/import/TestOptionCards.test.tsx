import { render, screen, fireEvent, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { TestOptionCards } from './TestOptionCards';
import { BLOOD_GLUCOSE_OPTION } from './testOptionFixture';

describe('TestOptionCards', () => {
  it('offers "Not a LOINC test" first, then a card per test, the current one marked', () => {
    const onChoose = vi.fn();
    render(
      <MantineProvider>
        <TestOptionCards options={[BLOOD_GLUCOSE_OPTION]} current="2339-0" notLoinc={false} unit="mg/dL" onChoose={onChoose} />
      </MantineProvider>
    );
    const buttons = within(screen.getByRole('group', { name: 'Tests' })).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-current'))).toEqual([null, 'true']);
    fireEvent.click(screen.getByRole('button', { name: 'Not a LOINC test' }));
    expect(onChoose).toHaveBeenCalledWith(null);
  });
});
