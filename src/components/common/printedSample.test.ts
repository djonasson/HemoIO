import { describe, expect, it } from 'vitest';
import { splitPrintedSample } from './printedSample';

describe('splitPrintedSample', () => {
  it('reads a sample in brackets at the end, and leaves it out of the name', () => {
    expect(splitPrintedSample('Zorblatin (urine)')).toEqual({ name: 'Zorblatin', sample: 'Urine' });
    expect(splitPrintedSample('Zorblatin (urine, 24h)')).toEqual({ name: 'Zorblatin', sample: '24h Urine' });
    expect(splitPrintedSample('Zorblatina (urina 24 ore)')).toEqual({ name: 'Zorblatina', sample: '24h Urine' });
    expect(splitPrintedSample('Zorblatina (siero)')).toEqual({ name: 'Zorblatina', sample: 'Serum' });
  });

  it('reads the sample prefixes and urine words the matcher reads, keeping the name as printed', () => {
    expect(splitPrintedSample('U-Zorblatina')).toEqual({ name: 'U-Zorblatina', sample: 'Urine' });
    expect(splitPrintedSample('S-Zorblatina')).toEqual({ name: 'S-Zorblatina', sample: 'Serum' });
    expect(splitPrintedSample('Zorblatina urinaria')).toEqual({ name: 'Zorblatina urinaria', sample: 'Urine' });
    expect(splitPrintedSample('Zorblatinuria')).toEqual({ name: 'Zorblatinuria', sample: 'Urine' });
  });

  it('reads Italian words for serum, plasma and blood in any form', () => {
    expect(splitPrintedSample('Zorblatina sierica').sample).toBe('Serum');
    expect(splitPrintedSample('Zorblatina plasmatica').sample).toBe('Plasma');
    expect(splitPrintedSample('Zorblatina sangue').sample).toBe('Whole Blood');
  });

  it('gives no sample for a name that names none', () => {
    expect(splitPrintedSample('Zorblatina')).toEqual({ name: 'Zorblatina' });
    // Brackets that are not a sample stay in the name
    expect(splitPrintedSample('Zorblatina (metodo X)')).toEqual({ name: 'Zorblatina (metodo X)' });
  });
});
