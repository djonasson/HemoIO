import type { TestOptionDetails } from '@services/analysis/testOptions';

/** What both layouts of the tests to choose (table and cards) are given */
export interface TestOptionLayoutProps {
  options: TestOptionDetails[];
  /** The code the value is saved as, if any */
  current: string | undefined;
  /** Whether the value is saved as "Not a LOINC test" */
  notLoinc: boolean;
  /** The value's own unit */
  unit: string;
  onChoose: (code: string | null) => void;
}

/** A test's name as shown: what it measures, and its kind when LOINC gives one */
export function shownName({ title, kind }: Pick<TestOptionDetails, 'title' | 'kind'>): string {
  return kind ? `${title} · ${kind}` : title;
}

/**
 * A test's accessible name: the name as shown first, so a voice command
 * saying what is seen reaches it, then LOINC's long name and code, as the
 * test is known
 */
export function accessibleName(option: TestOptionDetails): string {
  return `${shownName(option)}, ${option.name} · ${option.code}`;
}

/** A test card's frame, as a bordered Paper's */
export const CARD_FRAME = {
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 'var(--mantine-radius-sm)',
};
