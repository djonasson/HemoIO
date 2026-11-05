/**
 * ExportDialog Component
 *
 * Modal dialog for exporting lab data to various formats.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  Stack,
  Group,
  Button,
  Select,
  MultiSelect,
  Text,
  Alert,
  Checkbox,
  Divider,
  Paper,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconDownload,
  IconFileTypeCsv,
  IconJson,
  IconAlertCircle,
} from '@tabler/icons-react';
import {
  exportToCsv,
  generateCsvFilename,
  downloadCsv,
  exportToJson,
  generateBackupFilename,
  downloadJson,
  type LabResultForExport,
  type ExportDataSources,
} from '@services/export';
import { toLocalDay } from '@/utils/localDate';

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Props for ExportDialog
 */
export interface ExportDialogProps {
  /** Whether the dialog is open */
  opened: boolean;
  /** Called when dialog should close */
  onClose: () => void;
  /** Lab results data for export */
  labResultsData: LabResultForExport[];
  /** Full data sources for JSON backup */
  fullDataSources: ExportDataSources;
  /** Available tests for filtering, each with the stored keys of its values */
  biomarkerOptions: { value: string; label: string; keys: string[] }[];
  /** While the data as it is now loads, the previous data must not be exported */
  isLoading?: boolean;
}

/**
 * Date range presets
 */
