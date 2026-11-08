/**
 * CSV Export Service
 *
 * Exports lab results to CSV format.
 */

import { isUnknownKey } from '@data/loinc/keys';
import type { LabResult, TestValue } from '@/types';
import { isWithinDays } from '@/utils/localDate';
import { formatTestValue } from '@/utils/formatTestValue';

/**
 * Options for CSV export
 */
export interface CsvExportOptions {
  /** Filter by start date */
  startDate?: Date;
  /** Filter by end date */
  endDate?: Date;
  /** Only values saved under these keys; none given exports every value, an empty list none */
  biomarkerKeys?: string[];
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
  biomarkerNames: Map<string, string>;
}

/**
 * Format a date based on the specified format
 */
function formatDate(date: Date, format: 'iso' | 'us' | 'eu' = 'iso'): string {
  // A result without a valid date is exported with an empty Date field
  if (Number.isNaN(date.getTime())) return '';
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
  if (/[,"\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * A field spreadsheet apps keep as text: Excel, LibreOffice and Google Sheets
 * read a bare LOINC code such as 2345-7 as a date, but evaluate ="2345-7" to
 * the text itself. The field stays valid CSV (RFC 4180).
 */
function asText(value: string): string {
  return `="${value}"`;
}

/** A LOINC code: digits, a hyphen and its check digit */
const LOINC_CODE = /^\d{1,7}-\d$/;

/** Characters a spreadsheet reads a field starting with as a formula */
const FORMULA_START = /^[=+\-@\t\r]/;

/** A plain number, such as -5 or 1.2e3, which a spreadsheet reads as a number, not a formula */
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * A text field a spreadsheet does not run: text from a report or a backup
 * starting as a formula would ("=HYPERLINK(...)") is prefixed with ' so it
 * reads as text (OWASP's advice on CSV injection). Plain numbers stay numbers.
 */
function textField(value: string): string {
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value.trim()) ? `'${value}` : value;
}

/** The LOINC column: a code as text a spreadsheet keeps; any other key as plain text */
function loincField(key: string): string {
  return LOINC_CODE.test(key) ? asText(key) : textField(key);
}

/**
 * The Value column: an interval as its ends, as text a spreadsheet keeps
 * (it reads a bare 5-10 as a date); a qualitative result as printed
 */
function valueField(testValue: TestValue): string {
  const shown = formatTestValue(testValue);
  return testValue.numericValueType === 'interval' && shown.includes('-') ? asText(shown) : textField(shown);
}

/**
 * Build CSV header row based on options
 */
function buildHeader(options: CsvExportOptions): string[] {
  const headers = ['Date', 'Lab Name', 'Biomarker', 'LOINC', 'Value', 'Unit'];

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
    textField(labResult.labName),
    textField(biomarkerName),
    // The value's LOINC code; none for a value saved as not a LOINC test
    isUnknownKey(testValue.biomarkerKey) ? '' : loincField(testValue.biomarkerKey),
    valueField(testValue),
    textField(testValue.unit),
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
  // The range is in days: a result anywhere in the end day is included
  return results.filter((result) =>
    isWithinDays(result.labResult.date, options.startDate ?? null, options.endDate ?? null)
  );
}

/**
 * Filter test values based on options
 */
function filterTestValues(testValues: TestValue[], options: CsvExportOptions): TestValue[] {
  if (!options.biomarkerKeys) {
    return testValues;
  }

  return testValues.filter((tv) => options.biomarkerKeys!.includes(tv.biomarkerKey));
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
      const biomarkerName = result.biomarkerNames.get(testValue.biomarkerKey) || 'Unknown';
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
