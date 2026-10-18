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
import { getBiomarkerForTestValue } from '@data/biomarkers/dictionary';
import { convertMeasurement } from '@services/units';

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
  /** Get alerts for a specific biomarker */
  getAlertsForBiomarker: (biomarkerKey: string) => BiomarkerAlert[];
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

  /**
   * Generate alerts from lab results
   */
  const alerts = useMemo(() => {
    if (results.length === 0) {
      return [];
    }

    const alertList: BiomarkerAlert[] = [];

    // Create a map of biomarker ID to all test values across results
    const biomarkerValues = new Map<
      string,
      {
        values: EnrichedTestValue[];
        labInfo: Map<number, { date: Date; labName: string }>;
      }
    >();

    for (const result of results) {
      for (const testValue of result.testValues) {
        if (typeof testValue.value !== 'number') continue;

        if (!biomarkerValues.has(testValue.biomarkerKey)) {
          biomarkerValues.set(testValue.biomarkerKey, {
            values: [],
            labInfo: new Map(),
          });
        }

        const entry = biomarkerValues.get(testValue.biomarkerKey)!;
        entry.values.push(testValue);
        entry.labInfo.set(testValue.labResultId, {
          date: result.date,
          labName: result.labName,
        });
      }
    }

    // Process each biomarker
    for (const [biomarkerKey, { values, labInfo }] of biomarkerValues.entries()) {
      // Get biomarker info from dictionary
      const firstValue = values[0];
      const biomarkerDef = getBiomarkerForTestValue(firstValue);
      const biomarkerName = biomarkerDef?.name || firstValue.rawText || 'Unknown biomarker';

      // Sort by date (most recent first)
      const sortedValues = [...values].sort((a, b) => {
        const dateA = labInfo.get(a.labResultId)?.date.getTime() || 0;
        const dateB = labInfo.get(b.labResultId)?.date.getTime() || 0;
        return dateB - dateA;
      });

      // Generate out-of-range alerts
      for (const testValue of sortedValues) {
        if (testValue.status === 'high' || testValue.status === 'low') {
          const info = labInfo.get(testValue.labResultId)!;
          const alertId = generateAlertId(
            biomarkerKey,
            testValue.id ?? testValue.labResultId,
            'out_of_range'
          );

          const referenceRange = {
            low: testValue.referenceRangeLow,
            high: testValue.referenceRangeHigh,
          };

          alertList.push({
            id: alertId,
            type: 'out_of_range',
            severity: outOfRangeSeverity(
              testValue.value as number,
              testValue.status,
              referenceRange
            ),
            biomarkerKey,
            biomarkerName,
            category: biomarkerDef?.category,
            value: testValue.value as number,
            unit: testValue.unit,
            referenceRange,
            status: testValue.status,
            date: info.date,
            labName: info.labName,
            labResultId: testValue.labResultId,
            message: outOfRangeMessage(
              biomarkerName,
              testValue.status,
              testValue.value as number,
              testValue.unit,
              referenceRange
            ),
          });
        }
      }

      // A trend is only worth an alert while it ends out of range, and values
      // are compared in one unit so a lab's unit change is not read as a trend
      const latestStatus = sortedValues[0].status;
      const trendUnit = biomarkerDef?.canonicalUnit ?? sortedValues[0].unit;
      const points = sortedValues.map((tv) => ({
        date: labInfo.get(tv.labResultId)!.date,
        ...convertMeasurement(
          biomarkerName,
          { value: tv.value as number, unit: tv.unit },
          trendUnit
        ),
      }));
      const comparable = points.every((point) => point.unit === trendUnit);
      const trend =
        (latestStatus === 'high' || latestStatus === 'low') && comparable
          ? detectConsistentDirection(points)
          : null;
      if (trend) {
        const latestValue = sortedValues[0];
        const info = labInfo.get(latestValue.labResultId)!;
        alertList.push({
          id: generateAlertId(biomarkerKey, latestValue.id ?? latestValue.labResultId, 'trend'),
          type: 'trend',
          severity: 'warning',
          biomarkerKey,
          biomarkerName,
          category: biomarkerDef?.category,
          value: latestValue.value as number,
          unit: latestValue.unit,
          referenceRange: {
            low: latestValue.referenceRangeLow,
            high: latestValue.referenceRangeHigh,
          },
          status:
            latestValue.status === 'high' || latestValue.status === 'low'
              ? latestValue.status
              : 'normal',
          direction: trend.direction,
          date: info.date,
          labName: info.labName,
          labResultId: latestValue.labResultId,
          message: trendMessage(trend.direction, trend.start, trend.end),
        });
      }

      // Check for improvement (was abnormal, now normal) - only needs 2 values
      if (
        sortedValues.length >= 2 &&
        sortedValues[0].status === 'normal' &&
        (sortedValues[1].status === 'high' || sortedValues[1].status === 'low')
      ) {
        const latestValue = sortedValues[0];
        const info = labInfo.get(latestValue.labResultId)!;
        const alertId = generateAlertId(
          biomarkerKey,
          latestValue.id ?? latestValue.labResultId,
          'improvement'
        );

        alertList.push({
          id: alertId,
          type: 'improvement',
          severity: 'positive',
          biomarkerKey,
          biomarkerName,
          category: biomarkerDef?.category,
          value: latestValue.value as number,
          unit: latestValue.unit,
          referenceRange: {
            low: latestValue.referenceRangeLow,
            high: latestValue.referenceRangeHigh,
          },
          status: 'normal',
          date: info.date,
          labName: info.labName,
          labResultId: latestValue.labResultId,
          message: improvementMessage(biomarkerName),
        });
      }
    }

    return alertList
      .filter((alert) => {
        const through = acknowledgedThrough[alert.biomarkerKey];
        const acknowledged = through !== undefined && alert.date.getTime() <= through.getTime();
        return !acknowledged && !dismissedIds.has(alert.id);
      })
      .sort((a, b) => {
        const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        return bySeverity !== 0 ? bySeverity : b.date.getTime() - a.date.getTime();
      });
  }, [results, acknowledgedThrough, dismissedIds]);

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

  /**
   * Get alerts for a specific biomarker
   */
  const getAlertsForBiomarker = useCallback(
    (biomarkerKey: string) => {
      return alerts.filter((alert) => alert.biomarkerKey === biomarkerKey);
    },
    [alerts]
  );

  return {
    alerts,
    groupedAlerts,
    unacknowledgedCount,
    isLoading,
    error,
    dismissAlert: dismiss,
    acknowledgeAlert,
    refresh,
    filterByCategory,
    getAlertsForBiomarker,
  };
}
