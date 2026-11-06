import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { useFocusOnShow } from './useFocusOnShow';

function Shown({ shown }: { shown: string | null }) {
  const ref = useFocusOnShow<HTMLDivElement>(shown);
  return (
    <>
      <button type="button">elsewhere</button>
      <div ref={ref} tabIndex={-1} data-testid="target">
        {shown}
      </div>
    </>
  );
}

describe('useFocusOnShow', () => {
  it('focuses the element each time a new value is shown, and not for null', () => {
    const { getByTestId, getByRole, rerender } = render(<Shown shown={null} />);
    expect(document.activeElement).not.toBe(getByTestId('target'));

    rerender(<Shown shown="first" />);
    expect(document.activeElement).toBe(getByTestId('target'));

    getByRole('button').focus();
    rerender(<Shown shown="second" />);
    expect(document.activeElement).toBe(getByTestId('target'));

    getByRole('button').focus();
    rerender(<Shown shown={null} />);
    expect(document.activeElement).toBe(getByRole('button'));
  });
});
