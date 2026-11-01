import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ScrollBox } from './ScrollBox';

function renderBox() {
  render(
    <MantineProvider env="test">
      <ScrollBox label="Values">
        <table aria-label="Values table" />
      </ScrollBox>
    </MantineProvider>
  );
  return screen.getByRole('table').closest('[data-scroll-box]') as HTMLElement;
}

/** A ResizeObserver the test triggers by hand: the callbacks it was given */
function stubResizeObserver(): Array<() => void> {
  const callbacks: Array<() => void> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    }
  );
  return callbacks;
}

describe('ScrollBox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('scrolls its content sideways within itself', () => {
    expect(renderBox()).toHaveStyle({ overflowX: 'auto' });
  });

  it('is no stop for the keyboard while there is nothing to scroll', () => {
    const box = renderBox();
    expect(box).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('is a named region the keyboard can reach while its content is wider', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);

    const box = renderBox();

    expect(screen.getByRole('region', { name: 'Values, scrollable' })).toBe(box);
    expect(box).toHaveAttribute('tabindex', '0');
  });

  it('keeps its focus when its content stops being wider', () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    const resize = stubResizeObserver();
    const box = renderBox();
    act(() => box.focus());

    scrollWidth.mockReturnValue(300);
    act(() => resize.forEach((callback) => callback()));

    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('tabindex', '0');
  });

  it('stays a tab stop when the window, not the page, takes focus away', () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    const resize = stubResizeObserver();
    const box = renderBox();
    act(() => box.focus());
    scrollWidth.mockReturnValue(300);
    act(() => resize.forEach((callback) => callback()));

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    act(() => box.blur());

    expect(box).toHaveAttribute('tabindex', '0');
  });
});
