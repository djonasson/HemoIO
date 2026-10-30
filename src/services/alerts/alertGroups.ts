/**
 * Alert groups: one card per test, built from its alerts and the user's
 * acknowledgements and dismissals.
 */

import { SEVERITY_ORDER, type AlertSeverity } from './alertRules';

/** What grouping needs to know about an alert */
export interface GroupableAlert {
  biomarkerKey: string;
  type: 'out_of_range' | 'trend' | 'improvement';
  severity: AlertSeverity;
  date: Date;
}

/** An out-of-range result on a card, and whether it is new */
export interface GroupedResult<A extends GroupableAlert> {
  alert: A;
  isNew: boolean;
}

/** One test's card */
export interface AlertGroup<A extends GroupableAlert> {
  biomarkerKey: string;
  /** The test's current state: its latest out-of-range result or improvement */
  headline: A;
  /** The test's trend, about its latest value */
  trend?: A;
  /** Out-of-range results other than the headline, most recent first */
  earlier: GroupedResult<A>[];
  /** Every out-of-range result of the test, acknowledged ones included */
  resultCount: number;
  /** Out-of-range results dated after the test's acknowledgement */
  newCount: number;
  /** The most severe of the card's new alerts */
  severity: AlertSeverity;
  /** The latest alert's date: acknowledging or dismissing the card covers up to it */
  latestDate: Date;
}

export interface GroupedAlerts<A extends GroupableAlert> {
  /** Cards with something new that are not dismissed, most pressing first */
  groups: AlertGroup<A>[];
  /** Tests with alerts whose card is hidden by an acknowledgement or a dismissal */
  hiddenCount: number;
}

const after = (date: Date, through: Date | undefined): boolean =>
  through === undefined || date.getTime() > through.getTime();

const newestFirst = (a: GroupableAlert, b: GroupableAlert): number =>
  b.date.getTime() - a.date.getTime();

/**
 * Group alerts into one card per test. A card shows while it has an alert
 * dated after the test's acknowledgement and after its dismissal, so a later
 * result brings an acknowledged or dismissed test back.
 */
export function groupAlerts<A extends GroupableAlert>(
  alerts: readonly A[],
  acknowledgedThrough: Readonly<Record<string, Date>>,
  dismissedThrough: Readonly<Record<string, Date>>
): GroupedAlerts<A> {
  const byTest = new Map<string, A[]>();
  for (const alert of alerts) {
    const list = byTest.get(alert.biomarkerKey);
    if (list) list.push(alert);
    else byTest.set(alert.biomarkerKey, [alert]);
  }

  const groups: AlertGroup<A>[] = [];
  let hiddenCount = 0;

  for (const [biomarkerKey, testAlerts] of byTest) {
    const acknowledged = acknowledgedThrough[biomarkerKey];
    const isNew = (alert: A) => after(alert.date, acknowledged);
    const sorted = [...testAlerts].sort(newestFirst);
    const latestDate = sorted[0].date;
    const newAlerts = sorted.filter(isNew);

    if (newAlerts.length === 0 || !after(latestDate, dismissedThrough[biomarkerKey])) {
      hiddenCount++;
      continue;
    }

    const results = sorted.filter((a) => a.type === 'out_of_range');
    const headline = sorted.find((a) => a.type !== 'trend') ?? sorted[0];

    groups.push({
      biomarkerKey,
      headline,
      trend: sorted.find((a) => a.type === 'trend'),
      earlier: results.filter((a) => a !== headline).map((alert) => ({ alert, isNew: isNew(alert) })),
      resultCount: results.length,
      newCount: results.filter(isNew).length,
      severity: newAlerts.reduce<AlertSeverity>(
        (worst, a) => (SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[worst] ? a.severity : worst),
        'positive'
      ),
      latestDate,
    });
  }

  groups.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return bySeverity !== 0 ? bySeverity : b.latestDate.getTime() - a.latestDate.getTime();
  });

  return { groups, hiddenCount };
}
