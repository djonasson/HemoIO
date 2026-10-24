import { describe, it, expect } from 'vitest';
import { notePreview, parseInline, parseNoteMarkdown, toPlainText } from './noteMarkdown';
import source from './noteMarkdown.ts?raw';

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
    'a*b*c',
    '5*x and y*2',
    'x ** y ** z',
    '****',
    '***',
    'a lone ** here',
    'Ferritin 30 ng/mL — taking iron & vitamin C (50%)',
    '* not italic *',
  ])('keeps text that is not formatting exactly as typed: %s', (text) => {
    expect(parseInline(text)).toEqual([{ type: 'text', text }]);
  });

  it('reads formatting next to text that is not', () => {
    expect(parseInline('dose 2*500mg *daily* (**always**)')).toEqual([
      { type: 'text', text: 'dose 2*500mg ' },
      { type: 'italic', text: 'daily' },
      { type: 'text', text: ' (' },
      { type: 'bold', text: 'always' },
      { type: 'text', text: ')' },
    ]);
  });

  it('leaves unbalanced markers as text', () => {
    expect(parseInline('**open')).toEqual([{ type: 'text', text: '**open' }]);
  });
});

describe('parseNoteMarkdown', () => {
  it('keeps plain-text lines, including blank ones', () => {
    expect(parseNoteMarkdown('line one\nline two\n\n\nnext')).toEqual([
      {
        type: 'paragraph',
        lines: [
          [{ type: 'text', text: 'line one' }],
          [{ type: 'text', text: 'line two' }],
          [],
          [],
          [{ type: 'text', text: 'next' }],
        ],
      },
    ]);
  });

  it('reads bullet and numbered lists', () => {
    expect(parseNoteMarkdown('- a\n- **b**\n3. c\n4. d')).toEqual([
      { type: 'bullet-list', items: [[{ type: 'text', text: 'a' }], [{ type: 'bold', text: 'b' }]] },
      {
        type: 'ordered-list',
        numbers: [3, 4],
        items: [[{ type: 'text', text: 'c' }], [{ type: 'text', text: 'd' }]],
      },
    ]);
  });

  it('keeps the numbers as written', () => {
    expect(parseNoteMarkdown('3. c\n5. d')).toEqual([
      {
        type: 'ordered-list',
        numbers: [3, 5],
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

describe('browser support', () => {
  // Safari before 16.4 cannot parse lookbehind: a module-level regex with one
  // throws while the app loads, and no screen renders at all
  it('uses no lookbehind assertions', () => {
    expect(source).not.toMatch(/\(\?<[!=]/);
  });
});
