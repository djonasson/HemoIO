/**
 * Review Step Component
 *
 * Review and edit extracted biomarker values before saving.
 */

import { useState, useCallback, useContext, useMemo } from 'react';
import {
  Box,
  Stack,
  Group,
  SimpleGrid,
  Button,
  Text,
  Paper,
  Table,
  Badge,
  ActionIcon,
  TextInput,
  Autocomplete,
  Tooltip,
  Alert,
  Accordion,
  ThemeIcon,
  NativeSelect,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconPlus,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
  IconCalendar,
  IconBuilding,
  IconCopy,
  IconTestPipe,
} from '@tabler/icons-react';
import type { AnalysisResult } from './AnalysisStep';
import type { MatchedBiomarker, DuplicateConflict } from '../../services/analysis/LabReportAnalyzer';
import { DateInput } from '@mantine/dates';
import { normalizeLabDate, reviewedLabDate } from '@/utils/labDate';
import { formatReviewedRange, formatReviewedValue } from '@/utils/formatReviewedValue';
import {
  applyBiomarkerName,
  applyBiomarkerUnit,
  chooseTestForWording,
  unitOptionsFor,
} from '@services/analysis/reviewEdits';
import { loincTestLabel, sampleLabel, testDescription } from '@data/loinc/display';
import { splitPrintedSample } from '@components/common/printedSample';
import { PreferencesContext } from '@hooks/usePreferences';
import { useCatalog } from '@contexts/useCatalog';
import { missingFields, needsTest, planSave } from '@services/analysis/reviewedSave';
import { NOT_A_LOINC_TEST } from './notLoincTest';
import { SavedAsCell } from './SavedAsCell';
import { ContinueProblems } from './ContinueProblems';
import { heldQualitative } from '@services/ai';
import { COMPARATOR_SIGNS, LAB_FLAG_TEXT } from '@/utils/formatTestValue';
import { LabFlagMark } from '@components/common/LabFlagMark';
import { NumberField } from './NumberField';
import { FileName } from './FileName';
import type { Catalog } from '@data/loinc/catalog';
import type { CensoredComparator, LabFlag } from '@/types';

/**
 * The LOINC code with LOINC's name for it, as the license asks, and
 * HemoIO's description of the test when it has one
 */
function getBiomarkerTooltipContent(biomarker: MatchedBiomarker, catalog: Catalog): string | null {
  const test = biomarker.loincCode ? catalog.test(biomarker.loincCode) : undefined;
  if (!test) return biomarker.loincCode ? `LOINC ${biomarker.loincCode}` : null;
  return [loincTestLabel(test), testDescription(catalog, test.code)].filter(Boolean).join('\n');
}

/** The sample of a value: its LOINC test's, else the one its name gives; '—' for none */
function specimenLabel(biomarker: MatchedBiomarker, catalog: Catalog): string {
  const test = biomarker.loincCode ? catalog.test(biomarker.loincCode) : undefined;
  if (test) return sampleLabel(test);
  return splitPrintedSample(biomarker.name).sample ?? '—';
}

/**
 * Get display name - strip specimen suffix if present since it's shown in column
 */
function getDisplayName(biomarker: MatchedBiomarker): string {
  return splitPrintedSample(biomarker.name).name;
}

/**
 * Reviewed result with edited biomarkers
 */
export interface ReviewedResult extends AnalysisResult {
  /** Edited biomarker values */
  editedBiomarkers: MatchedBiomarker[];
  /** Edited lab date */
  editedLabDate?: string;
  /** Edited lab name */
  editedLabName?: string;
  /** Duplicate biomarker conflicts (inherited from AnalysisResult, explicitly declared for clarity) */
  duplicateConflicts?: DuplicateConflict[];
}

