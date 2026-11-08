import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LabFlagMark } from './LabFlagMark';
import type { LabFlag } from '@/types';

function renderMark(flag: LabFlag) {
  return render(
    <MantineProvider env="test">
      <LabFlagMark flag={flag} />
    </MantineProvider>
  );
}

describe('LabFlagMark', () => {
  it.each([
    ['high', 'H', 'flagged high by the lab'],
    ['low', 'L', 'flagged low by the lab'],
    ['abnormal', '*', 'flagged abnormal by the lab'],
  ] as const)('shows the %s mark as printed, in words on hover and to screen readers', (flag, mark, label) => {
    renderMark(flag);

    const abbr = screen.getByTitle(label);
    expect(abbr.tagName).toBe('ABBR');
    expect(abbr).toHaveTextContent(mark);
    expect(abbr).not.toHaveAttribute('aria-label');
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows nothing for a mark it does not know, never failing', () => {
    const { container } = renderMark('toString' as LabFlag);
    expect(container.querySelector('abbr')).toBeNull();
  });
});
