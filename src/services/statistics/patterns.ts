/**
 * Pattern Detection Service
 *
 * Detects seasonal and cyclical patterns in biomarker data:
 * - Seasonal variations (by month/quarter)
 * - Cyclical patterns (repeating at regular intervals)
 * - Significant deviations from baseline
 */

import type { TrendDataPoint } from './trendAnalysis';

/**
 * Seasonal pattern by month
 */
export interface SeasonalPattern {
  /** Month (1-12) */
  month: number;
  /** Month name */
  monthName: string;
  /** Average value for this month */
  averageValue: number;
  /** Number of data points for this month */
  sampleCount: number;
  /** Deviation from overall average (percentage) */
  deviationPercent: number;
}

/**
 * Result of seasonal pattern analysis
 */
export interface SeasonalAnalysisResult {
  /** Whether a seasonal pattern was detected */
  hasSeasonalPattern: boolean;
  /** Patterns by month (only months with data) */
  monthlyPatterns: SeasonalPattern[];
  /** Highest average month */
  peakMonth: SeasonalPattern | null;
  /** Lowest average month */
  troughMonth: SeasonalPattern | null;
  /** Overall average value */
  overallAverage: number;
  /** Minimum data points needed per month for reliable detection */
  minSamplesNeeded: number;
  /** Description of the pattern */
  description: string;
}

/**
 * Cyclical pattern detection result
 */
export interface CyclicalPattern {
  /** Detected cycle length in days */
  cycleLengthDays: number;
  /** Confidence in the pattern (0-1) */
  confidence: number;
  /** Description of the pattern */
  description: string;
}

/**
 * Deviation from baseline
 */
export interface BaselineDeviation {
  /** Data point that deviated */
  dataPoint: TrendDataPoint;
  /** Baseline (average of previous values) */
  baseline: number;
  /** Actual deviation in absolute terms */
  deviation: number;
  /** Deviation as percentage of baseline */
  deviationPercent: number;
  /** Whether this is a significant deviation */
  isSignificant: boolean;
  /** Direction of deviation */
  direction: 'above' | 'below';
}

/**
 * Month names for display
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Analyze seasonal patterns in biomarker data
 *
 * Groups data by month and calculates average values to detect
 * seasonal variations.
 *
 * @param points - Data points spanning at least 6 months
 * @returns SeasonalAnalysisResult with pattern information
 */
export function analyzeSeasonalPatterns(points: TrendDataPoint[]): SeasonalAnalysisResult {
  if (points.length < 6) {
    return {
      hasSeasonalPattern: false,
      monthlyPatterns: [],
      peakMonth: null,
      troughMonth: null,
      overallAverage: 0,
      minSamplesNeeded: 2,
      description: 'Insufficient data for seasonal analysis (need at least 6 data points)',
    };
  }

  // Group by month
  const monthlyData = new Map<number, number[]>();
  for (const point of points) {
    const month = point.date.getMonth() + 1; // 1-12
    if (!monthlyData.has(month)) {
      monthlyData.set(month, []);
    }
    monthlyData.get(month)!.push(point.value);
  }

  // Calculate overall average
  const allValues = points.map((p) => p.value);
  const overallAverage = allValues.reduce((a, b) => a + b, 0) / allValues.length;

  // Calculate monthly patterns
  const monthlyPatterns: SeasonalPattern[] = [];
  for (const [month, values] of monthlyData.entries()) {
    const averageValue = values.reduce((a, b) => a + b, 0) / values.length;
    const deviationPercent = ((averageValue - overallAverage) / overallAverage) * 100;

    monthlyPatterns.push({
      month,
      monthName: MONTH_NAMES[month - 1],
      averageValue,
      sampleCount: values.length,
      deviationPercent,
    });
  }

  // Sort by month
  monthlyPatterns.sort((a, b) => a.month - b.month);

  // Find peak and trough
  let peakMonth: SeasonalPattern | null = null;
  let troughMonth: SeasonalPattern | null = null;

  if (monthlyPatterns.length > 0) {
    peakMonth = monthlyPatterns.reduce((a, b) =>
      a.averageValue > b.averageValue ? a : b
    );
    troughMonth = monthlyPatterns.reduce((a, b) =>
      a.averageValue < b.averageValue ? a : b
    );
  }

  // Determine if there's a significant seasonal pattern
  // Consider significant if peak-trough difference > 15% of average
  const hasSeasonalPattern = peakMonth && troughMonth
    ? Math.abs(peakMonth.averageValue - troughMonth.averageValue) / overallAverage > 0.15
    : false;

  // Generate description
  let description = '';
  if (hasSeasonalPattern && peakMonth && troughMonth) {
    description = `Values tend to be higher in ${peakMonth.monthName} (${peakMonth.deviationPercent.toFixed(1)}% above average) and lower in ${troughMonth.monthName} (${Math.abs(troughMonth.deviationPercent).toFixed(1)}% below average).`;
  } else if (monthlyPatterns.length >= 3) {
    description = 'No significant seasonal pattern detected.';
  } else {
    description = 'More months of data needed to detect seasonal patterns.';
  }

  return {
    hasSeasonalPattern,
    monthlyPatterns,
    peakMonth,
    troughMonth,
    overallAverage,
    minSamplesNeeded: 2,
    description,
  };
}

