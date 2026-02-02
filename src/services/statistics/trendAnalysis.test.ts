/**
 * Tests for trendAnalysis service
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTrendDirection,
  calculateRateOfChange,
  calculateStatistics,
  analyzeTrend,
  determineTrendAlertSeverity,
  type TrendDataPoint,
} from './trendAnalysis';

function createDataPoint(
  date: string,
  value: number,
  status: 'normal' | 'high' | 'low' | 'unknown' = 'normal'
): TrendDataPoint {
  return {
    date: new Date(date),
    value,
    unit: 'mg/dL',
    status,
  };
}

describe('trendAnalysis', () => {
  describe('calculateTrendDirection', () => {
    it('should return insufficient_data for single point', () => {
      const points = [createDataPoint('2024-01-01', 100)];
      const result = calculateTrendDirection(points);

      expect(result.direction).toBe('insufficient_data');
      expect(result.confidence).toBe(0);
    });

    it('should detect increasing trend', () => {
      const points = [
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-02-01', 120),
        createDataPoint('2024-03-01', 140),
        createDataPoint('2024-04-01', 160),
      ];
      const result = calculateTrendDirection(points);

      expect(result.direction).toBe('increasing');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect decreasing trend', () => {
      const points = [
        createDataPoint('2024-01-01', 160),
        createDataPoint('2024-02-01', 140),
        createDataPoint('2024-03-01', 120),
        createDataPoint('2024-04-01', 100),
      ];
      const result = calculateTrendDirection(points);

      expect(result.direction).toBe('decreasing');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect stable trend', () => {
      const points = [
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-02-01', 101),
        createDataPoint('2024-03-01', 99),
        createDataPoint('2024-04-01', 100),
      ];
      const result = calculateTrendDirection(points);

      expect(result.direction).toBe('stable');
    });

    it('should handle unsorted points', () => {
      const points = [
        createDataPoint('2024-03-01', 140),
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-04-01', 160),
        createDataPoint('2024-02-01', 120),
      ];
      const result = calculateTrendDirection(points);

      expect(result.direction).toBe('increasing');
    });
  });

  describe('calculateRateOfChange', () => {
    it('should return null for single point', () => {
      const points = [createDataPoint('2024-01-01', 100)];
      const result = calculateRateOfChange(points);

      expect(result).toBeNull();
    });

    it('should calculate positive rate of change', () => {
      const points = [
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-02-01', 130), // 31 days later, +30 units
      ];
      const result = calculateRateOfChange(points);

      expect(result).not.toBeNull();
      expect(result!.percentageChange).toBeCloseTo(30, 0);
      expect(result!.perMonth).toBeGreaterThan(0);
    });

    it('should calculate negative rate of change', () => {
      const points = [
        createDataPoint('2024-01-01', 130),
        createDataPoint('2024-02-01', 100),
      ];
      const result = calculateRateOfChange(points);

      expect(result).not.toBeNull();
      expect(result!.percentageChange).toBeLessThan(0);
      expect(result!.perMonth).toBeLessThan(0);
    });

    it('should include unit in result', () => {
      const points = [
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-02-01', 130),
      ];
      const result = calculateRateOfChange(points);

      expect(result!.unit).toBe('mg/dL');
    });
  });

  describe('calculateStatistics', () => {
    it('should throw for empty data', () => {
      expect(() => calculateStatistics([])).toThrow();
    });

    it('should calculate correct statistics', () => {
      const points = [
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-02-01', 120),
        createDataPoint('2024-03-01', 110),
        createDataPoint('2024-04-01', 130),
        createDataPoint('2024-05-01', 115),
      ];
      const result = calculateStatistics(points);

      expect(result.min).toBe(100);
      expect(result.max).toBe(130);
      expect(result.average).toBe(115);
      expect(result.median).toBe(115);
      expect(result.count).toBe(5);
      expect(result.latest).toBe(115);
      expect(result.oldest).toBe(100);
    });

    it('should handle single data point', () => {
      const points = [createDataPoint('2024-01-01', 100)];
      const result = calculateStatistics(points);

      expect(result.min).toBe(100);
      expect(result.max).toBe(100);
      expect(result.average).toBe(100);
      expect(result.standardDeviation).toBe(0);
    });

    it('should calculate correct median for even count', () => {
      const points = [
        createDataPoint('2024-01-01', 100),
        createDataPoint('2024-02-01', 120),
        createDataPoint('2024-03-01', 110),
        createDataPoint('2024-04-01', 130),
      ];
      const result = calculateStatistics(points);

      // Sorted values: 100, 110, 120, 130 -> median = (110 + 120) / 2 = 115
      expect(result.median).toBe(115);
    });
  });

  describe('analyzeTrend', () => {
    it('should throw for empty data', () => {
      expect(() => analyzeTrend([])).toThrow();
    });

    it('should return complete analysis', () => {
      const points = [
        createDataPoint('2024-01-01', 100, 'normal'),
        createDataPoint('2024-02-01', 120, 'high'),
        createDataPoint('2024-03-01', 110, 'normal'),
        createDataPoint('2024-04-01', 130, 'high'),
      ];
      const result = analyzeTrend(points);

      expect(result.direction).toBeDefined();
      expect(result.rateOfChange).not.toBeNull();
      expect(result.statistics).toBeDefined();
      expect(result.normalCount).toBe(2);
      expect(result.highCount).toBe(2);
      expect(result.lowCount).toBe(0);
    });

    it('should count abnormal values correctly', () => {
      const points = [
        createDataPoint('2024-01-01', 100, 'normal'),
        createDataPoint('2024-02-01', 120, 'high'),
        createDataPoint('2024-03-01', 80, 'low'),
        createDataPoint('2024-04-01', 130, 'high'),
      ];
      const result = analyzeTrend(points);

      expect(result.normalCount).toBe(1);
      expect(result.highCount).toBe(2);
      expect(result.lowCount).toBe(1);
    });
  });

  describe('determineTrendAlertSeverity', () => {
    it('should return critical for 3+ consecutive abnormal', () => {
      const points = [
        createDataPoint('2024-01-01', 100, 'high'),
        createDataPoint('2024-02-01', 120, 'high'),
        createDataPoint('2024-03-01', 130, 'high'),
      ];
      const analysis = analyzeTrend(points);
      const severity = determineTrendAlertSeverity(analysis, 3);

      expect(severity).toBe('critical');
    });

    it('should return warning for high abnormal ratio', () => {
      const points = [
        createDataPoint('2024-01-01', 100, 'high'),
        createDataPoint('2024-02-01', 120, 'high'),
        createDataPoint('2024-03-01', 110, 'normal'),
      ];
      const analysis = analyzeTrend(points);
      const severity = determineTrendAlertSeverity(analysis);

      expect(severity).toBe('warning');
    });

    it('should return info for some abnormal values', () => {
      // Stable trend with just one abnormal value out of many
      const points = [
        createDataPoint('2024-01-01', 100, 'normal'),
        createDataPoint('2024-02-01', 101, 'normal'),
        createDataPoint('2024-03-01', 99, 'normal'),
        createDataPoint('2024-04-01', 100, 'normal'),
        createDataPoint('2024-05-01', 102, 'normal'),
        createDataPoint('2024-06-01', 120, 'high'),
      ];
      const analysis = analyzeTrend(points);
      const severity = determineTrendAlertSeverity(analysis);

      // With only 1/6 abnormal and stable trend, should be info level
      expect(severity).toBe('info');
    });

    it('should return positive for stable normal values', () => {
      const points = [
        createDataPoint('2024-01-01', 100, 'normal'),
        createDataPoint('2024-02-01', 102, 'normal'),
        createDataPoint('2024-03-01', 101, 'normal'),
        createDataPoint('2024-04-01', 100, 'normal'),
      ];
      const analysis = analyzeTrend(points);
      const severity = determineTrendAlertSeverity(analysis);

      expect(severity).toBe('positive');
    });

    it('should return null for single normal value', () => {
      const points = [createDataPoint('2024-01-01', 100, 'normal')];
      const analysis = analyzeTrend(points);
      const severity = determineTrendAlertSeverity(analysis);

      expect(severity).toBeNull();
    });
  });
});
