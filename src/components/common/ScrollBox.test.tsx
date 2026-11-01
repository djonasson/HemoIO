import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ScrollBox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