/**
 * Detect cyclical patterns using autocorrelation
 *
 * Looks for repeating patterns at regular intervals.
 *
 * @param points - Data points sorted by date
 * @param minCycleDays - Minimum cycle length to detect (default 7 days)
 * @param maxCycleDays - Maximum cycle length to detect (default 90 days)
 * @returns CyclicalPattern or null if no pattern detected
 */
export function detectCyclicalPattern(
  points: TrendDataPoint[],
  minCycleDays: number = 7,
  maxCycleDays: number = 90
): CyclicalPattern | null {
  if (points.length < 10) {
    return null;
  }

  // Sort by date
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const values = sorted.map((p) => p.value);

  // Calculate mean and variance
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  if (variance === 0) {
    return null;
  }

  // Calculate time span
  const startTime = sorted[0].date.getTime();
  const endTime = sorted[sorted.length - 1].date.getTime();
  const spanDays = (endTime - startTime) / (24 * 60 * 60 * 1000);

  // Need at least 2 complete cycles
  const effectiveMaxCycle = Math.min(maxCycleDays, spanDays / 2);

  if (effectiveMaxCycle < minCycleDays) {
    return null;
  }

  // Find best lag using simplified autocorrelation
  let bestLag = 0;
  let bestCorrelation = 0;

  const msPerDay = 24 * 60 * 60 * 1000;

  for (let lagDays = minCycleDays; lagDays <= effectiveMaxCycle; lagDays += 1) {
    const lagMs = lagDays * msPerDay;
    let correlation = 0;
    let pairs = 0;

    for (let i = 0; i < sorted.length; i++) {
      // Find point approximately 'lag' days later
      const targetTime = sorted[i].date.getTime() + lagMs;
      const tolerance = 3 * msPerDay; // 3 day tolerance

      for (let j = i + 1; j < sorted.length; j++) {
        const timeDiff = Math.abs(sorted[j].date.getTime() - targetTime);
        if (timeDiff <= tolerance) {
          correlation += (sorted[i].value - mean) * (sorted[j].value - mean);
          pairs++;
          break;
        }
      }
    }

    if (pairs > 2) {
      const normalizedCorrelation = correlation / (pairs * variance);
      if (normalizedCorrelation > bestCorrelation) {
        bestCorrelation = normalizedCorrelation;
        bestLag = lagDays;
      }
    }
  }

  // Need correlation > 0.5 to consider it a pattern
  if (bestCorrelation < 0.5 || bestLag === 0) {
    return null;
  }

  // Generate description
  let description: string;
  if (bestLag === 7) {
    description = 'Weekly pattern detected';
  } else if (bestLag >= 28 && bestLag <= 31) {
    description = 'Monthly pattern detected';
  } else if (bestLag >= 84 && bestLag <= 93) {
    description = 'Quarterly pattern detected';
  } else {
    description = `Cyclical pattern with ${bestLag}-day period detected`;
  }

  return {
    cycleLengthDays: bestLag,
    confidence: Math.min(1, bestCorrelation),
    description,
  };
}

