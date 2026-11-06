/**
 * What the app says about records it cannot open: counts only, never what
 * the records hold
 */

import { pluralize } from '@/utils/pluralize';

/** "1 record", "3 records" */
export function recordCount(count: number): string {
  return pluralize(count, 'record');
}

function verb(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** Said by every export that leaves the set-aside records out */
export function setAsideLeftOutLine(count: number): string {
  return (
    `${recordCount(count)} that can't be opened ${verb(count, 'is', 'are')} not in this backup. ` +
    'Download them from the banner to keep them.'
  );
}

/** Said by every restore confirmation: a restore leaves the set-aside records alone */
export function setAsideKeptLine(count: number): string {
  return `${recordCount(count)} that can't be opened ${verb(count, 'is', 'are')} kept aside and ${verb(count, 'is', 'are')} not affected.`;
}
