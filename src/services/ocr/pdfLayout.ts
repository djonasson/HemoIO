/**
 * Rebuilding the printed lines of a PDF page from where PDF.js places each
 * piece of text. A PDF stores text in whatever order its maker wrote it, often
 * a table column by column, so joining the pieces in stored order can set a
 * test's name far from its value. Grouping by position gives the AI each test
 * on one line, as printed.
 */

/** A piece of text as PDF.js gives it: `transform` is [a, b, c, d, x, y], `width` in page units */
export interface PdfTextPiece {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PlacedPiece {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Line {
  bottom: number;
  top: number;
  pieces: PlacedPiece[];
}

/** Rows overlap this share of the shorter one's height to be one line: a raised power joins its line, the next line does not */
const SAME_LINE_OVERLAP = 0.5;
/** A gap up to this share of the text height is no gap: one word printed in pieces */
const WORD_GAP = 0.15;
/** A gap over this share of the text height is between columns */
const COLUMN_GAP = 1.2;

/** Upright text, the only kind laid out in lines: rotated text runs along a margin */
function isUpright(transform: number[]): boolean {
  return Math.abs(transform[1]) < 1e-3 && Math.abs(transform[2]) < 1e-3 && transform[0] > 0 && transform[3] > 0;
}

function placed(piece: PdfTextPiece): PlacedPiece | undefined {
  const { transform } = piece;
  if (!transform || transform.length < 6 || !isUpright(transform)) return undefined;
  const height = transform[3] || piece.height || 0;
  if (height <= 0) return undefined;
  return { text: piece.str, x: transform[4], y: transform[5], width: piece.width ?? 0, height };
}

function overlap(line: Line, piece: PlacedPiece): number {
  return Math.min(line.top, piece.y + piece.height) - Math.max(line.bottom, piece.y);
}

function lineText(line: Line): string {
  const pieces = [...line.pieces].sort((a, b) => a.x - b.x);
  // The line's own text height: a raised power's small size must not count every gap as a column
  const height = Math.max(...pieces.map((piece) => piece.height));
  let text = '';
  let end: number | undefined;
  for (const piece of pieces) {
    if (end !== undefined) {
      const gap = piece.x - end;
      text += gap > height * COLUMN_GAP ? '\t' : gap > height * WORD_GAP ? ' ' : '';
    }
    text += piece.text;
    end = Math.max(end ?? -Infinity, piece.x + piece.width);
  }
  return text.replace(/ {2,}/g, ' ').replace(/ *\t */g, '\t').trim();
}

/**
 * The page's text as printed: one line per printed row, top to bottom, its
 * pieces left to right, with a tab between columns. Text that is not upright,
 * or has no position, follows the lines in stored order.
 */
export function layoutPageText(pieces: readonly PdfTextPiece[]): string {
  const lines: Line[] = [];
  const unplaced: string[] = [];
  for (const piece of pieces) {
    if (piece.str.trim() === '') continue;
    const at = placed(piece);
    if (!at) {
      unplaced.push(piece.str.trim());
      continue;
    }
    const line = lines.find(
      (candidate) => overlap(candidate, at) >= Math.min(candidate.top - candidate.bottom, at.height) * SAME_LINE_OVERLAP
    );
    if (line) {
      line.pieces.push(at);
      line.bottom = Math.min(line.bottom, at.y);
      line.top = Math.max(line.top, at.y + at.height);
    } else {
      lines.push({ bottom: at.y, top: at.y + at.height, pieces: [at] });
    }
  }
  // PDF pages count up from the bottom
  const text = lines
    .sort((a, b) => b.top - a.top)
    .map(lineText)
    .filter((line) => line !== '');
  if (unplaced.length > 0) text.push(unplaced.join(' '));
  return text.join('\n');
}
