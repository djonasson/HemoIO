/**
 * TrendsView Component
 *
 * Main container for the trends visualization page.
 * Displays biomarker trends, statistics, and comparisons.
 */

import { useState, useMemo, useCallback } from 'react';
import { Stack, Paper, Title, Alert, Center, Loader, Text, Modal, Button, Group, MultiSelect } from '@mantine/core';
import { IconChartLine, IconAlertCircle, IconTrendingUp } from '@tabler/icons-react';
import { useLabResults } from '@hooks/useLabResults';
import { useAlerts } from '@hooks/useAlerts';
import { useNotes } from '@hooks/useNotes';
import { TrendChart } from './TrendChart';
import { TrendChartControls, type BiomarkerOption } from './TrendChartControls';
import { TrendStatistics } from './TrendStatistics';
import { MultiMarkerChart, type MarkerData } from './MultiMarkerChart';
import { NotesSection } from '@components/notes';
import {
  analyzeTrend,
  type TrendDataPoint,
} from '@services/statistics/trendAnalysis';
import { findBiomarker } from '@data/biomarkers/dictionary';
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
}

/**
 * TrendsView component
 */
export function TrendsView({ onNavigateToImport }: TrendsViewProps = {}) {
  const { results, isLoading, error } = useLabResults();
  const { alerts } = useAlerts();
  const {
    createNote,
    updateNote,
    deleteNote,
    getNotesForBiomarker,
  } = useNotes();

  // State
  const [selectedBiomarkerId, setSelectedBiomarkerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareMarkers, setCompareMarkers] = useState<string[]>([]);

  // Get notes for selected biomarker
  const selectedBiomarkerNotes = useMemo(() => {
    if (!selectedBiomarkerId) return [];
    return getNotesForBiomarker(parseInt(selectedBiomarkerId));
  }, [selectedBiomarkerId, getNotesForBiomarker]);

  // Handle note creation for selected biomarker
  const handleCreateNote = useCallback(
    async (content: string, tags: string[]) => {
      if (!selectedBiomarkerId) return;
      await createNote({
        biomarkerId: parseInt(selectedBiomarkerId),
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

  // Build map of biomarker data
  const biomarkerDataMap = useMemo(() => {
    const map = new Map<number, {
      name: string;
      unit: string;
      category: BiomarkerCategory;
      dataPoints: TrendDataPoint[];
      labInfoMap: Map<number, { date: Date; labName: string }>;
    }>();

    for (const result of results) {
      for (const testValue of result.testValues) {
        if (typeof testValue.value !== 'number') continue;

        const biomarkerId = testValue.biomarkerId;
        if (!map.has(biomarkerId)) {
          const biomarkerDef = findBiomarker(testValue.rawText || '');
          map.set(biomarkerId, {
            name: biomarkerDef?.name || testValue.rawText || `Biomarker ${biomarkerId}`,
            unit: testValue.unit,
            category: biomarkerDef?.category || 'other',
            dataPoints: [],
            labInfoMap: new Map(),
          });
        }

        const entry = map.get(biomarkerId)!;
        entry.labInfoMap.set(testValue.labResultId, {
          date: result.date,
          labName: result.labName,
        });

        entry.dataPoints.push({
          date: result.date,
          value: testValue.value as number,
          unit: testValue.unit,
          status: testValue.status,
          referenceRange: {
            low: testValue.referenceRangeLow,
            high: testValue.referenceRangeHigh,
          },
          labName: result.labName,
        });
      }
    }

    // Sort data points by date for each biomarker
    for (const entry of map.values()) {
      entry.dataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    return map;
  }, [results]);

  // Build biomarker options for dropdown
  const biomarkerOptions = useMemo((): BiomarkerOption[] => {
    const options: BiomarkerOption[] = [];

    for (const [biomarkerId, data] of biomarkerDataMap.entries()) {
      options.push({
        value: biomarkerId.toString(),
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
    return biomarkerDataMap.get(parseInt(selectedBiomarkerId)) || null;
  }, [selectedBiomarkerId, biomarkerDataMap]);

  // Filter data points by date range
  const filteredDataPoints = useMemo(() => {
    if (!selectedBiomarkerData) return [];

    let points = [...selectedBiomarkerData.dataPoints];

    if (startDate) {
      points = points.filter((p) => p.date >= startDate);
    }
    if (endDate) {
      points = points.filter((p) => p.date <= endDate);
    }

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
        const biomarkerData = biomarkerDataMap.get(parseInt(id));
        if (!biomarkerData) return null;

        let points = [...biomarkerData.dataPoints];
        if (startDate) {
          points = points.filter((p) => p.date >= startDate);
        }
        if (endDate) {
          points = points.filter((p) => p.date <= endDate);
        }

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
          <Title order={2}>Trends</Title>
        </Group>
        {alerts.length > 0 && (
          <Text size="sm" c="dimmed">
            {alerts.filter((a) => a.type !== 'improvement').length} alerts
          </Text>
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
          <Paper p="md" withBorder>
            <TrendChart
              dataPoints={filteredDataPoints}
              biomarkerName={selectedBiomarkerData?.name || ''}
              unit={selectedBiomarkerData?.unit || ''}
              referenceRange={referenceRange}
              trendDirection={trendAnalysis?.direction}
              height={350}
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
    </Stack>
  );
}