/** The comparator choices of a value: measured ("="), or censored */
/** The lab's marks as printed, with what each says; or none */
const LAB_FLAG_OPTIONS = [
  { value: '', label: 'No mark' },
  ...(Object.keys(LAB_FLAG_TEXT) as LabFlag[]).map((flag) => ({ value: flag, label: `${LAB_FLAG_TEXT[flag].mark} (${flag})` })),
];

const COMPARATOR_OPTIONS = [
  { value: '', label: '=' },
  ...Object.entries(COMPARATOR_SIGNS).map(([value, label]) => ({ value, label })),
];

/**
 * An interval's ends and the value saved for it, their midpoint: none
 * while either end is missing, so the value must be filled in again
 */
function intervalEnds(
  low: number | undefined,
  high: number | undefined
): Pick<MatchedBiomarker, 'intervalLow' | 'intervalHigh' | 'value'> {
  return {
    intervalLow: low,
    intervalHigh: high,
    value: low !== undefined && high !== undefined ? (low + high) / 2 : NaN,
  };
}

/**
 * Props for ReviewStep
 */
export interface ReviewStepProps {
  /** Analysis results */
  results: AnalysisResult[];
  /** Current reviewed results */
  reviewedResults: ReviewedResult[];
  /** Callback when review changes */
  onReviewChange: (results: ReviewedResult[]) => void;
  /** Called when the review is complete and the import may continue */
  onComplete: () => void;
  /** Callback to go back */
  onBack: () => void;
}

/**
 * Confidence badge color based on score
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return 'green';
  if (confidence >= 0.7) return 'yellow';
  return 'red';
}

/**
 * Confidence label based on score
 */
function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'High';
  if (confidence >= 0.7) return 'Medium';
  return 'Low';
}

/**
 * Review Step - edit extracted values
 */
