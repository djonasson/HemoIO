/**
 * Trend Analysis Service
 *
 * Provides statistical analysis of biomarker trends including:
 * - Direction detection (increasing, decreasing, stable)
 * - Rate of change calculation
 * - Statistical summaries (min, max, avg, etc.)
 */

import type { EnrichedTestValue } from '@hooks/useLabResults';

/**
 * Direction of a trend
 */
export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

/**
 * Severity level for trend alerts
 */
export type TrendSeverity = 'critical' | 'warning' | 'info' | 'positive';

/**
 * Data point for trend analysis
 */
export interface TrendDataPoint {
  /** Date of the measurement */
  date: Date;
  /** Numeric value */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Optional reference range */
  referenceRange?: {
    low?: number;
    high?: number;
  };
  /** Lab name for tooltip display */
  labName?: string;
  /** Status relative to reference range */
  status?: 'normal' | 'low' | 'high' | 'unknown';
}

/**
 * Result of trend direction analysis
 */
export interface TrendDirectionResult {
  /** The detected trend direction */
  direction: TrendDirection;
  /** Confidence in the direction (0-1) */
  confidence: number;
  /** Description of the trend */
  description: string;
}

/**
 * Rate of change result
 */
export interface RateOfChange {
  /** Average change per day */
  perDay: number;
  /** Average change per week */
  perWeek: number;
  /** Average change per month (30 days) */
  perMonth: number;
  /** Percentage change from first to last value */
  percentageChange: number;
  /** Unit of measurement */
  unit: string;
}

/**
 * Statistical summary of a biomarker
 */
export interface TrendStatistics {
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Average value */
  average: number;
  /** Median value */
  median: number;
  /** Standard deviation */
  standardDeviation: number;
  /** Most recent value */
  latest: number;
  /** Date of latest value */
  latestDate: Date;
  /** Oldest value */
  oldest: number;
  /** Date of oldest value */
  oldestDate: Date;
  /** Total number of data points */
  count: number;
  /** Unit of measurement */
  unit: string;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysisResult {
  /** Direction of the trend */
  direction: TrendDirectionResult;
  /** Rate of change */
  rateOfChange: RateOfChange | null;
  /** Statistical summary */
  statistics: TrendStatistics;
  /** Number of values within reference range */
  normalCount: number;
  /** Number of values above reference range */
  highCount: number;
  /** Number of values below reference range */
  lowCount: number;
}

/**
 * Calculate the linear regression slope for a series of data points
 *
 * Uses least squares regression to determine the trend line slope.
 *
 * @param points - Data points with date and value
 * @returns The slope of the regression line (value change per millisecond)
 */
function calculateSlope(points: TrendDataPoint[]): number {
  if (points.length < 2) return 0;

  const n = points.length;
  const timestamps = points.map((p) => p.date.getTime());
  const values = points.map((p) => p.value);

  // Calculate means
  const meanX = timestamps.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  // Calculate slope using least squares
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (timestamps[i] - meanX) * (values[i] - meanY);
    denominator += (timestamps[i] - meanX) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate R-squared (coefficient of determination) for trend confidence
 *
 * @param points - Data points
 * @param slope - Calculated slope
 * @returns R-squared value (0-1)
 */
function calculateRSquared(points: TrendDataPoint[], slope: number): number {
  if (points.length < 2) return 0;

  const n = points.length;
  const values = points.map((p) => p.value);
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  const timestamps = points.map((p) => p.date.getTime());
  const meanX = timestamps.reduce((a, b) => a + b, 0) / n;

  // Calculate intercept
  const intercept = meanY - slope * meanX;

  // Calculate predicted values
  const predicted = timestamps.map((x) => slope * x + intercept);

  // Calculate R-squared
  let ssRes = 0;
  let ssTot = 0;

  for (let i = 0; i < n; i++) {
    ssRes += (values[i] - predicted[i]) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }

  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/**
 * Determine trend direction from slope and data variability
 *
 * @param points - Data points sorted by date (oldest first)
 * @returns TrendDirectionResult with direction, confidence, and description
 */
export function calculateTrendDirection(points: TrendDataPoint[]): TrendDirectionResult {
  if (points.length < 2) {
    return {
      direction: 'insufficient_data',
      confidence: 0,
      description: 'More data needed for trend analysis',
    };
  }

  // Sort by date ascending
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());

  const slope = calculateSlope(sorted);
  const rSquared = calculateRSquared(sorted, slope);

  // Calculate coefficient of variation to determine significance
  const values = sorted.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  );
  // Coefficient of variation (calculated but currently unused, kept for potential future use)
  const _cv = mean !== 0 ? stdDev / Math.abs(mean) : 0;
  void _cv;

  // Threshold for considering a trend "stable" (5% of mean per month)
  const stabilityThreshold = (mean * 0.05) / (30 * 24 * 60 * 60 * 1000);

  // Determine direction
  let direction: TrendDirection;
  let description: string;

  if (Math.abs(slope) < stabilityThreshold) {
    direction = 'stable';
    description = 'Values have remained relatively stable';
  } else if (slope > 0) {
    direction = 'increasing';
    const percentIncrease = sorted.length > 1
      ? ((sorted[sorted.length - 1].value - sorted[0].value) / sorted[0].value) * 100
      : 0;
    description = `Values have increased by ${Math.abs(percentIncrease).toFixed(1)}% over the period`;
  } else {
    direction = 'decreasing';
    const percentDecrease = sorted.length > 1
      ? ((sorted[0].value - sorted[sorted.length - 1].value) / sorted[0].value) * 100
      : 0;
    description = `Values have decreased by ${Math.abs(percentDecrease).toFixed(1)}% over the period`;
  }

  // Confidence is based on R-squared and number of data points
  const dataPointBonus = Math.min(0.2, (sorted.length - 2) * 0.05);
  const confidence = Math.min(1, rSquared + dataPointBonus);

  return {
    direction,
    confidence,
    description,
  };
}

/**
 * Calculate rate of change between data points
 *
 * @param points - Data points sorted by date
 * @returns RateOfChange or null if insufficient data
 */
export function calculateRateOfChange(points: TrendDataPoint[]): RateOfChange | null {
  if (points.length < 2) {
    return null;
  }

  // Sort by date ascending
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());

