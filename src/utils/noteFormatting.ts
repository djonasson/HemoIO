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
    const marker = WRAP[format];
    return {
      text: text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end),
      selectionStart: start + marker.length,
      selectionEnd: end + marker.length,
    };
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
