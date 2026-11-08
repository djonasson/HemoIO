/**
 * TrendsView Component
 *
 * Main container for the trends visualization page.
 * Displays biomarker trends, statistics, and comparisons.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconBook, IconChartLine, IconAlertCircle, IconTrendingUp } from '@tabler/icons-react';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
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
import { buildTrendLines } from '@services/statistics/trendLines';
import { trendCode } from '@data/loinc/display';
import { useCatalog } from '@contexts/useCatalog';
import { notePreview } from '@services/notes';
import { isWithinDays } from '@/utils/localDate';
import { MeasurementNotesDialog } from './MeasurementNotesDialog';
import { PreferredUnitSelect } from './PreferredUnitSelect';

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
  /** Date of the data point to highlight, when the value itself is not known */
  highlightDate?: Date;
  /** The value to show and highlight: the view opens on the line it is on */
  highlightTestValueId?: number;
  /** Show a biomarker's page in the biomarker dictionary */
  onOpenReference?: (biomarkerKey: string) => void;
}

/** Why some of a test's values are on lines of their own */
function elsewhereMessage(elsewhere: { count: number; units: string[] }, unit: string): string {
  const one = elsewhere.count === 1;
  const recorded = elsewhere.units.map((other) => (other ? `in ${other}` : 'with no unit')).join(', ');
  const target = unit ? `converted to ${unit}` : "compared with this line's values, which have no unit";
  return `${elsewhere.count} ${one ? 'value' : 'values'} recorded ${recorded} ${
    one ? 'is' : 'are'
  } shown on ${one ? 'a line of its own' : 'lines of their own'}: ${
    one ? 'it' : 'they'
  } cannot be ${target}.`;
}

/**
 * TrendsView component
 */
export function TrendsView({
  onNavigateToImport,
  onNavigateToAlerts,
  initialBiomarkerKey,
  highlightDate,
  highlightTestValueId,
  onOpenReference,
}: TrendsViewProps = {}) {
  const catalog = useCatalog();
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

  // Every line of a test: its notes are filed under its trend code, its
  // preferred unit under its test key
  const trendLines = useMemo(
    () => buildTrendLines(catalog, results, unitPreferences),
    [catalog, results, unitPreferences]
  );

  // A test opened from elsewhere: the line its value is on, which is a line
  // of its own for a value whose unit does not convert; else the test's line
  const initialLine = useMemo(() => {
    if (highlightTestValueId !== undefined) {
      for (const line of trendLines.values()) {
        if (line.dataPoints.some((point) => point.testValueId === highlightTestValueId)) return line.key;
      }
    }
    return initialBiomarkerKey ? trendCode(catalog, initialBiomarkerKey) : undefined;
  }, [catalog, trendLines, initialBiomarkerKey, highlightTestValueId]);

  // State: the line chosen here; until one is, the line opened on (its
  // values may still be loading)
  const [chosenLine, setChosenLine] = useState<string | null | undefined>(undefined);
  const selectedBiomarkerId = chosenLine === undefined ? (initialLine ?? null) : chosenLine;
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareMarkers, setCompareMarkers] = useState<string[]>([]);

  const selectedLine = selectedBiomarkerId ? trendLines.get(selectedBiomarkerId) : undefined;
  const selectedTest = selectedBiomarkerId ? (selectedLine?.trendCode ?? selectedBiomarkerId) : null;

  // Get notes for selected biomarker
  const selectedBiomarkerNotes = useMemo(() => {
    if (!selectedTest) return [];
    return getNotesForBiomarker(selectedTest);
  }, [selectedTest, getNotesForBiomarker]);

  // Handle note creation for selected biomarker
  const handleCreateNote = useCallback(
    async (content: string, tags: string[]) => {
      if (!selectedTest) return;
      await createNote({
        biomarkerKey: selectedTest,
        content,
        tags,
      });
    },
    [selectedTest, createNote]
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
      if (!selectedTest || selectedPoint?.testValueId === undefined) return;
      await createNote({
        biomarkerKey: selectedTest,
        testValueId: selectedPoint.testValueId,
        labResultId: selectedPoint.labResultId,
        content,
        tags,
      });
    },
    [selectedTest, selectedPoint, createNote]
  );

  // Build biomarker options for dropdown
  const biomarkerOptions = useMemo((): BiomarkerOption[] => {
    const options: BiomarkerOption[] = [];

    for (const line of trendLines.values()) {
      options.push({
        value: line.key,
        label: line.name,
        category: line.classLabel,
        dataPointCount: line.dataPoints.length,
      });
    }

    return options.sort((a, b) => b.dataPointCount - a.dataPointCount);
  }, [trendLines]);

  // Get selected biomarker data
  const selectedBiomarkerData = useMemo(() => {
    if (!selectedBiomarkerId) return null;
    return trendLines.get(selectedBiomarkerId) || null;
  }, [selectedBiomarkerId, trendLines]);

  const showUnitChoice = (selectedBiomarkerData?.unitOptions.length ?? 0) > 1;
  // Only LOINC tests have a reference page
  const referenceButton =
    onOpenReference && selectedBiomarkerData?.isLoincTest ? (
      <Button
        variant="light"
        size="xs"
        leftSection={<IconBook size={14} aria-hidden />}
        onClick={() => onOpenReference(selectedBiomarkerData.trendCode)}
        aria-label={`View reference for ${selectedBiomarkerData.testName}`}
      >
        View reference
      </Button>
    ) : null;

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
    setChosenLine(null);
    setStartDate(null);
    setEndDate(null);
  }, []);

  const selectedTestKey = selectedLine?.testKey;
  const handlePreferredUnitChange = useCallback(
    (unit: string) => {
      if (!selectedTestKey) return;
      setPreferredUnit(selectedTestKey, unit).catch((err: unknown) =>
        notifySaveFailed('Preferred unit not saved', err)
      );
    },
    [selectedTestKey, setPreferredUnit]
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
        const biomarkerData = trendLines.get(id);
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
  }, [compareMarkers, trendLines, startDate, endDate]);

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
          onBiomarkerChange={setChosenLine}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onReset={handleReset}
          onCompare={handleOpenCompare}
          showCompareButton={biomarkerOptions.length >= 2}
        />
        {selectedBiomarkerData && (showUnitChoice || referenceButton) && (
          <Box mt="sm">
            {showUnitChoice ? (
              <PreferredUnitSelect
                // A new biomarker starts with its own unit in the search
                key={selectedBiomarkerId}
                biomarkerName={selectedBiomarkerData.name}
                units={selectedBiomarkerData.unitOptions}
                value={selectedBiomarkerData.unit}
                onChange={handlePreferredUnitChange}
                // In the unit input's row, where the error below cannot move it
                aside={referenceButton}
              />
            ) : (
              referenceButton
            )}
          </Box>
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
          {selectedBiomarkerData && selectedBiomarkerData.elsewhere.count > 0 && (
            <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
              {elsewhereMessage(selectedBiomarkerData.elsewhere, selectedBiomarkerData.unit)}
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
              // The highlight marks the opened value, so only on its line
              highlightTestValueId={
                selectedBiomarkerId === initialLine ? highlightTestValueId : undefined
              }
              highlightDate={
                selectedBiomarkerId === initialLine && highlightTestValueId === undefined
                  ? highlightDate
                  : undefined
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
              // A fresh editor per biomarker: a draft saved after switching would go to the new one
              key={selectedBiomarkerId}
              title={`Notes for ${selectedBiomarkerData?.testName || 'Biomarker'}`}
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
                interval: selectedPoint.interval,
                censored: selectedPoint.censored,
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
