/**
 * TrendsView Component
 *
 * Main container for the trends visualization page.
 * Displays biomarker trends, statistics, and comparisons.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Stack, Paper, Title, Alert, Center, Loader, Text, Modal, Button, Group, MultiSelect } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChartLine, IconAlertCircle, IconTrendingUp } from '@tabler/icons-react';
import { useLabResults } from '@hooks/useLabResults';
import { useAlerts } from '@hooks/useAlerts';
import { useNotes } from '@hooks/useNotes';
import { usePreferences } from '@hooks/usePreferences';
import { TrendChart } from './TrendChart';
import { TrendChartControls, type BiomarkerOption } from './TrendChartControls';
import { TrendStatistics } from './TrendStatistics';
import { MultiMarkerChart, type MarkerData } from './MultiMarkerChart';
import { NotesSection } from '@components/notes';
import {
  analyzeTrend,
  type TrendDataPoint,
} from '@services/statistics/trendAnalysis';
import { getBiomarkerDisplayName, getBiomarkerForTestValue } from '@data/biomarkers/dictionary';
import { convertMeasurement, preferredUnitOptions, resolveDisplayUnit } from '@services/units';
import { notePreview } from '@services/notes';
import { isWithinDays } from '@/utils/localDate';
import { MeasurementNotesDialog } from './MeasurementNotesDialog';
import { PreferredUnitSelect } from './PreferredUnitSelect';
import type { BiomarkerCategory } from '@/types';

/**
 * Chart colors for multi-marker comparison
 */
const CHART_COLORS = [
  '#228be6',
  '#40c057',
  '#fa5252',
  '#fab005',
  '#7950f2',
  '#20c997',
];

/**
 * Props for TrendsView
 */
export interface TrendsViewProps {
  /** Callback when user wants to navigate to import */
  onNavigateToImport?: () => void;
  /** Callback when user wants to see the Alerts view */
  onNavigateToAlerts?: () => void;
  /** Biomarker to show when the view opens */
  initialBiomarkerKey?: string;
  /** Date of the data point to highlight */
  highlightDate?: Date;
}

/**
 * TrendsView component
 */
/** Why some of a biomarker's values are missing from its chart */
function excludedValuesMessage(excluded: { count: number; units: string[] }, unit: string): string {
  const one = excluded.count === 1;
  return `${excluded.count} ${one ? 'value' : 'values'} recorded in ${excluded.units.join(', ')} ${
    one ? 'is' : 'are'
  } not shown: ${one ? 'it' : 'they'} cannot be converted to ${unit}.`;
}

