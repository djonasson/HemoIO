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
  /** The baseline and text height of the tallest piece on the line */
  y: number;
  height: number;
  pieces: PlacedPiece[];
}

/** Baselines up to this share of the taller text's height apart can be one line: a raised power ("10³") joins its line */
const SAME_LINE_SHIFT = 0.45;
/** Pieces overlapping by more than this share of the smaller text height sit on different lines */
const SAME_PLACE = 0.1;
/** A gap up to this share of the text height is no gap: one word printed in pieces */
const WORD_GAP = 0.15;
/** A gap over this share of the text height is between columns */
const COLUMN_GAP = 1.2;

/** Text running left to right, the only kind laid out in lines: rotated text runs along a margin */
function isUpright(transform: number[]): boolean {
  // Some makers draw with the page flipped top to bottom: the text still runs left to right
  return Math.abs(transform[1]) < 1e-3 && Math.abs(transform[2]) < 1e-3 && transform[0] > 0 && transform[3] !== 0;
}

function placed(piece: PdfTextPiece): PlacedPiece | undefined {
  const { transform } = piece;
  if (!transform || transform.length < 6 || !isUpright(transform)) return undefined;
  const height = Math.abs(transform[3]) || piece.height || 0;
  if (height <= 0) return undefined;
  return { text: piece.str, x: transform[4], y: transform[5], width: piece.width ?? 0, height };
}

function overlapsAcross(a: PlacedPiece, b: PlacedPiece): boolean {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return overlap > Math.min(a.height, b.height) * SAME_PLACE;
}

/**
 * Whether a piece is on a line: close to its baseline, and not on top of a
 * piece already there, so small lines printed beside a large title, each
 * below the other, stay lines of their own
 */
function sameLine(line: Line, piece: PlacedPiece): boolean {
  return (
    Math.abs(line.y - piece.y) <= Math.max(line.height, piece.height) * SAME_LINE_SHIFT &&
    !line.pieces.some((other) => overlapsAcross(other, piece))
  );
}

function lineText(line: Line): string {
  const pieces = [...line.pieces].sort((a, b) => a.x - b.x);
  let text = '';
  let previous: PlacedPiece | undefined;
  let end = -Infinity;
  for (const piece of pieces) {
    if (previous) {
      // A gap is measured by the text either side: small text by a title keeps its spaces, and a raised power's
      // small size does not make the next gap a column
      const gap = piece.x - end;
      const larger = Math.max(previous.height, piece.height);
      const smaller = Math.min(previous.height, piece.height);
      text += gap > larger * COLUMN_GAP ? '\t' : gap > smaller * WORD_GAP ? ' ' : '';
    }
    text += piece.text;
    end = Math.max(end, piece.x + piece.width);
    previous = piece;
  }
  return text.replace(/ {2,}/g, ' ').replace(/ *\t */g, '\t').trim();
}

/**
 * The page's text as printed: one line per printed row, top to bottom, its
 * pieces left to right, with a tab between columns. Text that is not upright,
 * or has no position, follows the lines in stored order.
 */
export function layoutPageText(pieces: readonly PdfTextPiece[]): string {
  const placedPieces: PlacedPiece[] = [];
  const unplaced: string[] = [];
  for (const piece of pieces) {
    if (piece.str.trim() === '') continue;
    const at = placed(piece);
    if (at) placedPieces.push(at);
    else unplaced.push(piece.str.trim());
  }
  // The tallest text sets the lines, so a raised power or a small note finds the line of the text it belongs to
  const lines: Line[] = [];
  for (const at of placedPieces.sort((a, b) => b.height - a.height)) {
    const line = lines.find((candidate) => sameLine(candidate, at));
    if (line) line.pieces.push(at);
    else lines.push({ y: at.y, height: at.height, pieces: [at] });
  }
  // PDF pages count up from the bottom
  const text = lines
    .sort((a, b) => b.y - a.y)
    .map(lineText)
    .filter((line) => line !== '');
  if (unplaced.length > 0) text.push(unplaced.join(' '));
  return text.join('\n');
}