const DATE_RANGE_PRESETS = [
  { value: 'all', label: 'All Time' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
  { value: '180', label: 'Last 6 Months' },
  { value: '365', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

/**
 * Get date from preset value
 */
function getPresetStartDate(preset: string): Date | null {
  if (preset === 'all' || preset === 'custom') {
    return null;
  }
  const days = parseInt(preset, 10);
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Export dialog component
 */
export function ExportDialog({
  opened,
  onClose,
  labResultsData,
  fullDataSources,
  biomarkerOptions,
  isLoading = false,
}: ExportDialogProps): React.ReactNode {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [dateRangePreset, setDateRangePreset] = useState('all');
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [selectedBiomarkers, setSelectedBiomarkers] = useState<string[]>([]);
  const [includeReferenceRanges, setIncludeReferenceRanges] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Calculate effective date range
  const effectiveDateRange = useMemo(() => {
    if (dateRangePreset === 'custom') {
      return { start: customStartDate, end: customEndDate };
    }
    return { start: getPresetStartDate(dateRangePreset), end: null };
  }, [dateRangePreset, customStartDate, customEndDate]);

  // The chosen tests that still have values: data reloaded since the choice
  // may have none left for some of them
  const chosenOptions = useMemo(
    () => biomarkerOptions.filter((option) => selectedBiomarkers.includes(option.value)),
    [biomarkerOptions, selectedBiomarkers]
  );
  // The stored keys of the chosen tests' values; none chosen exports every test.
  // A choice none of whose tests has values left exports nothing, never every value.
  const selectedKeys = useMemo(
    () => (selectedBiomarkers.length > 0 ? chosenOptions.flatMap((option) => option.keys) : undefined),
    [chosenOptions, selectedBiomarkers]
  );
  const choiceGone = selectedBiomarkers.length > 0 && chosenOptions.length === 0;

  // Check if there's data to export
  const hasData = labResultsData.length > 0;

  // Calculate export preview counts
  const previewCounts = useMemo(() => {
    let filteredResults = labResultsData;

    // Apply date filter
    if (effectiveDateRange.start) {
      filteredResults = filteredResults.filter(
        (r) => r.labResult.date >= effectiveDateRange.start!
      );
    }
    if (effectiveDateRange.end) {
      filteredResults = filteredResults.filter(
        (r) => r.labResult.date <= effectiveDateRange.end!
      );
    }

    // Count test values
    let testValueCount = 0;
    for (const result of filteredResults) {
      const values = selectedKeys
        ? result.testValues.filter((tv) => selectedKeys.includes(tv.biomarkerKey))
        : result.testValues;
      testValueCount += values.length;
    }

    return {
      labResults: filteredResults.length,
      testValues: testValueCount,
    };
  }, [labResultsData, effectiveDateRange, selectedKeys]);

  // Handle export
  const handleExport = useCallback(async () => {
    setIsExporting(true);

    try {
      if (format === 'csv') {
        const csv = exportToCsv(labResultsData, {
          startDate: effectiveDateRange.start ?? undefined,
          endDate: effectiveDateRange.end ?? undefined,
          biomarkerKeys: selectedKeys,
          includeReferenceRanges,
        });
        const filename = generateCsvFilename({
          startDate: effectiveDateRange.start ?? undefined,
          endDate: effectiveDateRange.end ?? undefined,
        });
        downloadCsv(csv, filename);
      } else {
        const json = exportToJson(fullDataSources, { prettyPrint: true });
        const filename = generateBackupFilename();
        downloadJson(json, filename);
      }

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [
    format,
    labResultsData,
    fullDataSources,
    effectiveDateRange,
    selectedKeys,
    includeReferenceRanges,
    onClose,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (!isExporting) {
      onClose();
    }
  }, [isExporting, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Export Data"
      size="md"
      centered
    >
      <Stack gap="md">
        {!hasData && (
          <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
            No data to export. Import some lab results first.
          </Alert>
        )}

        {/* Format Selection */}
        <Select
          label="Export Format"
          value={format}
          onChange={(value) => setFormat(value as ExportFormat)}
          data={[
            {
              value: 'csv',
              label: 'CSV (Spreadsheet)',
            },
            {
              value: 'json',
              label: 'JSON (Full Backup)',
            },
          ]}
          leftSection={
            format === 'csv' ? (
              <IconFileTypeCsv size={16} />
            ) : (
              <IconJson size={16} />
            )
          }
          aria-label="Select export format"
        />

        {format === 'csv' && (
          <>
            <Divider label="Filter Options" labelPosition="center" />

            {/* Date Range */}
            <Select
              label="Date Range"
              value={dateRangePreset}
              onChange={(value) => setDateRangePreset(value || 'all')}
              data={DATE_RANGE_PRESETS}
              aria-label="Select date range"
            />

            {dateRangePreset === 'custom' && (
              <Group grow>
                <DatePickerInput
                  label="Start Date"
                  value={customStartDate}
                  onChange={(value) =>
                    setCustomStartDate(toLocalDay(value))
                  }
                  clearable
                  aria-label="Start date"
                />
                <DatePickerInput
                  label="End Date"
                  value={customEndDate}
                  onChange={(value) =>
                    setCustomEndDate(toLocalDay(value))
                  }
                  clearable
                  aria-label="End date"
                />
              </Group>
            )}

            {/* Biomarker Selection */}
            <MultiSelect
              label="Biomarkers"
              placeholder="All biomarkers"
              data={biomarkerOptions.map(({ value, label }) => ({ value, label }))}
              value={chosenOptions.map((option) => option.value)}
              onChange={setSelectedBiomarkers}
              clearable
              searchable
              aria-label="Select biomarkers to include"
            />

            {choiceGone && (
              <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                <Stack gap="xs" align="flex-start">
                  <Text size="sm">
                    The biomarkers you chose have no values now. Choose biomarkers again, or clear
                    the choice to export every biomarker.
                  </Text>
                  <Button size="xs" variant="light" onClick={() => setSelectedBiomarkers([])}>
                    Clear the choice
                  </Button>
                </Stack>
              </Alert>
            )}

            {/* Options */}
            <Checkbox
              label="Include reference ranges"
              checked={includeReferenceRanges}
              onChange={(e) => setIncludeReferenceRanges(e.currentTarget.checked)}
            />
          </>
        )}

        {format === 'json' && (
          <Text size="sm" c="dimmed">
            JSON export includes all lab results, test values, notes, and
            settings (excluding API keys). Use this for full backup and
            restore.
          </Text>
        )}

        {/* Preview */}
        <Paper p="sm" withBorder>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Export Preview
            </Text>
            {format === 'csv' ? (
              <>
                <Text size="sm" c="dimmed">
                  {previewCounts.labResults} lab result
                  {previewCounts.labResults !== 1 ? 's' : ''},{' '}
                  {previewCounts.testValues} test value
                  {previewCounts.testValues !== 1 ? 's' : ''}
                </Text>
              </>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  {fullDataSources.labResults.length} lab result
                  {fullDataSources.labResults.length !== 1 ? 's' : ''},{' '}
                  {fullDataSources.testValues.length} test value
                  {fullDataSources.testValues.length !== 1 ? 's' : ''},{' '}
                  {fullDataSources.userNotes.length} note
                  {fullDataSources.userNotes.length !== 1 ? 's' : ''}
                </Text>
              </>
            )}
          </Stack>
        </Paper>

        {/* Actions */}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={handleExport}
            loading={isExporting}
            disabled={!hasData || isLoading || (format === 'csv' && choiceGone)}
          >
            Export
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
