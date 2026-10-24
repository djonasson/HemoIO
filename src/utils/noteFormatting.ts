/**
 * Text edits behind the note editor's formatting toolbar
 */

export type NoteFormat = 'bold' | 'italic' | 'bullet-list' | 'numbered-list';

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const WRAP: Record<'bold' | 'italic', string> = { bold: '**', italic: '*' };

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Wrap the selection in a marker. Markers go around the text itself, not the
 * spaces next to it or a list item's "- ", around each line, and around whole
 * words: "**iron **", "**a\nb**", "**- a**" and "fer*rit*in" would not render.
 */
function wrapSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string
): TextEdit {
  let start = selectionStart;
  let end = selectionEnd;
  if (text.slice(start, end).trim() !== '') {
    while (start > 0 && WORD_CHAR.test(text[start - 1]) && WORD_CHAR.test(text[start])) start--;
    while (end < text.length && WORD_CHAR.test(text[end]) && WORD_CHAR.test(text[end - 1])) end++;
  }
  const selected = text.slice(start, end);
  if (selected.trim() === '') {
    const cursor = start + marker.length;
    return {
      text: text.slice(0, start) + marker + marker + text.slice(start),
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  const lines = selected.split('\n');
  const wrapped = lines
    .map((line) => {
      const [, lead, core, trail] = /^(\s*(?:- |\d+\. )?)(.*?)(\s*)$/.exec(line) ?? [
        '',
        '',
        line,
        '',
      ];
      return core ? `${lead}${marker}${core}${marker}${trail}` : line;
    })
    .join('\n');
  const result = text.slice(0, start) + wrapped + text.slice(end);

  if (lines.length === 1) {
    // Keep the text itself selected, inside the markers
    const from = start + (selected.length - selected.trimStart().length) + marker.length;
    return { text: result, selectionStart: from, selectionEnd: from + selected.trim().length };
  }
  return { text: result, selectionStart: start, selectionEnd: start + wrapped.length };
}

/**
 * Apply a format to the selection: bold and italic wrap it, lists prefix
 * every line it touches. The returned selection covers the formatted text.
 */
export function applyNoteFormat(
  text: string,
  start: number,
  end: number,
  format: NoteFormat
): TextEdit {
  if (format === 'bold' || format === 'italic') {
    return wrapSelection(text, start, end, WRAP[format]);
  }

  // Whole lines the selection touches
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const block = text
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line, i) => (format === 'bullet-list' ? `- ${line}` : `${i + 1}. ${line}`))
    .join('\n');

  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
}
