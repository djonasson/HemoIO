/**
 * Review Step Component
 *
 * Review and edit extracted biomarker values before saving.
 */

import { useState, useCallback } from 'react';
import {
  Stack,
  Group,
  Button,
  Text,
  Paper,
  Table,
  Badge,
  ActionIcon,
  TextInput,
  NumberInput,
  Tooltip,
  Alert,
  Accordion,
  ThemeIcon,
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
} from '@tabler/icons-react';
import type { AnalysisResult } from './AnalysisStep';
import type { MatchedBiomarker, DuplicateConflict } from '../../services/analysis/LabReportAnalyzer';

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
  /** Callback when review is complete */
  onComplete: (results: ReviewedResult[]) => void;
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
}: ReviewStepProps) {
  const [editingBiomarker, setEditingBiomarker] = useState<{
    resultIndex: number;
    biomarkerIndex: number;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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
        value: 0,
        unit: '',
        confidence: 1.0,
        isExactMatch: false,
        normalizedUnit: '',
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
    (r) => r.duplicateConflicts?.filter((c) => !c.valuesMatch) || []
  );

  // Total biomarkers
  const totalBiomarkers = reviewedResults.reduce(
    (sum, r) => sum + r.editedBiomarkers.length,
    0
  );

  // Handle continue
  const handleContinue = useCallback(() => {
    // Find biomarkers with missing required fields
    const invalidBiomarkers: string[] = [];

    reviewedResults.forEach((r) => {
      r.editedBiomarkers.forEach((b, index) => {
        const missing: string[] = [];
        if (!b.name) missing.push('name');
        if (b.value === undefined || b.value === null) missing.push('value');
        if (!b.unit) missing.push('unit');

        if (missing.length > 0) {
          const biomarkerLabel = b.name || `Biomarker #${index + 1}`;
          invalidBiomarkers.push(`${biomarkerLabel} in "${r.fileName}" is missing: ${missing.join(', ')}`);
        }
      });
    });

    if (invalidBiomarkers.length > 0) {
      setValidationError(`Please fix the following issues:\n${invalidBiomarkers.slice(0, 5).join('\n')}${invalidBiomarkers.length > 5 ? `\n...and ${invalidBiomarkers.length - 5} more` : ''}`);
      return;
    }

    setValidationError(null);
    onComplete(reviewedResults);
  }, [reviewedResults, onComplete]);

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
              <Group justify="space-between" wrap="nowrap" pr="md">
                <div>
                  <Text fw={500}>{result.fileName}</Text>
                  <Text size="sm" c="dimmed">
                    {result.editedBiomarkers.length} biomarker(s)
                  </Text>
                </div>
                <Badge color={getConfidenceColor(result.confidence)}>
                  {getConfidenceLabel(result.confidence)} confidence
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                {/* Lab info */}
                <Group grow>
                  <TextInput
                    label="Lab Date"
                    leftSection={<IconCalendar size={16} />}
                    placeholder="YYYY-MM-DD"
                    value={result.editedLabDate || result.labDate || ''}
                    onChange={(e) =>
                      updateLabDate(resultIndex, e.target.value || undefined)
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
                </Group>

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

                {/* Biomarker table */}
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Biomarker</Table.Th>
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

                      // Determine row background color based on issues
                      let rowBg: string | undefined;
                      if (biomarker.hasDuplicateConflict) {
                        rowBg = 'var(--mantine-color-orange-light)';
                      } else if (biomarker.confidence < 0.7) {
                        rowBg = 'var(--mantine-color-yellow-light)';
                      }

                      return (
                        <Table.Tr key={bioIndex} bg={rowBg}>
                          <Table.Td>
                            {isEditing ? (
                              <TextInput
                                size="xs"
                                value={biomarker.name}
                                onChange={(e) =>
                                  updateBiomarker(resultIndex, bioIndex, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Biomarker name"
                              />
                            ) : (
                              <Group gap="xs">
                                <Text size="sm">{biomarker.name}</Text>
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
                                {biomarker.dictionaryMatch && !biomarker.hasDuplicateConflict && (
                                  <Tooltip label="Matched to dictionary">
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
                            {isEditing ? (
                              <NumberInput
                                size="xs"
                                value={biomarker.value}
                                onChange={(value) =>
                                  updateBiomarker(resultIndex, bioIndex, {
                                    value: Number(value) || 0,
                                  })
                                }
                                decimalScale={2}
                                placeholder="Value"
                              />
                            ) : (
                              <Text size="sm">{biomarker.value}</Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {isEditing ? (
                              <TextInput
                                size="xs"
                                value={biomarker.unit}
                                onChange={(e) =>
                                  updateBiomarker(resultIndex, bioIndex, {
                                    unit: e.target.value,
                                  })
                                }
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
                                <NumberInput
                                  size="xs"
                                  value={biomarker.referenceRange?.low ?? ''}
                                  onChange={(value) =>
                                    updateBiomarker(resultIndex, bioIndex, {
                                      referenceRange: {
                                        ...biomarker.referenceRange,
                                        low: value === '' ? undefined : Number(value),
                                        high: biomarker.referenceRange?.high,
                                        unit: biomarker.referenceRange?.unit || biomarker.unit,
                                      },
                                    })
                                  }
                                  decimalScale={2}
                                  placeholder="Low"
                                  w={70}
                                  allowNegative={false}
                                />
                                <Text size="xs">-</Text>
                                <NumberInput
                                  size="xs"
                                  value={biomarker.referenceRange?.high ?? ''}
                                  onChange={(value) =>
                                    updateBiomarker(resultIndex, bioIndex, {
                                      referenceRange: {
                                        ...biomarker.referenceRange,
                                        low: biomarker.referenceRange?.low,
                                        high: value === '' ? undefined : Number(value),
                                        unit: biomarker.referenceRange?.unit || biomarker.unit,
                                      },
                                    })
                                  }
                                  decimalScale={2}
                                  placeholder="High"
                                  w={70}
                                  allowNegative={false}
                                />
                              </Group>
                            ) : biomarker.referenceRange ? (
                              <Text size="sm">
                                {biomarker.referenceRange.low ?? '?'} -{' '}
                                {biomarker.referenceRange.high ?? '?'}
                              </Text>
                            ) : (
                              <Text size="sm" c="dimmed">
                                —
                              </Text>
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
      {validationError && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Cannot Continue"
          color="red"
          withCloseButton
          onClose={() => setValidationError(null)}
        >
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
            {validationError}
          </Text>
        </Alert>
      )}

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
