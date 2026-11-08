import type { TrendDataPoint } from '@services/statistics/trendAnalysis';

/** One date's values by marker name, and the points they come from */
export type ChartRow = { timestamp: number; points: Record<string, TrendDataPoint> } & Record<string, number>;

