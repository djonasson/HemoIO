import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { NoteContent } from './NoteContent';

function renderContent(content: string, highlight?: string) {
  return render(
    <MantineProvider env="test">
      <NoteContent content={content} highlight={highlight} />
    </MantineProvider>
  );
}

describe('NoteContent', () => {
  it('renders formatting as elements', () => {
    const { container } = renderContent('**Iron** and *rest*\n- one\n1. first');
    expect(screen.getByText('Iron').tagName).toBe('STRONG');
    expect(screen.getByText('rest').tagName).toBe('EM');
    expect(container.querySelector('ul li')).toHaveTextContent('one');
    expect(container.querySelector('ol li')).toHaveTextContent('first');
  });

  it('never interprets HTML', () => {
    const { container } = renderContent('<img src=x onerror=alert(1)> <b>bold</b>');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)> <b>bold</b>');
  });

  it('keeps line breaks of plain notes', () => {
    const { container } = renderContent('first\nsecond');
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });
});
