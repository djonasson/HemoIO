/**
 * The sample a printed test name gives, read as the matcher reads it, for a
 * value with no LOINC test to give its sample (review before a test is
 * chosen, a value saved as not a LOINC test).
 */
import { splitSamplePrefix } from '@services/analysis/loincMatch';
import { systemLabel } from '@data/loinc/display';

/**
 * Samples a name may give in words besides urine, which the matcher's
 * splitSamplePrefix reads with the lab's sample prefixes
 */
const SAMPLE_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:serum|sier(?:o|ic[oaie]))\b/i, 'Serum'],
  [/\bplasm(?:a|atic[oaie])\b/i, 'Plasma'],
  [/\b(?:whole[- ]?blood|blood|sangue)\b/i, 'Whole Blood'],
  [/\b(?:semen|liquido seminale)\b/i, 'Semen'],
  [/\b(?:csf|liquor)\b/i, 'CSF'],
  [/\bsaliva\b/i, 'Saliva'],
  [/\b(?:stool|feci)\b/i, 'Stool'],
];

/** The matcher's name for urine collected over 24 hours (see splitSamplePrefix) */
const DAY_URINE = '24H urine';

/** The sample a name or part of a name gives, if any */
function sampleOf(text: string): string | undefined {
  const [system] = splitSamplePrefix(text).systems ?? [];
  if (system) return system === DAY_URINE ? '24h Urine' : systemLabel(system);
  return SAMPLE_WORDS.find(([words]) => words.test(text))?.[1];
}

/**
 * A printed name's sample ("U-Sodio", "Sodio urinario", "Glucose (siero)"),
 * and the name without a sample it ends with in brackets. A prefix stays in
 * the name: the name is shown as the report printed it.
 */
export function splitPrintedSample(name: string): { name: string; sample?: string } {
  const sample = sampleOf(name);
  const ending = /\s*\(([^()]*)\)\s*$/.exec(name);
  const shown = ending && sampleOf(ending[1]) ? name.slice(0, ending.index).trim() : name;
  return { name: shown || name, sample };
}
