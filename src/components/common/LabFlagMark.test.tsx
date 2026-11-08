import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LabFlagMark } from './LabFlagMark';

describe('LabFlagMark', () => {
  it.each([
    ['high', 'H', 'flagged high by the lab'],
    ['low', 'L', 'flagged low by the lab'],
    ['abnormal', '*', 'flagged abnormal by the lab'],
  ] as const)('shows the %s mark as printed, in words on hover and to screen readers', (flag, mark, label) => {
    render(
      <MantineProvider env="test">
        <LabFlagMark flag={flag} />
      </MantineProvider>
    );

    const abbr = screen.getByText(mark);
    expect(abbr.tagName).toBe('ABBR');
    expect(abbr).toHaveAttribute('title', label);
    expect(abbr).toHaveAttribute('aria-label', label);
  });
});
