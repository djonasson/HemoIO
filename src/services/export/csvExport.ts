/**
 * CSV Export Service
 *
 * Exports lab results to CSV format.
 */

import type { LabResult, TestValue } from '@/types';

/**
 * Options for CSV export
 */
export interface CsvExportOptions {
  /** Filter by start date */
  startDate?: Date;
  /** Filter by end date */
  endDate?: Date;
  /** Filter by specific biomarker IDs */
  biomarkerIds?: number[];
  /** Include reference ranges in output */
  includeReferenceRanges?: boolean;
  /** Include confidence scores in output */
  includeConfidence?: boolean;
  /** Date format for output */
  dateFormat?: 'iso' | 'us' | 'eu';
}

/**
 * Lab result with associated test values for export
 */
export interface LabResultForExport {
  labResult: LabResult;
  testValues: TestValue[];
  biomarkerNames: Map<number, string>;
}

/**
 * Format a date based on the specified format
 */
function formatDate(date: Date, format: 'iso' | 'us' | 'eu' = 'iso'): string {
  switch (format) {
    case 'us':
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    case 'eu':
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    case 'iso':
    default:
      return date.toISOString().split('T')[0];
  }
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSV(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = String(value);

  // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Build CSV header row based on options
 */
function buildHeader(options: CsvExportOptions): string[] {
  const headers = ['Date', 'Lab Name', 'Biomarker', 'Value', 'Unit'];

  if (options.includeReferenceRanges !== false) {
    headers.push('Reference Low', 'Reference High');
  }

  if (options.includeConfidence) {
    headers.push('Confidence');
  }

  return headers;
}

/**
 * Build a CSV row for a test value
 */
function buildRow(
  labResult: LabResult,
  testValue: TestValue,
  biomarkerName: string,
  options: CsvExportOptions
): string[] {
  const row = [
    formatDate(labResult.date, options.dateFormat),
    labResult.labName,
    biomarkerName,
    String(testValue.value),
    testValue.unit,
  ];

  if (options.includeReferenceRanges !== false) {
    row.push(
      testValue.referenceRangeLow !== undefined ? String(testValue.referenceRangeLow) : '',
      testValue.referenceRangeHigh !== undefined ? String(testValue.referenceRangeHigh) : ''
    );
  }

  if (options.includeConfidence) {
    row.push(testValue.confidence !== undefined ? String(testValue.confidence) : '');
  }

  return row;
}

/**
 * Filter lab results based on options
 */
function filterResults(
  results: LabResultForExport[],
  options: CsvExportOptions
): LabResultForExport[] {
  return results.filter((result) => {
    // Date range filter
    if (options.startDate && result.labResult.date < options.startDate) {
      return false;
    }
    if (options.endDate && result.labResult.date > options.endDate) {
      return false;
    }
    return true;
  });
}

/**
 * Filter test values based on options
 */
function filterTestValues(testValues: TestValue[], options: CsvExportOptions): TestValue[] {
  if (!options.biomarkerIds || options.biomarkerIds.length === 0) {
    return testValues;
  }

  return testValues.filter((tv) => options.biomarkerIds!.includes(tv.biomarkerId));
}

/**
 * Export lab results to CSV format
 */
export function exportToCsv(
  results: LabResultForExport[],
  options: CsvExportOptions = {}
): string {
  // Filter results
  const filteredResults = filterResults(results, options);

  // Build header
  const header = buildHeader(options);
  const rows: string[][] = [header];

  // Build data rows
  for (const result of filteredResults) {
    const filteredTestValues = filterTestValues(result.testValues, options);

    for (const testValue of filteredTestValues) {
      const biomarkerName = result.biomarkerNames.get(testValue.biomarkerId) || 'Unknown';
      const row = buildRow(result.labResult, testValue, biomarkerName, options);
      rows.push(row);
    }
  }

  // Convert to CSV string
  return rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
}

/**
 * Generate a filename for the CSV export
 */
export function generateCsvFilename(options: CsvExportOptions = {}): string {
  const now = new Date();
  const dateStr = formatDate(now, 'iso');

  let filename = `hemoio-export-${dateStr}`;

  if (options.startDate || options.endDate) {
    if (options.startDate) {
      filename += `-from-${formatDate(options.startDate, 'iso')}`;
    }
    if (options.endDate) {
      filename += `-to-${formatDate(options.endDate, 'iso')}`;
    }
  }

  return `${filename}.csv`;
}

/**
 * Trigger download of CSV content
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
