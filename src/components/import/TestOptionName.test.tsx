import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import { TestOptionName } from './TestOptionName';
import { BLOOD_GLUCOSE_OPTION } from './testOptionFixture';

function renderName(props: Parameters<typeof TestOptionName>[0]) {
  return render(
    <MantineProvider>
      <TestOptionName {...props} />
    </MantineProvider>
  );
}

describe('TestOptionName', () => {
  it('shows what the test measures and its kind', () => {
    const { container } = renderName({ current: false, option: BLOOD_GLUCOSE_OPTION });
    expect(container).toHaveTextContent('Glucose · Mass/volume');
  });

  it('shows a test LOINC gives no kind for by what it measures alone', () => {
    renderName({ current: false, option: { ...BLOOD_GLUCOSE_OPTION, title: 'Specific gravity', kind: '' } });
    expect(screen.getByText('Specific gravity')).toHaveTextContent(/^Specific gravity$/);
  });

  it('marks the current choice with a check, not by weight alone', () => {
    const { container } = renderName({ current: true, label: 'Not a LOINC test' });
    expect(screen.getByText('Not a LOINC test')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
