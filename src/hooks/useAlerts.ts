/**
 * Hook to detect and manage alerts for abnormal biomarker values
 *
 * Provides alert detection for:
 * - Out-of-range values (high/low)
 * - Trend alerts (consistent direction)
 * - Improvement alerts (values returning to normal)
 */

import { useMemo, useCallback } from 'react';
import { useLabResults, type TestValueStatus } from './useLabResults';
import { useAlertState } from './useAlertState';
import { usePreferences } from './usePreferences';
import {
  detectConsistentDirection,
  groupAlerts,
  improvementMessage,
  outOfRangeMessage,
  outOfRangeSeverity,
  trendMessage,
  type AlertGroup,
  type AlertSeverity,
  type AlertType,
  type ReferenceRange,
  type TrendDirection,
} from '@services/alerts';
import { buildTrendLines, type TrendLine } from '@services/statistics/trendLines';
import { useCatalog } from '@contexts/useCatalog';
import { isTrendable } from '@/utils/isTrendable';
import { formatPointValue } from '@/utils/formatTestValue';
import type { TrendDataPoint } from '@services/statistics/trendAnalysis';

export type { AlertType };

/**
 * Single alert for a biomarker value
 */
export interface BiomarkerAlert {
  /** Unique alert ID */
  id: string;
  /** Type of alert */
  type: AlertType;
  /** Severity level */
  severity: AlertSeverity;
  /**
   * The test: its test key (see testKey), so codes that trend together
   * (glucose in mg/dL and in mmol/L) share one card
   */
  biomarkerKey: string;
  /** Biomarker name */
  biomarkerName: string;
  /** The test's LOINC class ("Chemistry"); none for a value that is not a LOINC test */
  category?: string;
  /** Current value */
  value: number;
  /** The ends of an interval value ("5-10"), whose midpoint is `value` */
  interval?: { low: number; high: number };
  /** Unit of measurement */
  unit: string;
  /** Reference range */
  referenceRange?: ReferenceRange;
  /** Status of the value the alert is about */
  status: 'high' | 'low' | 'normal';
  /** Direction of a trend alert */
  direction?: TrendDirection;
  /** Date of the lab result */
  date: Date;
  /** Lab name */
  labName: string;
  /** Lab result ID for navigation */
  labResultId: number;
  /** The value the alert is about, so Trends opens the line it is on */
  testValueId?: number;
  /** The status of the test's latest value, whatever this alert is about */
  latestStatus: TestValueStatus;
  /** Alert message */
  message: string;
}

/**
 * One test's alert card
 */
export type GroupedAlert = AlertGroup<BiomarkerAlert>;

/**
 * Result of useAlerts hook
 */
export interface UseAlertsResult {
  /** One card per test with something new, most pressing first */
  groups: GroupedAlert[];
  /** New out-of-range results on the shown cards (the nav badge) */
  unacknowledgedCount: number;
  /** Tests whose card an acknowledgement or a dismissal hides */
  hiddenCount: number;
  /** Values checked against a reference range: none, and there is nothing to call normal */
  assessedCount: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Hide a test's card until the next page load or a later alert */
  dismissGroup: (group: GroupedAlert) => void;
  /** Acknowledge every alert of a test persistently, until a later alert */
  acknowledgeGroup: (group: GroupedAlert) => Promise<void>;
  /** Reload the lab results alerts are derived from */
  refresh: () => Promise<void>;
}

/**
 * Generate a unique alert ID. Keyed by test value so duplicate values within
 * one lab result get their own alerts.
 */
function generateAlertId(biomarkerKey: string, valueId: number, type: AlertType): string {
  return `${type}_${biomarkerKey}_${valueId}`;
}

/**
 * Hook to detect and manage alerts for abnormal biomarker values
 *
 * @returns UseAlertsResult with alerts and management functions
 *
 * @example
 * ```tsx
 * function AlertsPanel() {
 *   const { groups, unacknowledgedCount, dismissGroup } = useAlerts();
 *
 *   return (
 *     <Stack>
 *       <Badge>{unacknowledgedCount} new</Badge>
 *       {groups.map((group) => (
 *         <AlertGroupCard
 *           key={group.biomarkerKey}
 *           group={group}
 *           onDismiss={() => dismissGroup(group)}
 *         />
 *       ))}
 *     </Stack>
 *   );
 * }
 * ```
 */