/**
 * Detect significant deviations from baseline
 *
 * Identifies data points that deviate significantly from the running average.
 *
 * @param points - Data points sorted by date
 * @param windowSize - Number of previous points to use for baseline (default 5)
 * @param threshold - Standard deviations for significance (default 2)
 * @returns Array of significant deviations
 */
export function detectBaselineDeviations(
  points: TrendDataPoint[],
  windowSize: number = 5,
  threshold: number = 2
): BaselineDeviation[] {
  if (points.length <= windowSize) {
    return [];
  }

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const deviations: BaselineDeviation[] = [];

  for (let i = windowSize; i < sorted.length; i++) {
    // Calculate baseline from previous window
    const window = sorted.slice(i - windowSize, i);
    const windowValues = window.map((p) => p.value);
    const baseline = windowValues.reduce((a, b) => a + b, 0) / windowSize;

    // Calculate standard deviation of window
    const variance = windowValues.reduce((sum, v) => sum + (v - baseline) ** 2, 0) / windowSize;
    const stdDev = Math.sqrt(variance);

    // Check if current point deviates significantly
    const currentPoint = sorted[i];
    const deviation = currentPoint.value - baseline;
    const deviationPercent = baseline !== 0 ? (deviation / baseline) * 100 : 0;

    // Consider significant if > threshold standard deviations
    const isSignificant = stdDev > 0 && Math.abs(deviation) > threshold * stdDev;

    if (isSignificant) {
      deviations.push({
        dataPoint: currentPoint,
        baseline,
        deviation,
        deviationPercent,
        isSignificant: true,
        direction: deviation > 0 ? 'above' : 'below',
      });
    }
  }

  return deviations;
}

/**
 * Detect consecutive abnormal values
 *
 * @param points - Data points sorted by date
 * @returns Maximum consecutive count and the direction
 */
export function detectConsecutiveAbnormal(
  points: TrendDataPoint[]
): { count: number; direction: 'high' | 'low' | 'mixed' | null } {
  if (points.length === 0) {
    return { count: 0, direction: null };
  }

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());

  let maxCount = 0;
  let currentCount = 0;
  let currentDirection: 'high' | 'low' | null = null;
  let maxDirection: 'high' | 'low' | 'mixed' | null = null;

  for (const point of sorted) {
    if (point.status === 'high' || point.status === 'low') {
      const direction = point.status;

      if (currentDirection === null || currentDirection === direction) {
        currentCount++;
        currentDirection = direction;
      } else {
        // Direction changed
        if (currentCount > maxCount) {
          maxCount = currentCount;
          maxDirection = currentDirection;
        }
        currentCount = 1;
        currentDirection = direction;
      }
    } else {
      // Normal value breaks the streak
      if (currentCount > maxCount) {
        maxCount = currentCount;
        maxDirection = currentDirection;
      }
      currentCount = 0;
      currentDirection = null;
    }
  }

  // Check final streak
  if (currentCount > maxCount) {
    maxCount = currentCount;
    maxDirection = currentDirection;
  }

  return { count: maxCount, direction: maxDirection };
}

/**
 * Analyze patterns in biomarker data
 *
 * Comprehensive pattern analysis including seasonal, cyclical, and deviation detection.
 *
 * @param points - Data points to analyze
 * @returns Complete pattern analysis
 */
export function analyzePatterns(points: TrendDataPoint[]): {
  seasonal: SeasonalAnalysisResult;
  cyclical: CyclicalPattern | null;
  deviations: BaselineDeviation[];
  consecutiveAbnormal: { count: number; direction: 'high' | 'low' | 'mixed' | null };
} {
  return {
    seasonal: analyzeSeasonalPatterns(points),
    cyclical: detectCyclicalPattern(points),
    deviations: detectBaselineDeviations(points),
    consecutiveAbnormal: detectConsecutiveAbnormal(points),
  };
}
