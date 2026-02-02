/**
 * Hook to detect and manage alerts for abnormal biomarker values
 *
 * Provides alert detection for:
 * - Out-of-range values (high/low)
 * - Trend alerts (consistent direction)
 * - Improvement alerts (values returning to normal)
 */

import { useMemo, useCallback, useState } from 'react';
import { useLabResults, type EnrichedTestValue } from './useLabResults';
import {
  analyzeTrend,
  determineTrendAlertSeverity,
  testValuesToDataPoints,
  type TrendSeverity,
} from '@services/statistics/trendAnalysis';
import { detectConsecutiveAbnormal } from '@services/statistics/patterns';
import { findBiomarker } from '@data/biomarkers/dictionary';

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
  severity: TrendSeverity;
  /** Biomarker ID */
  biomarkerId: number;
  /** Biomarker name */
  biomarkerName: string;
  /** Biomarker category */
  category?: string;
  /** Current value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Reference range */
  referenceRange?: {
    low?: number;
    high?: number;
  };
  /** Status (high, low, normal, mixed for trends) */
  status: 'high' | 'low' | 'normal' | 'mixed';
  /** Date of the lab result */
  date: Date;
  /** Lab name */
  labName: string;
  /** Lab result ID for navigation */
  labResultId: number;
  /** Alert message */
  message: string;
  /** Whether alert has been acknowledged */
  acknowledged: boolean;
  /** Whether alert has been dismissed temporarily */
  dismissed: boolean;
}

/**
 * Grouped alerts by biomarker
 */
export interface GroupedAlert {
  /** Biomarker ID */
  biomarkerId: number;
  /** Biomarker name */
  biomarkerName: string;
  /** Biomarker category */
  category?: string;
  /** All alerts for this biomarker */
  alerts: BiomarkerAlert[];
  /** Most recent alert */
  latestAlert: BiomarkerAlert;
  /** Count of unacknowledged alerts */
  unacknowledgedCount: number;
  /** Overall severity (highest among alerts) */
  severity: TrendSeverity;
}

/**
 * Result of useAlerts hook
 */
export interface UseAlertsResult {
  /** All alerts sorted by date (most recent first) */
  alerts: BiomarkerAlert[];
  /** Alerts grouped by biomarker */
  groupedAlerts: GroupedAlert[];
  /** Count of unacknowledged alerts */
  unacknowledgedCount: number;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Dismiss an alert temporarily (until page reload) */
  dismissAlert: (alertId: string) => void;
  /** Acknowledge an alert persistently */
  acknowledgeAlert: (alertId: string) => void;
  /** Clear all dismissed alerts */
  clearDismissed: () => void;
  /** Filter alerts by category */
  filterByCategory: (category: string | null) => BiomarkerAlert[];
  /** Get alerts for a specific biomarker */
  getAlertsForBiomarker: (biomarkerId: number) => BiomarkerAlert[];
}

/**
 * Generate a unique alert ID
 */
function generateAlertId(biomarkerId: number, labResultId: number, type: AlertType): string {
  return `${type}_${biomarkerId}_${labResultId}`;
}

/**
 * Format alert message based on type and status
 */
function formatAlertMessage(
  biomarkerName: string,
  status: 'high' | 'low' | 'normal' | 'mixed',
  type: AlertType,
  value: number,
  unit: string,
  referenceRange?: { low?: number; high?: number }
): string {
  if (type === 'improvement') {
    return `${biomarkerName} has returned to normal range (${value} ${unit})`;
  }

  if (type === 'trend') {
    if (status === 'high') {
      return `${biomarkerName} has been consistently elevated`;
    } else if (status === 'low') {
      return `${biomarkerName} has been consistently low`;
    } else {
      return `${biomarkerName} has been consistently out of range`;
    }
  }

  // Out of range
  if (status === 'high') {
    const highRef = referenceRange?.high;
    return highRef !== undefined
      ? `${biomarkerName} is elevated at ${value} ${unit} (reference: ≤${highRef})`
      : `${biomarkerName} is elevated at ${value} ${unit}`;
  } else {
    const lowRef = referenceRange?.low;
    return lowRef !== undefined
      ? `${biomarkerName} is low at ${value} ${unit} (reference: ≥${lowRef})`
      : `${biomarkerName} is low at ${value} ${unit}`;
  }
}

