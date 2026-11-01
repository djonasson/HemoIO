/**
 * Tests for useOverflowsX: whether a box's content is wider than the box
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useOverflowsX } from './useOverflowsX';

function Box() {
  const [ref, overflows] = useOverflowsX<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="box" data-overflows={overflows}>
      <span>content</span>
    </div>
  );
}

/** Give an element a layout width, which jsdom does not compute */
function setWidths(element: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth });
}

describe('useOverflowsX', () => {
  const observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    observers.length = 0;
  });

  function stubResizeObserver(): void {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = vi.fn();
        constructor(callback: () => void) {
          observers.push({ callback, disconnect: this.disconnect });
        }
        observe() {}
        unobserve() {}
      }
    );
  }

  it('is false while the content fits', () => {
    stubResizeObserver();
    render(<Box />);

    expect(screen.getByTestId('box')).toHaveAttribute('data-overflows', 'false');
  });

  it('follows the box as it is resized', () => {
    stubResizeObserver();
    render(<Box />);
    const box = screen.getByTestId('box');

    setWidths(box, 560, 320);
    act(() => observers[0].callback());
    expect(box).toHaveAttribute('data-overflows', 'true');

    setWidths(box, 560, 600);
    act(() => observers[0].callback());
    expect(box).toHaveAttribute('data-overflows', 'false');
  });

  it('stops watching once the box is gone', () => {
    stubResizeObserver();
    const { unmount } = render(<Box />);

    unmount();

    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});
