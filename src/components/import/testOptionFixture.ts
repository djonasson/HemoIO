import type { TestOptionDetails } from '@services/analysis/testOptions';

/** A test to choose, as the lists' tests give it */
export const BLOOD_GLUCOSE_OPTION: TestOptionDetails = {
  code: '2339-0',
  name: 'Glucose [Mass/volume] in Blood',
  title: 'Glucose',
  kind: 'Mass/volume',
  sample: 'Whole Blood',
  method: '',
  units: ['mg/dL'],
  unitFit: 'misfits',
  common: true,
  reason: 'ai',
};
