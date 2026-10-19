import { describe, it, expect } from 'vitest';
import { applyNoteFormat } from './noteFormatting';

describe('applyNoteFormat', () => {
  it('wraps the selection in bold and keeps it selected', () => {
    expect(applyNoteFormat('take iron daily', 5, 9, 'bold')).toEqual({
      text: 'take **iron** daily',
      selectionStart: 7,
      selectionEnd: 11,
    });
  });

  it('wraps the selection in italic', () => {
    expect(applyNoteFormat('rest', 0, 4, 'italic').text).toBe('*rest*');
  });

  it('inserts empty markers with the cursor between them', () => {
    expect(applyNoteFormat('ab', 1, 1, 'bold')).toEqual({
      text: 'a****b',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it('prefixes every selected line for lists', () => {
    expect(applyNoteFormat('x\none\ntwo', 3, 7, 'bullet-list').text).toBe('x\n- one\n- two');
    expect(applyNoteFormat('one\ntwo', 0, 7, 'numbered-list').text).toBe('1. one\n2. two');
  });

  it('prefixes the current line when nothing is selected', () => {
    expect(applyNoteFormat('a\nbc', 3, 3, 'bullet-list')).toEqual({
      text: 'a\n- bc',
      selectionStart: 2,
      selectionEnd: 6,
    });
  });
});