export function ReviewStep({
  reviewedResults,
  onReviewChange,
  onComplete,
  onBack,
}: ReviewStepProps): React.JSX.Element {
  const [editingBiomarker, setEditingBiomarker] = useState<{
    resultIndex: number;
    biomarkerIndex: number;
  } | null>(null);
  // What stops the import from continuing; null when nothing was tried
  const [problems, setProblems] = useState<string[] | null>(null);
  // Each Continue that finds problems lists them afresh, folded again
  const [continueAttempt, setContinueAttempt] = useState(0);
  const catalog = useCatalog();
  // The user's learned tests: an edited value is identified as the analyzer would
  const learned = useContext(PreferencesContext)?.learnedTests;

  // Update a biomarker value
  const updateBiomarker = useCallback(
    (
      resultIndex: number,
      biomarkerIndex: number,
      updates: Partial<MatchedBiomarker>
    ) => {
      const newResults = [...reviewedResults];
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        editedBiomarkers: newResults[resultIndex].editedBiomarkers.map(
          (b, i) => (i === biomarkerIndex ? { ...b, ...updates } : b)
        ),
      };
      onReviewChange(newResults);
    },
    [reviewedResults, onReviewChange]
  );

  // Remove a biomarker
  const removeBiomarker = useCallback(
    (resultIndex: number, biomarkerIndex: number) => {
      const newResults = [...reviewedResults];
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        editedBiomarkers: newResults[resultIndex].editedBiomarkers.filter(
          (_, i) => i !== biomarkerIndex
        ),
      };
      // Rows are kept by position: the row being edited moves up with the
      // rows below the removed one, and stops being edited if it is removed
      setEditingBiomarker((editing) => {
        if (editing?.resultIndex !== resultIndex || editing.biomarkerIndex < biomarkerIndex) return editing;
        if (editing.biomarkerIndex === biomarkerIndex) return null;
        return { resultIndex, biomarkerIndex: editing.biomarkerIndex - 1 };
      });
      onReviewChange(newResults);
    },
    [reviewedResults, onReviewChange]
  );

  // Add a new biomarker
  const addBiomarker = useCallback(
    (resultIndex: number) => {
      const newResults = [...reviewedResults];
      const newBiomarker: MatchedBiomarker = {
        name: '',
        // No number until one is typed: 0 is a reading of its own
        value: NaN,
        unit: '',
        confidence: 1.0,
        candidates: [],
      };
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        editedBiomarkers: [
          ...newResults[resultIndex].editedBiomarkers,
          newBiomarker,
        ],
      };
      onReviewChange(newResults);
      setEditingBiomarker({
        resultIndex,
        biomarkerIndex: newResults[resultIndex].editedBiomarkers.length - 1,
      });
    },
    [reviewedResults, onReviewChange]
  );

  // Update lab date
  const updateLabDate = useCallback(
    (resultIndex: number, date: string | undefined) => {
      const newResults = [...reviewedResults];
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        editedLabDate: date,
      };
      onReviewChange(newResults);
    },
    [reviewedResults, onReviewChange]
  );

  // Update lab name
  const updateLabName = useCallback(
    (resultIndex: number, name: string | undefined) => {
      const newResults = [...reviewedResults];
      newResults[resultIndex] = {
        ...newResults[resultIndex],
        editedLabName: name,
      };
      onReviewChange(newResults);
    },
    [reviewedResults, onReviewChange]
  );

  // Count low confidence values
  const lowConfidenceCount = reviewedResults.reduce(
    (sum, r) =>
      sum + r.editedBiomarkers.filter((b) => b.confidence < 0.7).length,
    0
  );

  // Count duplicate conflicts
  const duplicateConflictCount = reviewedResults.reduce(
    (sum, r) =>
      sum + r.editedBiomarkers.filter((b) => b.hasDuplicateConflict).length,
    0
  );

  // Get unique duplicate conflicts for display
  const allDuplicateConflicts = reviewedResults.flatMap(
    (r) => r.duplicateConflicts ?? []
  );

  // Total biomarkers
  const totalBiomarkers = reviewedResults.reduce(
    (sum, r) => sum + r.editedBiomarkers.length,
    0
  );

  // What the import saves, and the values it leaves out
  const plan = useMemo(() => planSave(reviewedResults, catalog), [reviewedResults, catalog]);
  const setAside = useMemo(
    () => new Map(plan.notSaved.map((value) => [value.biomarker, value])),
    [plan]
  );

  // Handle continue
  const handleContinue = useCallback(() => {
    // Find biomarkers with missing required fields
    const invalidBiomarkers: string[] = [];

    reviewedResults.forEach((r) => {
      r.editedBiomarkers.forEach((b, index) => {
        // One left out for another value of its line is not saved: no fix
        if (setAside.has(b)) return;
        const missing = missingFields(b, catalog);
        const biomarkerLabel = b.name || `Biomarker #${index + 1}`;
        if (missing.length > 0) {
          invalidBiomarkers.push(`${biomarkerLabel} in "${r.fileName}" is missing: ${missing.join(', ')}`);
        }
        if (needsTest(b)) {
          invalidBiomarkers.push(
            `${biomarkerLabel} in "${r.fileName}" needs a test: choose one or "${NOT_A_LOINC_TEST}"`
          );
        }
      });
    });

    // Without a date a result would be saved as today: ask for it instead
    // Files left without values are not saved, so they need no date
    const missingDates = plan.toSave
      .filter((r) => !reviewedLabDate(r))
      .map((r) => `Enter the lab date for "${r.fileName}"`);
    const problems = [...missingDates, ...invalidBiomarkers];

    if (problems.length > 0) {
      setProblems(problems);
      setContinueAttempt((attempt) => attempt + 1);
      return;
    }

    setProblems(null);
    onComplete();
  }, [reviewedResults, plan, setAside, catalog, onComplete]);

  return (
    <Stack gap="lg">
      {/* Summary */}
      <Paper p="md" withBorder>
        <Group justify="space-between">
          <div>
            <Text fw={500}>Review Extracted Values</Text>
            <Text size="sm" c="dimmed">
              {totalBiomarkers} biomarker(s) from {reviewedResults.length}{' '}
              file(s)
            </Text>
          </div>
          <Group gap="xs">
            {duplicateConflictCount > 0 && (
              <Tooltip label="Duplicate biomarkers with conflicting values">
                <Badge
                  color="orange"
                  variant="light"
                  leftSection={<IconCopy size={12} />}
                >
                  {duplicateConflictCount} conflicts
                </Badge>
              </Tooltip>
            )}
            {lowConfidenceCount > 0 && (
              <Tooltip label="Values that may need verification">
                <Badge
                  color="yellow"
                  variant="light"
                  leftSection={<IconAlertTriangle size={12} />}
                >
                  {lowConfidenceCount} low confidence
                </Badge>
              </Tooltip>
            )}
          </Group>
        </Group>
      </Paper>

      {/* Duplicate conflict warnings */}
      {allDuplicateConflicts.length > 0 && (
        <Alert
          icon={<IconCopy size={16} />}
          title="Duplicate Biomarkers Detected"
          color="orange"
          variant="light"
        >
          <Stack gap="xs">
            <Text size="sm">
              The following biomarkers appear multiple times with different values.
              Please review and remove the incorrect entries:
            </Text>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {allDuplicateConflicts.map((conflict, i) => (
                <li key={i}>
                  <Text size="sm" fw={500}>
                    {conflict.biomarkerName}:
                  </Text>
                  <Text size="xs" c="dimmed">
                    {conflict.message}
                  </Text>
                </li>
              ))}
            </ul>
          </Stack>
        </Alert>
      )}

      {/* Results by file */}
      <Accordion variant="separated" multiple defaultValue={['0']}>
        {reviewedResults.map((result, resultIndex) => (
          <Accordion.Item key={result.fileId} value={String(resultIndex)}>
            <Accordion.Control>
              {/* Too narrow for both side by side, the badge goes below the name */}
              <Group justify="space-between" gap="xs" pr="md">
                <Box style={{ flex: '1 1 14rem', minWidth: 0 }}>
                  <FileName name={result.fileName} />
                  <Text size="sm" c="dimmed">
                    {result.editedBiomarkers.length} biomarker(s)
                  </Text>
                </Box>
                {result.manualEntry ? (
                  <Badge color="gray" variant="light" style={{ flexShrink: 0 }}>
                    Entered manually
                  </Badge>
                ) : (
                  // Never squeezed: the name wraps, or the badge goes below it
                  <Badge color={getConfidenceColor(result.confidence)} style={{ flexShrink: 0 }}>
                    {getConfidenceLabel(result.confidence)} confidence
                  </Badge>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                {/* Lab info */}
                {/* Side by side when there is room, stacked on a phone */}
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <DateInput
                    label="Lab Date"
                    leftSection={<IconCalendar size={16} />}
                    placeholder="YYYY-MM-DD"
                    valueFormat="YYYY-MM-DD"
                    // Typed dates use the same YYYY-MM-DD form
                    dateParser={(input) => normalizeLabDate(input)}
                    value={reviewedLabDate(result)}
                    // A cleared date stays empty ('') instead of reverting to the detected one
                    onChange={(value) => updateLabDate(resultIndex, normalizeLabDate(value) ?? '')}
                    clearable
                    // Exposes the calendar as a dialog, as date pickers elsewhere are
                    popoverProps={{ withRoles: true }}
                    clearButtonProps={{ 'aria-label': 'Clear lab date' }}
                    // A date the report wrote unclearly is shown so it can be typed in
                    description={
                      result.editedLabDate === undefined &&
                      result.labDate &&
                      !normalizeLabDate(result.labDate)
                        ? `The report says "${result.labDate}"`
                        : undefined
                    }
                  />
                  <TextInput
                    label="Lab Name"
                    leftSection={<IconBuilding size={16} />}
                    placeholder="Laboratory name"
                    value={result.editedLabName || result.labName || ''}
                    onChange={(e) =>
                      updateLabName(resultIndex, e.target.value || undefined)
                    }
                  />
                </SimpleGrid>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <Alert
                    icon={<IconInfoCircle size={16} />}
                    title="Analysis Notes"
                    color="blue"
                    variant="light"
                  >
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {result.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </Alert>
                )}

                {/* Biomarker table: scrolls on its own on narrow screens, never the page */}
                <Table.ScrollContainer minWidth={900}>
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Biomarker</Table.Th>
                        <Table.Th miw={180}>Saved as</Table.Th>
                        <Table.Th>Specimen</Table.Th>
                        <Table.Th>Value</Table.Th>
                        <Table.Th>Unit</Table.Th>
                        <Table.Th>Reference Range</Table.Th>
                        <Table.Th>Method</Table.Th>
                        <Table.Th>Confidence</Table.Th>
                        <Table.Th w={100}>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {result.editedBiomarkers.map((biomarker, bioIndex) => {
                        const isEditing =
                          editingBiomarker?.resultIndex === resultIndex &&
                          editingBiomarker?.biomarkerIndex === bioIndex;
                        // The printed result, while the number is still the one it reads as
                        const printedResult = heldQualitative(biomarker);

                        // Determine row background color based on issues
                        let rowBg: string | undefined;
                        if (biomarker.hasDuplicateConflict) {
                          rowBg = 'var(--mantine-color-orange-light)';
                        } else if (biomarker.confidence < 0.7) {
                          rowBg = 'var(--mantine-color-yellow-light)';
                        }

                        const tooltipContent = getBiomarkerTooltipContent(biomarker, catalog);

                        return (
                          <Table.Tr key={bioIndex} bg={rowBg}>
                            <Table.Td>
                              {isEditing ? (
                                <TextInput
                                  size="xs"
                                  value={biomarker.name}
                                  onChange={(e) =>
                                    // Its test is read again from the new name
                                    updateBiomarker(
                                      resultIndex,
                                      bioIndex,
                                      applyBiomarkerName(biomarker, e.currentTarget.value, catalog, learned)
                                    )
                                  }
                                  placeholder="Biomarker name"
                                  aria-label="Biomarker name"
                                />
                              ) : (
                                <Group gap="xs">
                                  {tooltipContent ? (
                                    <Tooltip
                                      label={tooltipContent}
                                      multiline
                                      w={300}
                                      withArrow
                                      // LOINC's name and the description on lines of their own
                                      styles={{ tooltip: { whiteSpace: 'pre-line' } }}
                                      events={{ hover: true, focus: true, touch: false }}
                                    >
                                      <Text
                                        size="sm"
                                        // Focusable, so keyboard users reach the tooltip
                                        tabIndex={0}
                                        style={{ cursor: 'help', textDecoration: 'underline dotted' }}
                                      >
                                        {getDisplayName(biomarker)}
                                      </Text>
                                    </Tooltip>
                                  ) : (
                                    <Text size="sm">{getDisplayName(biomarker)}</Text>
                                  )}
                                  {biomarker.hasDuplicateConflict && (
                                    <Tooltip label="Duplicate with conflicting value - please review">
                                      <ThemeIcon
                                        size="xs"
                                        color="orange"
                                        variant="light"
                                      >
                                        <IconCopy size={10} />
                                      </ThemeIcon>
                                    </Tooltip>
                                  )}
                                  {biomarker.loincCode && !biomarker.hasDuplicateConflict && (
                                    <Tooltip label="Identified as a LOINC test">
                                      <ThemeIcon
                                        size="xs"
                                        color="green"
                                        variant="light"
                                      >
                                        <IconCheck size={10} />
                                      </ThemeIcon>
                                    </Tooltip>
                                  )}
                                </Group>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <SavedAsCell
                                biomarker={biomarker}
                                onChoose={(code) =>
                                  // The same wording in the other files takes the choice too
                                  onReviewChange(
                                    chooseTestForWording(reviewedResults, { resultIndex, biomarkerIndex: bioIndex }, code)
                                  )
                                }
                              />
                              {setAside.get(biomarker)?.reason === 'twin' && (
                                <Text size="xs" c="dimmed" mt={4}>
                                  <Text span fw={700} size="xs" inherit>
                                    Not saved:
                                  </Text>{' '}
                                  its unit cannot be read, and another {getDisplayName(biomarker)} value
                                  is saved. To keep this one, choose its test or &quot;{NOT_A_LOINC_TEST}&quot;.
                                </Text>
                              )}
                              {setAside.get(biomarker)?.savedAs && (
                                <Text size="xs" c="dimmed" mt={4}>
                                  <Text span fw={700} size="xs" inherit>
                                    Not saved:
                                  </Text>{' '}
                                  the same measurement as {formatReviewedValue(setAside.get(biomarker)!.savedAs!)}{' '}
                                  {setAside.get(biomarker)?.savedAs?.unit}, which is saved.
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Group gap={4}>
                                <IconTestPipe size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
                                <Text size="sm" c="dimmed">
                                  {specimenLabel(biomarker, catalog)}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              {isEditing ? (
                                biomarker.isInterval ? (
                                  <Group gap="xs" wrap="nowrap">
                                    <NumberField
                                      size="xs"
                                      value={biomarker.intervalLow}
                                      onValueChange={(low) =>
                                        updateBiomarker(resultIndex, bioIndex, intervalEnds(low, biomarker.intervalHigh))
                                      }
                                      placeholder="Low"
                                      w={60}
                                    />
                                    <Text size="xs">-</Text>
                                    <NumberField
                                      size="xs"
                                      value={biomarker.intervalHigh}
                                      onValueChange={(high) =>
                                        updateBiomarker(resultIndex, bioIndex, intervalEnds(biomarker.intervalLow, high))
                                      }
                                      placeholder="High"
                                      w={60}
                                    />
                                  </Group>
                                ) : (
                                  <Group gap="xs" wrap="nowrap">
                                    {!printedResult && (
                                      // A censored value's comparator ("< 10"); "=" for a measured one
                                      <NativeSelect
                                        size="xs"
                                        aria-label="Comparator"
                                        data={COMPARATOR_OPTIONS}
                                        value={biomarker.censored ?? ''}
                                        onChange={(e) =>
                                          updateBiomarker(resultIndex, bioIndex, {
                                            censored: (e.currentTarget.value || undefined) as CensoredComparator | undefined,
                                          })
                                        }
                                        w={56}
                                      />
                                    )}
                                    <NumberField
                                      size="xs"
                                      value={biomarker.value}
                                      onValueChange={(value) =>
                                        // A cleared number is missing, not 0
                                        updateBiomarker(resultIndex, bioIndex, { value: value ?? NaN })
                                      }
                                      placeholder="Value"
                                    />
                                    {printedResult && (
                                      <Text size="xs" c="dimmed">
                                        {printedResult.text}
                                      </Text>
                                    )}
                                    {/* The lab's mark, which the user may change or clear */}
                                    <NativeSelect
                                      size="xs"
                                      aria-label="Lab's mark"
                                      data={LAB_FLAG_OPTIONS}
                                      value={biomarker.labFlag ?? ''}
                                      onChange={(e) =>
                                        updateBiomarker(resultIndex, bioIndex, {
                                          labFlag: (e.currentTarget.value || undefined) as LabFlag | undefined,
                                        })
                                      }
                                      w={110}
                                    />
                                  </Group>
                                )
                              ) : (
                                <Group gap={4} wrap="nowrap">
                                  <Text size="sm">{formatReviewedValue(biomarker)}</Text>
                                  {biomarker.labFlag && <LabFlagMark flag={biomarker.labFlag} />}
                                </Group>
                              )}
                              {!Number.isFinite(biomarker.value) && !biomarker.isInterval && biomarker.rawValue && (
                                // A value that could not be read: what the report printed, to type it from
                                <Text size="xs" c="dimmed">
                                  Printed: “{biomarker.rawValue}”
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              {isEditing ? (
                                <Autocomplete
                                  size="xs"
                                  value={biomarker.unit}
                                  onChange={(unit) =>
                                    updateBiomarker(
                                      resultIndex,
                                      bioIndex,
                                      applyBiomarkerUnit(biomarker, unit, catalog, learned)
                                    )
                                  }
                                  data={unitOptionsFor(catalog, biomarker.loincCode)}
                                  placeholder="Unit"
                                  w={80}
                                />
                              ) : (
                                <Text size="sm">{biomarker.unit}</Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              {isEditing ? (
                                <Group gap="xs" wrap="nowrap">
                                  <NumberField
                                    size="xs"
                                    value={biomarker.referenceRange?.low}
                                    onValueChange={(low) =>
                                      updateBiomarker(resultIndex, bioIndex, {
                                        referenceRange: {
                                          ...biomarker.referenceRange,
                                          low,
                                        },
                                      })
                                    }
                                    placeholder="Low"
                                    w={70}
                                    allowNegative={false}
                                  />
                                  <Text size="xs">-</Text>
                                  <NumberField
                                    size="xs"
                                    value={biomarker.referenceRange?.high}
                                    onValueChange={(high) =>
                                      updateBiomarker(resultIndex, bioIndex, {
                                        referenceRange: {
                                          ...biomarker.referenceRange,
                                          high,
                                        },
                                      })
                                    }
                                    placeholder="High"
                                    w={70}
                                    allowNegative={false}
                                  />
                                </Group>
                              ) : (
                                <Text size="sm">{formatReviewedRange(biomarker) ?? '—'}</Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              {isEditing ? (
                                <TextInput
                                  size="xs"
                                  value={biomarker.method || ''}
                                  onChange={(e) =>
                                    updateBiomarker(resultIndex, bioIndex, {
                                      method: e.target.value || undefined,
                                    })
                                  }
                                  placeholder="Method"
                                  w={100}
                                />
                              ) : biomarker.method ? (
                                <Text size="sm">{biomarker.method}</Text>
                              ) : (
                                <Text size="sm" c="dimmed">
                                  —
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                size="sm"
                                color={getConfidenceColor(biomarker.confidence)}
                              >
                                {Math.round(biomarker.confidence * 100)}%
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                {isEditing ? (
                                  <ActionIcon
                                    size="sm"
                                    color="green"
                                    variant="subtle"
                                    onClick={() => setEditingBiomarker(null)}
                                    aria-label="Save changes"
                                  >
                                    <IconCheck size={14} />
                                  </ActionIcon>
                                ) : (
                                  <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    onClick={() =>
                                      setEditingBiomarker({
                                        resultIndex,
                                        biomarkerIndex: bioIndex,
                                      })
                                    }
                                    aria-label="Edit biomarker"
                                  >
                                    <IconEdit size={14} />
                                  </ActionIcon>
                                )}
                                <ActionIcon
                                  size="sm"
                                  color="red"
                                  variant="subtle"
                                  onClick={() =>
                                    removeBiomarker(resultIndex, bioIndex)
                                  }
                                  aria-label="Remove biomarker"
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>

                {/* Add biomarker button */}
                <Button
                  variant="light"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => addBiomarker(resultIndex)}
                  size="sm"
                >
                  Add Biomarker
                </Button>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      {/* Validation error */}
      {problems && <ContinueProblems key={continueAttempt} problems={problems} onClose={() => setProblems(null)} />}

      {/* Action buttons */}
      <Group justify="space-between" mt="xl">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
        >
          Back
        </Button>
        <Button onClick={handleContinue} disabled={totalBiomarkers === 0}>
          Continue to Confirm
        </Button>
      </Group>
    </Stack>
  );
}
