import { describe, expect, it } from 'vitest';
import { withLabFlag } from './labFlag';

describe('withLabFlag', () => {
  it.each(['H', 'h', 'High', 'alto', '↑'])('reads "%s" as high', (flag) => {
    expect(withLabFlag({ flag })).toEqual({ labFlag: 'high' });
  });

  it.each(['L', 'low', 'Basso', '↓'])('reads "%s" as low', (flag) => {
    expect(withLabFlag({ flag })).toEqual({ labFlag: 'low' });
  });

  it('reads a mark with no direction, or flaggedAbnormal, as abnormal', () => {
    expect(withLabFlag({ flag: '*' })).toEqual({ labFlag: 'abnormal' });
    expect(withLabFlag({ flaggedAbnormal: true })).toEqual({ labFlag: 'abnormal' });
  });

  it('gives no flag for none, null or anything else', () => {
    expect(withLabFlag({})).toEqual({});
    expect(withLabFlag({ flag: null, flaggedAbnormal: false })).toEqual({});
    expect(withLabFlag({ flag: 'see note' })).toEqual({});
  });
});
