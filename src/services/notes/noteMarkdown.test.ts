import { describe, it, expect } from 'vitest';
import { notePreview, parseInline, parseNoteMarkdown, toPlainText } from './noteMarkdown';

describe('parseInline', () => {
  it('reads bold and italic', () => {
    expect(parseInline('a **b** c *d*')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' c ' },
      { type: 'italic', text: 'd' },
    ]);
  });

  it.each([
    '2*3*4 is 24? no: 2 * 3 * 4',
    'a lone ** here',
    'Ferritin 30 ng/mL — taking iron & vitamin C (50%)',
    '* not italic *',
  ])('keeps text that is not formatting as typed: %s', (text) => {
    expect(
      parseInline(text)
        .map((n) => n.text)
        .join('')
    ).toBe(text.replace(/\*(\S(?:.*?\S)?)\*/g, '$1'));
    expect(parseInline(text).every((n) => n.text.length > 0)).toBe(true);
  });

  it('leaves unbalanced markers as text', () => {
    expect(parseInline('**open')).toEqual([{ type: 'text', text: '**open' }]);
  });
});

describe('parseNoteMarkdown', () => {
  it('keeps plain-text lines and paragraphs', () => {
    expect(parseNoteMarkdown('line one\nline two\n\nnext')).toEqual([
      {
        type: 'paragraph',
        lines: [[{ type: 'text', text: 'line one' }], [{ type: 'text', text: 'line two' }]],
      },
      { type: 'paragraph', lines: [[{ type: 'text', text: 'next' }]] },
    ]);
  });

  it('reads bullet and numbered lists', () => {
    expect(parseNoteMarkdown('- a\n- **b**\n3. c\n4. d')).toEqual([
      { type: 'bullet-list', items: [[{ type: 'text', text: 'a' }], [{ type: 'bold', text: 'b' }]] },
      {
        type: 'ordered-list',
        start: 3,
        items: [[{ type: 'text', text: 'c' }], [{ type: 'text', text: 'd' }]],
      },
    ]);
  });

  it('returns no blocks for empty content', () => {
    expect(parseNoteMarkdown('')).toEqual([]);
  });
});

describe('toPlainText and notePreview', () => {
  it('drops the markers', () => {
    expect(toPlainText('**Iron**\n- daily')).toBe('Iron\ndaily');
  });

  it('cuts previews to the limit with an ellipsis', () => {
    expect(notePreview('word '.repeat(50), 20)).toBe('word word word word…');
    expect(notePreview('short\nnote')).toBe('short note');
  });
});
