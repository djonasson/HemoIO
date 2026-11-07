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