export function useAlerts(): UseAlertsResult {
  const catalog = useCatalog();
  const { results, isLoading, error, refresh } = useLabResults();
  const { acknowledgedThrough, dismissedThrough, acknowledge, dismiss } = useAlertState();
  const { unitPreferences } = usePreferences();

  const assessedCount = useMemo(
    () =>
      results
        .flatMap((result) => result.testValues)
        .filter(
          (tv) =>
            isTrendable(tv) &&
            (tv.status === 'normal' || tv.status === 'high' || tv.status === 'low')
        ).length,
    [results]
  );

  // Alerts are about the values Trends charts, as Trends charts them: an
  // alert opens its trend, and a trend alert's direction is the line's
  const trendLines = useMemo(
    () => buildTrendLines(catalog, results, unitPreferences),
    [catalog, results, unitPreferences]
  );

  /**
   * Every alert the lab results raise, before acknowledgements and dismissals;
   * unordered, as the cards set their own order
   */
  const allAlerts = useMemo(() => {
    const alertList: BiomarkerAlert[] = [];

    // Each test's lines: its main line, and lines of their own for values
    // whose unit does not convert to the main line's
    const linesByTest = new Map<string, TrendLine[]>();
    for (const line of trendLines.values()) {
      const lines = linesByTest.get(line.testKey);
      if (lines) lines.push(line);
      else linesByTest.set(line.testKey, [line]);
    }

    for (const [biomarkerKey, lines] of linesByTest) {
      const { testName: biomarkerName, isLoincTest, classLabel } = lines[0];

      // Most recent first; on one day an out-of-range value comes first, so a
      // day with one reads as out of range whatever order its values are in
      const outOfRange = (point: TrendDataPoint) => point.status === 'high' || point.status === 'low';
      const points = lines
        .flatMap((line) => line.dataPoints.map((point) => ({ point, line })))
        .sort(
          (a, b) =>
            b.point.date.getTime() - a.point.date.getTime() ||
            Number(outOfRange(b.point)) - Number(outOfRange(a.point))
        );
      const [latest] = points;
      const latestStatus = latest.point.status ?? 'unknown';

      /** The fields every alert about this value shares, stated in its line's unit */
      const alertFor = (
        point: TrendDataPoint,
        type: AlertType,
        status: BiomarkerAlert['status']
      ): Omit<BiomarkerAlert, 'severity' | 'message'> => ({
        id: generateAlertId(biomarkerKey, point.testValueId ?? point.labResultId ?? 0, type),
        type,
        biomarkerKey,
        biomarkerName,
        category: isLoincTest ? classLabel : undefined,
        value: point.value,
        interval: point.interval,
        unit: point.unit,
        referenceRange: { low: point.referenceRange?.low, high: point.referenceRange?.high },
        status,
        date: point.date,
        labName: point.labName ?? '',
        labResultId: point.labResultId ?? 0,
        testValueId: point.testValueId,
        latestStatus,
      });

      for (const { point } of points) {
        if (point.status !== 'high' && point.status !== 'low') continue;
        const alert = alertFor(point, 'out_of_range', point.status);
        alertList.push({
          ...alert,
          // A ratio to the range: the same in any unit the value converts to
          severity: outOfRangeSeverity(point.value, point.status, alert.referenceRange),
          message: outOfRangeMessage(
            biomarkerName,
            point.status,
            formatPointValue(alert),
            alert.unit,
            alert.referenceRange!
          ),
        });
      }

      // A trend is only worth an alert while it ends out of range. It is read
      // on the line the latest value is on, in that line's unit, so a lab's
      // unit change is not read as a trend and the chart it opens shows it
      const latestOutOfRange =
        latestStatus === 'high' || latestStatus === 'low' ? latestStatus : null;
      const trend = latestOutOfRange ? detectConsistentDirection(latest.line.dataPoints) : null;
      if (latestOutOfRange && trend) {
        alertList.push({
          ...alertFor(latest.point, 'trend', latestOutOfRange),
          severity: 'warning',
          direction: trend.direction,
          message: trendMessage(trend.direction, trend.start, trend.end),
        });
      }

      // Improvement: was abnormal, now normal
      const previous = points[1]?.point;
      if (latestStatus === 'normal' && previous && outOfRange(previous)) {
        alertList.push({
          ...alertFor(latest.point, 'improvement', 'normal'),
          severity: 'positive',
          message: improvementMessage(biomarkerName),
        });
      }
    }

    return alertList;
  }, [trendLines]);

  /**
   * The cards: a cheap step, so acknowledging or dismissing does not rebuild
   * every alert
   */
  const { groups, hiddenCount } = useMemo(
    () => groupAlerts(allAlerts, acknowledgedThrough, dismissedThrough),
    [allAlerts, acknowledgedThrough, dismissedThrough]
  );

  const unacknowledgedCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.newCount, 0),
    [groups]
  );

  const acknowledgeGroup = useCallback(
    (group: GroupedAlert) => acknowledge(group.biomarkerKey, group.headline.date),
    [acknowledge]
  );

  const dismissGroup = useCallback(
    (group: GroupedAlert) => dismiss(group.biomarkerKey, group.headline.date),
    [dismiss]
  );

  return {
    groups,
    unacknowledgedCount,
    hiddenCount,
    assessedCount,
    isLoading,
    error,
    dismissGroup,
    acknowledgeGroup,
    refresh,
  };
}
