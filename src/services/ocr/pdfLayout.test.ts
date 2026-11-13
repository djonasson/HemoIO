import { describe, it, expect } from 'vitest';
import { layoutPageText, type PdfTextPiece } from './pdfLayout';

/** Upright text of `size` at (x, y), about half as wide as tall per character */
function at(str: string, x: number, y: number, size = 10, width = str.length * size * 0.5): PdfTextPiece {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size };
}

describe('layoutPageText', () => {
  it('reads a table stored column by column row by row, a tab between cells', () => {
    const rows = [
      ['Glucose', '95', 'mg/dL', '70-100'],
      ['Hemoglobin', '14.5', 'g/dL', '13.5-17.5'],
    ];
    const columns = [50, 200, 300, 400];
    const pieces = columns.flatMap((x, column) => rows.map((row, i) => at(row[column], x, 700 - i * 14)));
    expect(layoutPageText(pieces)).toBe('Glucose\t95\tmg/dL\t70-100\nHemoglobin\t14.5\tg/dL\t13.5-17.5');
  });

  it('puts the lines top to bottom, as PDF pages count up from the bottom', () => {
    expect(layoutPageText([at('Second', 50, 600), at('First', 50, 700)])).toBe('First\nSecond');
  });

  it('joins a word printed in pieces, and spaces words apart', () => {
    expect(layoutPageText([at('cose', 65, 700, 10, 20), at('Glu', 50, 700, 10, 15), at('fasting', 88, 700)])).toBe(
      'Glucose fasting'
    );
  });

  it('keeps a small raised power on the line of its value', () => {
    const pieces = [at('WBC', 50, 700), at('6.9', 200, 700), at('10', 300, 700, 10, 10), at('3', 310, 704, 6, 3), at('/µL', 313, 700, 10, 15)];
    expect(layoutPageText(pieces)).toBe('WBC\t6.9\t103/µL');
  });

  it('keeps close lines apart', () => {
    expect(layoutPageText([at('Glucose 95', 50, 700), at('Urea 30', 50, 689)])).toBe('Glucose 95\nUrea 30');
  });

  it('sets text printed sideways after the lines', () => {
    const sideways: PdfTextPiece = { str: 'Printed by LabSystem', transform: [0, 10, -10, 0, 580, 300], width: 100 };
    expect(layoutPageText([sideways, at('Glucose', 50, 700), at('95', 200, 700)])).toBe(
      'Glucose\t95\nPrinted by LabSystem'
    );
  });

  it('keeps text with no position in stored order, after the lines', () => {
    expect(layoutPageText([{ str: 'Lab Report' }, { str: 'Glucose: 95 mg/dL' }])).toBe('Lab Report Glucose: 95 mg/dL');
  });

  it('leaves out empty pieces and gives nothing for a page with no text', () => {
    expect(layoutPageText([at('  ', 50, 700), at('', 60, 700)])).toBe('');
    expect(layoutPageText([])).toBe('');
  });

  it('turns the spaces around a column gap into one tab', () => {
    expect(layoutPageText([at('Glucose ', 50, 700, 10, 40), at(' 95', 200, 700)])).toBe('Glucose\t95');
  });
});