/**
 * Determine severity based on how far out of range a value is
 */
function calculateOutOfRangeSeverity(
  value: number,
  status: 'high' | 'low',
  referenceRange?: { low?: number; high?: number }
): TrendSeverity {
  if (!referenceRange) {
    return 'info';
  }

  if (status === 'high' && referenceRange.high !== undefined) {
    const percentOver = ((value - referenceRange.high) / referenceRange.high) * 100;
    if (percentOver > 50) return 'critical';
    if (percentOver > 20) return 'warning';
    return 'info';
  }

  if (status === 'low' && referenceRange.low !== undefined) {
    const percentUnder = ((referenceRange.low - value) / referenceRange.low) * 100;
    if (percentUnder > 50) return 'critical';
    if (percentUnder > 20) return 'warning';
    return 'info';
  }

  return 'info';
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
  const { results, isLoading, error } = useLabResults();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  /**
   * Generate alerts from lab results
   */
  const alerts = useMemo(() => {
    if (results.length === 0) {
      return [];
    }

    const alertList: BiomarkerAlert[] = [];

    // Create a map of biomarker ID to all test values across results
    const biomarkerValues = new Map<number, { values: EnrichedTestValue[]; labInfo: Map<number, { date: Date; labName: string }> }>();

    for (const result of results) {
      for (const testValue of result.testValues) {
        if (typeof testValue.value !== 'number') continue;

        if (!biomarkerValues.has(testValue.biomarkerId)) {
          biomarkerValues.set(testValue.biomarkerId, { values: [], labInfo: new Map() });
        }

        const entry = biomarkerValues.get(testValue.biomarkerId)!;
        entry.values.push(testValue);
        entry.labInfo.set(testValue.labResultId, { date: result.date, labName: result.labName });
      }
    }

    // Process each biomarker
    for (const [biomarkerId, { values, labInfo }] of biomarkerValues.entries()) {
      // Get biomarker info from dictionary
      const firstValue = values[0];
      const biomarkerDef = findBiomarker(firstValue.rawText || '');
      const biomarkerName = biomarkerDef?.name || firstValue.rawText || `Biomarker ${biomarkerId}`;

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
          const alertId = generateAlertId(biomarkerId, testValue.labResultId, 'out_of_range');

          const referenceRange = {
            low: testValue.referenceRangeLow,
            high: testValue.referenceRangeHigh,
          };

          alertList.push({
            id: alertId,
            type: 'out_of_range',
            severity: calculateOutOfRangeSeverity(
              testValue.value as number,
              testValue.status,
              referenceRange
            ),
            biomarkerId,
            biomarkerName,
            category: biomarkerDef?.category,
            value: testValue.value as number,
            unit: testValue.unit,
            referenceRange,
            status: testValue.status,
            date: info.date,
            labName: info.labName,
            labResultId: testValue.labResultId,
            message: formatAlertMessage(
              biomarkerName,
              testValue.status,
              'out_of_range',
              testValue.value as number,
              testValue.unit,
              referenceRange
            ),
            acknowledged: acknowledgedIds.has(alertId),
            dismissed: dismissedIds.has(alertId),
          });
        }
      }

      // Check for trend alerts if we have enough data
      if (sortedValues.length >= 3) {
        const dataPoints = testValuesToDataPoints(sortedValues, labInfo);

        if (dataPoints.length >= 3) {
          const { count: consecutiveCount, direction } = detectConsecutiveAbnormal(dataPoints);

          if (consecutiveCount >= 3 && direction) {
            const trendAnalysis = analyzeTrend(dataPoints);
            const severity = determineTrendAlertSeverity(trendAnalysis, consecutiveCount);

            if (severity && severity !== 'positive') {
              const latestValue = sortedValues[0];
              const info = labInfo.get(latestValue.labResultId)!;
              const alertId = generateAlertId(biomarkerId, latestValue.labResultId, 'trend');

              alertList.push({
                id: alertId,
                type: 'trend',
                severity,
                biomarkerId,
                biomarkerName,
                category: biomarkerDef?.category,
                value: latestValue.value as number,
                unit: latestValue.unit,
                referenceRange: {
                  low: latestValue.referenceRangeLow,
                  high: latestValue.referenceRangeHigh,
                },
                status: direction,
                date: info.date,
                labName: info.labName,
                labResultId: latestValue.labResultId,
                message: formatAlertMessage(
                  biomarkerName,
                  direction,
                  'trend',
                  latestValue.value as number,
                  latestValue.unit
                ),
                acknowledged: acknowledgedIds.has(alertId),
                dismissed: dismissedIds.has(alertId),
              });
            }
          }
        }
      }

      // Check for improvement (was abnormal, now normal) - only needs 2 values
      if (
        sortedValues.length >= 2 &&
        sortedValues[0].status === 'normal' &&
        (sortedValues[1].status === 'high' || sortedValues[1].status === 'low')
      ) {
        const latestValue = sortedValues[0];
        const info = labInfo.get(latestValue.labResultId)!;
        const alertId = generateAlertId(biomarkerId, latestValue.labResultId, 'improvement');

        alertList.push({
          id: alertId,
          type: 'improvement',
          severity: 'positive',
          biomarkerId,
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
          message: formatAlertMessage(
            biomarkerName,
            'normal',
            'improvement',
            latestValue.value as number,
            latestValue.unit
          ),
          acknowledged: acknowledgedIds.has(alertId),
          dismissed: dismissedIds.has(alertId),
        });
      }
    }

    // Sort by severity (critical first) then by date (most recent first)
    const severityOrder: Record<TrendSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
      positive: 3,
    };

    return alertList
      .filter((alert) => !alert.dismissed)
      .sort((a, b) => {
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.date.getTime() - a.date.getTime();
      });
  }, [results, dismissedIds, acknowledgedIds]);

  /**
   * Group alerts by biomarker
   */
  const groupedAlerts = useMemo(() => {
    const groups = new Map<number, BiomarkerAlert[]>();

    for (const alert of alerts) {
      if (!groups.has(alert.biomarkerId)) {
        groups.set(alert.biomarkerId, []);
      }
      groups.get(alert.biomarkerId)!.push(alert);
    }

    const result: GroupedAlert[] = [];

    for (const [biomarkerId, biomarkerAlerts] of groups.entries()) {
      const latestAlert = biomarkerAlerts[0]; // Already sorted by date
      const unacknowledgedCount = biomarkerAlerts.filter((a) => !a.acknowledged).length;

      // Get highest severity
      const severityOrder: Record<TrendSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
        positive: 3,
      };
      const severity = biomarkerAlerts.reduce(
        (highest, alert) =>
          severityOrder[alert.severity] < severityOrder[highest] ? alert.severity : highest,
        'positive' as TrendSeverity
      );

      result.push({
        biomarkerId,
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
      const severityOrder: Record<TrendSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
        positive: 3,
      };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.unacknowledgedCount - a.unacknowledgedCount;
    });
  }, [alerts]);

  /**
   * Count of unacknowledged alerts
   */
  const unacknowledgedCount = useMemo(
    () => alerts.filter((alert) => !alert.acknowledged && alert.type !== 'improvement').length,
    [alerts]
  );

  /**
   * Dismiss an alert temporarily
   */
  const dismissAlert = useCallback((alertId: string) => {
    setDismissedIds((prev) => new Set([...prev, alertId]));
  }, []);

  /**
   * Acknowledge an alert persistently
   */
  const acknowledgeAlert = useCallback((alertId: string) => {
    setAcknowledgedIds((prev) => new Set([...prev, alertId]));
  }, []);

  /**
   * Clear all dismissed alerts
   */
  const clearDismissed = useCallback(() => {
    setDismissedIds(new Set());
  }, []);

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
    (biomarkerId: number) => {
      return alerts.filter((alert) => alert.biomarkerId === biomarkerId);
    },
    [alerts]
  );

  return {
    alerts,
    groupedAlerts,
    unacknowledgedCount,
    isLoading,
    error,
    dismissAlert,
    acknowledgeAlert,
    clearDismissed,
    filterByCategory,
    getAlertsForBiomarker,
  };
}
