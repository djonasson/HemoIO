/**
 * The lab's own mark on a value, as a model gave it: "H" or "L" printed
 * beside the value, or an abnormal mark with no direction ("*")
 */

import type { LabFlag } from '@/types';

// Never "+" or "-": "-" is how an empty cell is most often written
const HIGH = new Set(['H', 'HH', 'HIGH', 'ALTO', 'A+', '↑']);
const LOW = new Set(['L', 'LL', 'LOW', 'BASSO', '↓']);
const ABNORMAL = new Set(['A', '*', '**', '!', 'ABNORMAL', 'ANOMALO', 'ALTERATO']);

/** The lab's mark as an optional property: absent when the model gave none or something else */
export function withLabFlag(raw: Record<string, unknown>): { labFlag?: LabFlag } {
  const mark = typeof raw.flag === 'string' ? raw.flag.trim().toUpperCase() : '';
  if (HIGH.has(mark)) return { labFlag: 'high' };
  if (LOW.has(mark)) return { labFlag: 'low' };
  if (ABNORMAL.has(mark)) return { labFlag: 'abnormal' };
  return {};
}