export function TrendsView({
  onNavigateToImport,
  onNavigateToAlerts,
  initialBiomarkerKey,
  highlightDate,
}: TrendsViewProps = {}) {
  const { results, isLoading, error } = useLabResults();
  const { unacknowledgedCount: alertCount } = useAlerts();
  const { unitPreferences, setPreferredUnit } = usePreferences();
  const {
    createNote,
    updateNote,
    deleteNote,
    getNotesForBiomarker,
    getNotesForTestValue,
  } = useNotes();

  // State
  const [selectedBiomarkerId, setSelectedBiomarkerId] = useState<string | null>(
    initialBiomarkerKey ?? null
  );
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareMarkers, setCompareMarkers] = useState<string[]>([]);

  // Get notes for selected biomarker
  const selectedBiomarkerNotes = useMemo(() => {
    if (!selectedBiomarkerId) return [];
    return getNotesForBiomarker(selectedBiomarkerId);
  }, [selectedBiomarkerId, getNotesForBiomarker]);

  // Handle note creation for selected biomarker
  const handleCreateNote = useCallback(
    async (content: string, tags: string[]) => {
      if (!selectedBiomarkerId) return;
      await createNote({
        biomarkerKey: selectedBiomarkerId,
        content,
        tags,
      });
    },
    [selectedBiomarkerId, createNote]
  );

  // Handle note update
  const handleUpdateNote = useCallback(
    async (id: number, content: string, tags: string[]) => {
      await updateNote(id, { content, tags });
    },
    [updateNote]
  );

  // Handle note deletion
  const handleDeleteNote = useCallback(
    async (id: number) => {
      await deleteNote(id);
    },
    [deleteNote]
  );

  const [selectedPoint, setSelectedPoint] = useState<TrendDataPoint | null>(null);

  // Opened from elsewhere (an alert or a note): move keyboard focus here
  // once, when the heading first appears (it is not rendered while loading)
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusPending = useRef(initialBiomarkerKey !== undefined);
  useEffect(() => {
    if (focusPending.current && headingRef.current) {
      headingRef.current.focus();
      focusPending.current = false;
    }
  }, [isLoading]);

  // Newest note per measurement, for the chart markers and tooltip
  const notePreviews = useMemo(() => {
    const previews: Record<number, string> = {};
    for (const note of selectedBiomarkerNotes) {
      if (note.testValueId !== undefined && previews[note.testValueId] === undefined) {
        previews[note.testValueId] = notePreview(note.content);
      }
    }
    return previews;
  }, [selectedBiomarkerNotes]);

  const handleCreateMeasurementNote = useCallback(
    async (content: string, tags: string[]) => {
      if (!selectedBiomarkerId || selectedPoint?.testValueId === undefined) return;
      await createNote({
        biomarkerKey: selectedBiomarkerId,
        testValueId: selectedPoint.testValueId,
        labResultId: selectedPoint.labResultId,
        content,
        tags,
      });
    },
    [selectedBiomarkerId, selectedPoint, createNote]
  );

  // Build map of biomarker data with unit conversion to canonical units
  const biomarkerDataMap = useMemo(() => {
    const map = new Map<string, {
      name: string;
      unit: string;
      unitOptions: string[];
      category: BiomarkerCategory;
      dataPoints: TrendDataPoint[];
      /** Values left off the chart: their unit cannot be converted to the chart's */
      excluded: { count: number; units: string[] };
    }>();

    for (const result of results) {
      for (const testValue of result.testValues) {
        if (typeof testValue.value !== 'number') continue;

        const biomarkerKey = testValue.biomarkerKey;

        if (!map.has(biomarkerKey)) {
          const biomarkerDef = getBiomarkerForTestValue(testValue);
          // The preferred unit when the biomarker offers it, else its standard
          // unit; biomarkers outside the dictionary keep their first unit
          map.set(biomarkerKey, {
            name: getBiomarkerDisplayName(testValue),
            unit: resolveDisplayUnit(biomarkerDef, unitPreferences[biomarkerKey]) ?? testValue.unit,
            unitOptions: biomarkerDef ? preferredUnitOptions(biomarkerDef) : [],
            category: biomarkerDef?.category || 'other',
            dataPoints: [],
            excluded: { count: 0, units: [] },
          });
        }

        const entry = map.get(biomarkerKey)!;

        // Convert to the biomarker's chart unit; values that cannot be
        // converted keep the unit they were measured in
        const converted = convertMeasurement(
          entry.name,
          {
            value: testValue.value,
            unit: testValue.unit,
            referenceRangeLow: testValue.referenceRangeLow,
            referenceRangeHigh: testValue.referenceRangeHigh,
          },
          entry.unit
        );

        entry.dataPoints.push({
          date: result.date,
          value: converted.value,
          unit: converted.unit,
          status: testValue.status,
          referenceRange: converted.referenceRange,
          labName: result.labName,
          testValueId: testValue.id,
          labResultId: testValue.labResultId,
        });
      }
    }

    for (const entry of map.values()) {
      // One chart, one scale: a value that could not be converted to the
      // chart's unit would be read on the wrong scale and skew the statistics
      const inChartUnit = entry.dataPoints.filter((p) => p.unit === entry.unit);
      const others = entry.dataPoints.filter((p) => p.unit !== entry.unit);
      const otherUnits = [...new Set(others.map((p) => p.unit))];
      if (inChartUnit.length === 0 && otherUnits.length === 1) {
        // All recorded in one unit the chart unit cannot convert: chart them in it
        entry.unit = otherUnits[0];
      } else {
        entry.dataPoints = inChartUnit;
        entry.excluded = { count: others.length, units: otherUnits };
      }
      entry.dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    return map;
  }, [results, unitPreferences]);

  // Build biomarker options for dropdown
  const biomarkerOptions = useMemo((): BiomarkerOption[] => {
    const options: BiomarkerOption[] = [];

    for (const [biomarkerKey, data] of biomarkerDataMap.entries()) {
      options.push({
        value: biomarkerKey,
        label: data.name,
        category: data.category,
        dataPointCount: data.dataPoints.length,
      });
    }

    return options.sort((a, b) => b.dataPointCount - a.dataPointCount);
  }, [biomarkerDataMap]);

  // Get selected biomarker data
  const selectedBiomarkerData = useMemo(() => {
    if (!selectedBiomarkerId) return null;
    return biomarkerDataMap.get(selectedBiomarkerId) || null;
  }, [selectedBiomarkerId, biomarkerDataMap]);

  // Filter data points by date range
  const filteredDataPoints = useMemo(() => {
    if (!selectedBiomarkerData) return [];

    let points = [...selectedBiomarkerData.dataPoints];

    points = points.filter((p) => isWithinDays(p.date, startDate, endDate));

    return points;
  }, [selectedBiomarkerData, startDate, endDate]);

  // Calculate trend analysis
  const trendAnalysis = useMemo(() => {
    if (filteredDataPoints.length < 2) return null;
    try {
      return analyzeTrend(filteredDataPoints);
    } catch {
      return null;
    }
  }, [filteredDataPoints]);

  // Get reference range from first data point
  const referenceRange = useMemo(() => {
    if (filteredDataPoints.length === 0) return undefined;
    return filteredDataPoints[0].referenceRange;
  }, [filteredDataPoints]);

  // Handle reset
  const handleReset = useCallback(() => {
    setSelectedBiomarkerId(null);
    setStartDate(null);
    setEndDate(null);
  }, []);

  const handlePreferredUnitChange = useCallback(
    (unit: string) => {
      if (!selectedBiomarkerId) return;
      setPreferredUnit(selectedBiomarkerId, unit).catch(() => {
        notifications.show({
          title: 'Preferred unit not saved',
          message: 'Your choice could not be saved. Try again.',
          color: 'red',
        });
      });
    },
    [selectedBiomarkerId, setPreferredUnit]
  );

  // Handle compare mode
  const handleOpenCompare = useCallback(() => {
    if (selectedBiomarkerId) {
      setCompareMarkers([selectedBiomarkerId]);
    }
    setCompareModalOpen(true);
  }, [selectedBiomarkerId]);

  // Get data for multi-marker comparison
  const compareMarkerData = useMemo((): MarkerData[] => {
    return compareMarkers
      .map((id, index) => {
        const biomarkerData = biomarkerDataMap.get(id);
        if (!biomarkerData) return null;

        let points = [...biomarkerData.dataPoints];
        points = points.filter((p) => isWithinDays(p.date, startDate, endDate));

        return {
          name: biomarkerData.name,
          unit: biomarkerData.unit,
          dataPoints: points,
          color: CHART_COLORS[index % CHART_COLORS.length],
        };
      })
      .filter((m): m is MarkerData => m !== null);
  }, [compareMarkers, biomarkerDataMap, startDate, endDate]);

  // Loading state
  if (isLoading) {
    return (
      <Center h={400}>
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading trend data...</Text>
        </Stack>
      </Center>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="Error loading data">
        {error}
      </Alert>
    );
  }

  // Empty state
  if (results.length === 0) {
    return (
      <Center h={400}>
        <Stack align="center" gap="md">
          <IconTrendingUp size={48} color="gray" />
          <Title order={3} c="dimmed">
            No Lab Results Yet
          </Title>
          <Text c="dimmed" ta="center">
            Import lab results to see trends and analytics.
          </Text>
          {onNavigateToImport && (
            <Button onClick={onNavigateToImport} leftSection={<IconChartLine size={16} />}>
              Import Lab Results
            </Button>
          )}
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="xs">
          <IconChartLine size={24} />
          <Title order={2} ref={headingRef} tabIndex={-1}>
            Trends
          </Title>
        </Group>
        {alertCount > 0 && (
          <Button
            variant="subtle"
            size="xs"
            onClick={onNavigateToAlerts}
            disabled={!onNavigateToAlerts}
          >
            View {alertCount} {alertCount === 1 ? 'alert' : 'alerts'}
          </Button>
        )}
      </Group>

      <Paper p="md" withBorder>
        <TrendChartControls
          biomarkerOptions={biomarkerOptions}
          selectedBiomarkerId={selectedBiomarkerId}
          onBiomarkerChange={setSelectedBiomarkerId}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onReset={handleReset}
          onCompare={handleOpenCompare}
          showCompareButton={biomarkerOptions.length >= 2}
        />
        {selectedBiomarkerData && selectedBiomarkerData.unitOptions.length > 1 && (
          <Group mt="sm">
            <PreferredUnitSelect
              // A new biomarker starts with its own unit in the search
              key={selectedBiomarkerId}
              biomarkerName={selectedBiomarkerData.name}
              units={selectedBiomarkerData.unitOptions}
              value={selectedBiomarkerData.unit}
              onChange={handlePreferredUnitChange}
            />
          </Group>
        )}
      </Paper>

      {!selectedBiomarkerId ? (
        <Paper p="xl" withBorder>
          <Center>
            <Stack align="center" gap="md">
              <IconChartLine size={48} color="gray" />
              <Text size="lg" c="dimmed" ta="center">
                Select a biomarker to view its trend
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Choose from {biomarkerOptions.length} available biomarkers
              </Text>
            </Stack>
          </Center>
        </Paper>
      ) : selectedBiomarkerData && filteredDataPoints.length === 0 ? (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          No data found for the selected date range. Try adjusting the filters.
        </Alert>
      ) : (
        <>
          {selectedBiomarkerData && selectedBiomarkerData.excluded.count > 0 && (
            <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
              {excludedValuesMessage(selectedBiomarkerData.excluded, selectedBiomarkerData.unit)}
            </Alert>
          )}
          <Paper p="md" withBorder>
            <TrendChart
              dataPoints={filteredDataPoints}
              biomarkerName={selectedBiomarkerData?.name || ''}
              unit={selectedBiomarkerData?.unit || ''}
              referenceRange={referenceRange}
              trendDirection={trendAnalysis?.direction}
              height={350}
              // The highlight marks the opened alert's value, so only on its biomarker
              highlightDate={
                selectedBiomarkerId === initialBiomarkerKey ? highlightDate : undefined
              }
              notePreviews={notePreviews}
              onPointSelect={setSelectedPoint}
            />
          </Paper>

          {trendAnalysis && (
            <Paper p="md" withBorder>
              <TrendStatistics
                statistics={trendAnalysis.statistics}
                rateOfChange={trendAnalysis.rateOfChange}
                referenceRange={referenceRange}
              />
            </Paper>
          )}

          {/* Notes for selected biomarker */}
          <Paper p="md" withBorder>
            <NotesSection
              title={`Notes for ${selectedBiomarkerData?.name || 'Biomarker'}`}
              notes={selectedBiomarkerNotes}
              onCreateNote={handleCreateNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              editorPlaceholder={`Add a note about ${selectedBiomarkerData?.name || 'this biomarker'}...`}
            />
          </Paper>
        </>
      )}

      {/* Compare Modal */}
      <Modal
        opened={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="Compare Biomarkers"
        size="xl"
      >
        <Stack gap="md">
          <MultiSelect
            label="Select biomarkers to compare"
            placeholder="Choose up to 4 biomarkers"
            data={biomarkerOptions.map((opt) => ({
              value: opt.value,
              label: `${opt.label} (${opt.dataPointCount} values)`,
            }))}
            value={compareMarkers}
            onChange={(value) => setCompareMarkers(value.slice(0, 4))}
            maxValues={4}
            searchable
            clearable
          />

          {compareMarkerData.length > 0 && (
            <MultiMarkerChart markers={compareMarkerData} height={400} />
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCompareModalOpen(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      <MeasurementNotesDialog
        measurement={
          selectedPoint?.testValueId !== undefined
            ? {
                testValueId: selectedPoint.testValueId,
                labResultId: selectedPoint.labResultId,
                value: selectedPoint.value,
                unit: selectedPoint.unit,
                date: selectedPoint.date,
                status: selectedPoint.status,
                labName: selectedPoint.labName,
              }
            : null
        }
        notes={
          selectedPoint?.testValueId !== undefined
            ? getNotesForTestValue(selectedPoint.testValueId)
            : []
        }
        onClose={() => setSelectedPoint(null)}
        onCreateNote={handleCreateMeasurementNote}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
      />
    </Stack>
  );
}
