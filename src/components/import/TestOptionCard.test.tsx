import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi } from 'vitest';
import { TestOptionCard } from './TestOptionCard';
import { BLOOD_GLUCOSE_OPTION } from './testOptionFixture';

describe('TestOptionCard', () => {
  it("is one button named as shown, its details announced as its description, the unit's fit among them", () => {
    const onChoose = vi.fn();
    render(
      <MantineProvider>
        <TestOptionCard option={BLOOD_GLUCOSE_OPTION} current={false} unit="U/L" onChoose={onChoose} />
      </MantineProvider>
    );
    const card = screen.getByRole('button', { name: /^Glucose · Mass\/volume, / });
    expect(card).toHaveAccessibleDescription(/Sample: Whole Blood.*U\/L doesn't fit.*The AI's best guess/);
    fireEvent.click(card);
    expect(onChoose).toHaveBeenCalledWith('2339-0');
  });
});
