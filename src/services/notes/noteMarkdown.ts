/**
 * The Markdown subset notes are stored in: **bold**, *italic*, "- " and "1. "
 * lists. Anything else is text. Parsing yields data, never HTML.
 */

export interface InlineNode {
  type: 'text' | 'bold' | 'italic';
  text: string;
}

export type NoteBlock =
  | { type: 'paragraph'; lines: InlineNode[][] }
  | { type: 'bullet-list'; items: InlineNode[][] }
  | { type: 'ordered-list'; start: number; items: InlineNode[][] };

// Markers must hug their text, so "2 * 3 * 4" and a lone "**" stay text
const INLINE = /\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*/g;
const BULLET = /^- (.*)$/;
const ORDERED = /^(\d+)\. (.*)$/;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ type: 'text', text: text.slice(last, match.index) });
    nodes.push(
      match[1] !== undefined ? { type: 'bold', text: match[1] } : { type: 'italic', text: match[2] }
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

export function parseNoteMarkdown(content: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const line of content.split('\n')) {
    const current = blocks[blocks.length - 1];
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);

    if (bullet) {
      if (current?.type === 'bullet-list') current.items.push(parseInline(bullet[1]));
      else blocks.push({ type: 'bullet-list', items: [parseInline(bullet[1])] });
    } else if (ordered) {
      if (current?.type === 'ordered-list') current.items.push(parseInline(ordered[2]));
      else
        blocks.push({
          type: 'ordered-list',
          start: Number(ordered[1]),
          items: [parseInline(ordered[2])],
        });
    } else if (line.trim() === '') {
      // A blank line ends the paragraph; an empty placeholder keeps the next one separate
      if (current?.type === 'paragraph' && current.lines.length > 0) {
        blocks.push({ type: 'paragraph', lines: [] });
      }
    } else if (current?.type === 'paragraph') {
      current.lines.push(parseInline(line));
    } else {
      blocks.push({ type: 'paragraph', lines: [parseInline(line)] });
    }
  }
  return blocks.filter((block) => block.type !== 'paragraph' || block.lines.length > 0);
}

function blockLines(block: NoteBlock): InlineNode[][] {
  return block.type === 'paragraph' ? block.lines : block.items;
}

/** The note's visible text: markers removed, one line per line or list item */
export function toPlainText(content: string): string {
  return parseNoteMarkdown(content)
    .flatMap(blockLines)
    .map((line) => line.map((node) => node.text).join(''))
    .join('\n');
}

/** A one-line preview of a note, cut at a word boundary */
export function notePreview(content: string, max = 120): string {
  const flat = toPlainText(content).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
