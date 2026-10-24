/**
 * Hook to detect and manage alerts for abnormal biomarker values
 *
 * Provides alert detection for:
 * - Out-of-range values (high/low)
 * - Trend alerts (consistent direction)
 * - Improvement alerts (values returning to normal)
 */

import { useMemo, useCallback } from 'react';
import { useLabResults, type EnrichedTestValue } from './useLabResults';
import { useAlertState } from './useAlertState';
import { usePreferences } from './usePreferences';
import {
  SEVERITY_ORDER,
  detectConsistentDirection,
  improvementMessage,
  outOfRangeMessage,
  outOfRangeSeverity,
  trendMessage,
  type AlertSeverity,
  type ReferenceRange,
  type TrendDirection,
} from '@services/alerts';
import { getBiomarkerDisplayName, getBiomarkerForTestValue } from '@data/biomarkers/dictionary';
import {
  convertForDisplay,
  convertMeasurement,
  preferredUnitFor,
  resolveDisplayUnit,
} from '@services/units';

/**
 * Alert type
 */
export type AlertType = 'out_of_range' | 'trend' | 'improvement';

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
  /** Alert message */
  message: string;
}

/**
 * Grouped alerts by biomarker
 */
export interface GroupedAlert {
  /** Biomarker ID */
  biomarkerKey: string;
  /** Biomarker name */
  biomarkerName: string;
  /** Biomarker category */
  category?: string;
  /** All alerts for this biomarker */
  alerts: BiomarkerAlert[];
  /** Most recent alert */
  latestAlert: BiomarkerAlert;
  /** Count of the group's unacknowledged out-of-range values */
  unacknowledgedCount: number;
  /** Overall severity (highest among alerts) */
  severity: AlertSeverity;
}

/**
 * Result of useAlerts hook
 */
export interface UseAlertsResult {
  /** All alerts sorted by date (most recent first) */
  alerts: BiomarkerAlert[];
  /** Alerts grouped by biomarker */
  groupedAlerts: GroupedAlert[];
  /** Count of unacknowledged out-of-range values (the nav badge) */
  unacknowledgedCount: number;
  /** Alerts hidden by an acknowledgement or a dismissal */
  hiddenCount: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Dismiss an alert temporarily (until page reload) */
  dismissAlert: (alertId: string) => void;
  /** Acknowledge an alert's biomarker through the alert's date, persistently */
  acknowledgeAlert: (alertId: string) => Promise<void>;
  /** Reload the lab results alerts are derived from */
  refresh: () => Promise<void>;
  /** Filter alerts by category */
  filterByCategory: (category: string | null) => BiomarkerAlert[];
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
 *   const { alerts, unacknowledgedCount, dismissAlert } = useAlerts();
 *
 *   return (
 *     <Stack>
 *       <Badge>{unacknowledgedCount} alerts</Badge>
 *       {alerts.map(alert => (
 *         <AlertCard
 *           key={alert.id}
 *           alert={alert}
 *           onDismiss={() => dismissAlert(alert.id)}
 *         />
 *       ))}
 *     </Stack>
 *   );
 * }
 * ```
 */
export function useAlerts(): UseAlertsResult {
  const { results, isLoading, error, refresh } = useLabResults();
  const { acknowledgedThrough, dismissedIds, acknowledge, dismiss } = useAlertState();
  const { unitPreferences } = usePreferences();

  /**
   * Every alert the lab results raise, before acknowledgements and dismissals
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
        if (typeof testValue.value !== 'number') continue;

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

      // Most recent first
      const sortedValues = [...values].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime());

      // Alerts state values in the preferred unit when one is set
      const preferredUnit = preferredUnitFor(biomarkerDef, unitPreferences[biomarkerKey]);

      /** The fields every alert about this test value shares */
      const alertFor = (
        tv: EnrichedTestValue,
        type: AlertType,
        status: BiomarkerAlert['status']
      ): Omit<BiomarkerAlert, 'severity' | 'message'> => {
        const display = convertForDisplay(biomarkerName, tv, preferredUnit);
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
      const latestStatus = latestValue.status;
      const latestOutOfRange =
        latestStatus === 'high' || latestStatus === 'low' ? latestStatus : null;
      const trendUnit =
        resolveDisplayUnit(biomarkerDef, unitPreferences[biomarkerKey]) ?? latestValue.unit;
      const converted = sortedValues.map((tv) => ({
        date: dateOf(tv),
        ...convertMeasurement(
          biomarkerName,
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

    return alertList.sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      return bySeverity !== 0 ? bySeverity : b.date.getTime() - a.date.getTime();
    });
  }, [results, unitPreferences]);

  /**
   * Alerts not yet acknowledged or dismissed: a cheap filter, so acknowledging
   * or dismissing does not rebuild every alert
   */
  const alerts = useMemo(
    () =>
      allAlerts.filter((alert) => {
        const through = acknowledgedThrough[alert.biomarkerKey];
        const acknowledged = through !== undefined && alert.date.getTime() <= through.getTime();
        return !acknowledged && !dismissedIds.has(alert.id);
      }),
    [allAlerts, acknowledgedThrough, dismissedIds]
  );

  /**
   * Group alerts by biomarker
   */
  const groupedAlerts = useMemo(() => {
    const groups = new Map<string, BiomarkerAlert[]>();

    for (const alert of alerts) {
      if (!groups.has(alert.biomarkerKey)) {
        groups.set(alert.biomarkerKey, []);
      }
      groups.get(alert.biomarkerKey)!.push(alert);
    }

    const result: GroupedAlert[] = [];

    for (const [biomarkerKey, biomarkerAlerts] of groups.entries()) {
      const latestAlert = biomarkerAlerts[0]; // Already sorted by date
      const unacknowledgedCount = biomarkerAlerts.filter((a) => a.type === 'out_of_range').length;

      // Get highest severity
      const severity = biomarkerAlerts.reduce<AlertSeverity>(
        (highest, alert) =>
          SEVERITY_ORDER[alert.severity] < SEVERITY_ORDER[highest] ? alert.severity : highest,
        'positive'
      );

      result.push({
        biomarkerKey,
        biomarkerName: latestAlert.biomarkerName,
        category: latestAlert.category,
        alerts: biomarkerAlerts,
        latestAlert,
        unacknowledgedCount,
        severity,
      });
    }

    // Sort groups by severity then by unacknowledged count
    return result.sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.unacknowledgedCount - a.unacknowledgedCount;
    });
  }, [alerts]);

  /**
   * Count of unacknowledged alerts
   */
  const unacknowledgedCount = useMemo(
    () => alerts.filter((alert) => alert.type === 'out_of_range').length,
    [alerts]
  );

  /**
   * Acknowledge an alert persistently: hides its biomarker's alerts up to its date
   */
  const acknowledgeAlert = useCallback(
    async (alertId: string) => {
      const alert = alerts.find((a) => a.id === alertId);
      if (alert) await acknowledge(alert.biomarkerKey, alert.date);
    },
    [alerts, acknowledge]
  );

  /**
   * Filter alerts by category
   */
  const filterByCategory = useCallback(
    (category: string | null) => {
      if (!category) return alerts;
      return alerts.filter((alert) => alert.category === category);
    },
    [alerts]
  );

  return {
    alerts,
    groupedAlerts,
    unacknowledgedCount,
    hiddenCount: allAlerts.length - alerts.length,
    isLoading,
    error,
    dismissAlert: dismiss,
    acknowledgeAlert,
    refresh,
    filterByCategory,
  };
}
