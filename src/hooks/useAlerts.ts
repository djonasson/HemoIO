/**
 * Hook to detect and manage alerts for abnormal biomarker values
 *
 * Provides alert detection for:
 * - Out-of-range values (high/low)
 * - Trend alerts (consistent direction)
 * - Improvement alerts (values returning to normal)
 */

import { useMemo, useCallback } from 'react';
import { useLabResults, type EnrichedTestValue, type TestValueStatus } from './useLabResults';
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
import { getBiomarkerDisplayName, getBiomarkerForTestValue } from '@data/biomarkers/dictionary';
import {
  componentForBiomarker,
  convertForDisplay,
  convertMeasurement,
  preferredUnitFor,
  resolveDisplayUnit,
} from '@services/units';
import { isTrendable } from '@/utils/isTrendable';

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
  /** Biomarker ID */
  biomarkerKey: string;
  /** Biomarker name */
  biomarkerName: string;
  /** Biomarker category */
  category?: string;
  /** Current value */
  value: number;
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

  /**
   * Every alert the lab results raise, before acknowledgements and dismissals;
   * unordered, as the cards set their own order
   */
  const allAlerts = useMemo(() => {
    const alertList: BiomarkerAlert[] = [];

    // Each biomarker's numeric values across results, with their result's date and lab
    const biomarkerValues = new Map<
      string,
      { values: EnrichedTestValue[]; labInfo: Map<number, { date: Date; labName: string }> }
    >();

    for (const result of results) {
      for (const testValue of result.testValues) {
        // Only values Trends charts: an alert opens its trend
        if (!isTrendable(testValue)) continue;

        let entry = biomarkerValues.get(testValue.biomarkerKey);
        if (!entry) {
          entry = { values: [], labInfo: new Map() };
          biomarkerValues.set(testValue.biomarkerKey, entry);
        }
        entry.values.push(testValue);
        entry.labInfo.set(testValue.labResultId, { date: result.date, labName: result.labName });
      }
    }

    for (const [biomarkerKey, { values, labInfo }] of biomarkerValues.entries()) {
      const biomarkerDef = getBiomarkerForTestValue(values[0]);
      const biomarkerName = getBiomarkerDisplayName(values[0]);
      const dateOf = (tv: EnrichedTestValue) => labInfo.get(tv.labResultId)!.date;

      // Most recent first; on one day an out-of-range value comes first, so a
      // day with one reads as out of range whatever order its values are in
      const outOfRange = (tv: EnrichedTestValue) => tv.status === 'high' || tv.status === 'low';
      const sortedValues = [...values].sort(
        (a, b) =>
          dateOf(b).getTime() - dateOf(a).getTime() || Number(outOfRange(b)) - Number(outOfRange(a))
      );

      const component = componentForBiomarker(biomarkerName);
      // Alerts state values in the preferred unit when one is set
      const preferredUnit = preferredUnitFor(biomarkerDef, unitPreferences[biomarkerKey]);

      const latestStatus = sortedValues[0].status;

      /** The fields every alert about this test value shares */
      const alertFor = (
        tv: EnrichedTestValue,
        type: AlertType,
        status: BiomarkerAlert['status']
      ): Omit<BiomarkerAlert, 'severity' | 'message'> => {
        const display = convertForDisplay(component, tv, preferredUnit);
        const info = labInfo.get(tv.labResultId)!;
        return {
          id: generateAlertId(biomarkerKey, tv.id ?? tv.labResultId, type),
          type,
          biomarkerKey,
          biomarkerName,
          category: biomarkerDef?.category,
          value: display.value as number,
          unit: display.unit,
          referenceRange: { low: display.referenceRangeLow, high: display.referenceRangeHigh },
          status,
          date: info.date,
          labName: info.labName,
          labResultId: tv.labResultId,
          latestStatus,
        };
      };

      for (const testValue of sortedValues) {
        if (testValue.status === 'high' || testValue.status === 'low') {
          const alert = alertFor(testValue, 'out_of_range', testValue.status);
          alertList.push({
            ...alert,
            // A ratio to the range, so worked out on the recorded values
            severity: outOfRangeSeverity(testValue.value as number, testValue.status, {
              low: testValue.referenceRangeLow,
              high: testValue.referenceRangeHigh,
            }),
            message: outOfRangeMessage(
              biomarkerName,
              testValue.status,
              alert.value,
              alert.unit,
              alert.referenceRange!
            ),
          });
        }
      }

      // A trend is only worth an alert while it ends out of range, and values
      // are compared in one unit so a lab's unit change is not read as a trend
      const latestValue = sortedValues[0];
      const latestOutOfRange =
        latestStatus === 'high' || latestStatus === 'low' ? latestStatus : null;
      const trendUnit =
        resolveDisplayUnit(biomarkerDef, unitPreferences[biomarkerKey]) ?? latestValue.unit;
      const converted = sortedValues.map((tv) => ({
        date: dateOf(tv),
        ...convertMeasurement(
          component,
          { value: tv.value as number, unit: tv.unit },
          trendUnit
        ),
      }));
      // Values that cannot be converted can still be compared as recorded,
      // when they all share one unit (e.g. TSH always in mUI/L)
      const recorded = sortedValues.map((tv) => ({ date: dateOf(tv), value: tv.value as number }));
      const sameRecordedUnit = sortedValues.every(
        (tv) => tv.unit.trim().toLowerCase() === latestValue.unit.trim().toLowerCase()
      );
      const points = converted.every((point) => point.unit === trendUnit)
        ? converted
        : sameRecordedUnit
          ? recorded
          : null;
      const trend = latestOutOfRange && points ? detectConsistentDirection(points) : null;
      if (latestOutOfRange && trend) {
        alertList.push({
          ...alertFor(latestValue, 'trend', latestOutOfRange),
          severity: 'warning',
          direction: trend.direction,
          message: trendMessage(trend.direction, trend.start, trend.end),
        });
      }

      // Improvement: was abnormal, now normal
      if (
        sortedValues.length >= 2 &&
        latestStatus === 'normal' &&
        (sortedValues[1].status === 'high' || sortedValues[1].status === 'low')
      ) {
        alertList.push({
          ...alertFor(latestValue, 'improvement', 'normal'),
          severity: 'positive',
          message: improvementMessage(biomarkerName),
        });
      }
    }

    return alertList;
  }, [results, unitPreferences]);

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