  const firstPoint = sorted[0];
  const lastPoint = sorted[sorted.length - 1];

  const valueDiff = lastPoint.value - firstPoint.value;
  const timeDiffMs = lastPoint.date.getTime() - firstPoint.date.getTime();

  // Avoid division by zero
  if (timeDiffMs === 0) {
    return null;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const msPerWeek = 7 * msPerDay;
  const msPerMonth = 30 * msPerDay;

  const perDay = (valueDiff / timeDiffMs) * msPerDay;
  const perWeek = (valueDiff / timeDiffMs) * msPerWeek;
  const perMonth = (valueDiff / timeDiffMs) * msPerMonth;

  const percentageChange = firstPoint.value !== 0
    ? (valueDiff / firstPoint.value) * 100
    : 0;

  return {
    perDay,
    perWeek,
    perMonth,
    percentageChange,
    unit: firstPoint.unit,
  };
}

/**
 * Calculate statistical summary of data points
 *
 * @param points - Data points to analyze
 * @returns TrendStatistics summary
 */
export function calculateStatistics(points: TrendDataPoint[]): TrendStatistics {
  if (points.length === 0) {
    throw new Error('Cannot calculate statistics for empty data set');
  }

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const values = sorted.map((p) => p.value);
  const sortedValues = [...values].sort((a, b) => a - b);

  const sum = values.reduce((a, b) => a + b, 0);
  const count = values.length;
  const average = sum / count;

  // Calculate median
  const mid = Math.floor(count / 2);
  const median = count % 2 !== 0
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2;

  // Calculate standard deviation
  const squareDiffs = values.map((value) => (value - average) ** 2);
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / count;
  const standardDeviation = Math.sqrt(avgSquareDiff);

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average,
    median,
    standardDeviation,
    latest: sorted[sorted.length - 1].value,
    latestDate: sorted[sorted.length - 1].date,
    oldest: sorted[0].value,
    oldestDate: sorted[0].date,
    count,
    unit: sorted[0].unit,
  };
}

/**
 * Perform complete trend analysis on a set of data points
 *
 * @param points - Data points to analyze
 * @returns Complete TrendAnalysisResult
 */
export function analyzeTrend(points: TrendDataPoint[]): TrendAnalysisResult {
  if (points.length === 0) {
    throw new Error('Cannot analyze trend for empty data set');
  }

  const direction = calculateTrendDirection(points);
  const rateOfChange = calculateRateOfChange(points);
  const statistics = calculateStatistics(points);

  // Count values by status
  let normalCount = 0;
  let highCount = 0;
  let lowCount = 0;

  for (const point of points) {
    if (point.status === 'normal') {
      normalCount++;
    } else if (point.status === 'high') {
      highCount++;
    } else if (point.status === 'low') {
      lowCount++;
    }
  }

  return {
    direction,
    rateOfChange,
    statistics,
    normalCount,
    highCount,
    lowCount,
  };
}

/**
 * Convert EnrichedTestValue array to TrendDataPoint array
 *
 * @param testValues - Test values from useLabResults
 * @param labResultDate - Date of the lab result
 * @param labName - Name of the lab
 * @returns Array of TrendDataPoints
 */
export function testValuesToDataPoints(
  testValues: EnrichedTestValue[],
  dates: Map<number, { date: Date; labName: string }>
): TrendDataPoint[] {
  const dataPoints: TrendDataPoint[] = [];

  for (const tv of testValues) {
    // Only include numeric values
    if (typeof tv.value !== 'number') {
      continue;
    }

    const labInfo = dates.get(tv.labResultId);
    if (!labInfo) {
      continue;
    }

    dataPoints.push({
      date: labInfo.date,
      value: tv.value,
      unit: tv.unit,
      referenceRange: {
        low: tv.referenceRangeLow,
        high: tv.referenceRangeHigh,
      },
      labName: labInfo.labName,
      status: tv.status,
    });
  }

  return dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Determine if a trend warrants an alert
 *
 * @param analysis - Trend analysis result
 * @param consecutiveAbnormal - Number of consecutive abnormal values
 * @returns Severity level or null if no alert needed
 */
export function determineTrendAlertSeverity(
  analysis: TrendAnalysisResult,
  consecutiveAbnormal: number = 0
): TrendSeverity | null {
  const { direction, highCount, lowCount, statistics } = analysis;

  // Check for critical conditions
  if (consecutiveAbnormal >= 3) {
    return 'critical';
  }

  // High percentage of abnormal values is a warning
  const abnormalRatio = (highCount + lowCount) / statistics.count;
  if (abnormalRatio > 0.5) {
    return 'warning';
  }

  // Consistent direction with abnormal values
  if (
    direction.direction !== 'stable' &&
    direction.confidence > 0.7 &&
    (highCount > 0 || lowCount > 0)
  ) {
    return 'warning';
  }

  // Info for any abnormal values
  if (highCount > 0 || lowCount > 0) {
    return 'info';
  }

  // Positive if values have improved (were abnormal, now normal)
  if (
    direction.direction === 'stable' &&
    abnormalRatio === 0 &&
    statistics.count > 1
  ) {
    return 'positive';
  }

  return null;
}
