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
  IconTestPipe,
} from '@tabler/icons-react';
import type { AnalysisResult } from './AnalysisStep';
import type { MatchedBiomarker, DuplicateConflict } from '../../services/analysis/LabReportAnalyzer';
import { findBiomarker } from '../../data/biomarkers/dictionary';
import type { SpecimenType } from '../../types';

/**
 * Human-readable labels for specimen types
 */
const SPECIMEN_LABELS: Record<SpecimenType, string> = {
  'serum': 'Serum',
  'plasma': 'Plasma',
  'urine': 'Urine',
  'urine-24h': '24h Urine',
  'whole-blood': 'Whole Blood',
  'capillary': 'Capillary',
  'saliva': 'Saliva',
  'csf': 'CSF',
  'stool': 'Stool',
  'semen': 'Semen',
  'other': 'Other',
};

/**
 * Get human-readable specimen label
 */
function getSpecimenLabel(specimenType: SpecimenType | undefined): string {
  if (!specimenType) return '—';
  return SPECIMEN_LABELS[specimenType] || specimenType;
}

/**
 * Build tooltip content for biomarker with LOINC code and description
 */
function getBiomarkerTooltipContent(biomarker: MatchedBiomarker): string | null {
  const match = biomarker.dictionaryMatch;
  if (!match) return null;

  const parts: string[] = [];
  if (match.loincCode) {
    parts.push(`LOINC: ${match.loincCode}`);
  }
  if (match.description) {
    parts.push(match.description);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Specimen type patterns that can be extracted from biomarker names
 */
const SPECIMEN_PATTERNS: { pattern: RegExp; type: SpecimenType }[] = [
  { pattern: /\s*\(urine,?\s*24h?\)\s*$/i, type: 'urine-24h' },
  { pattern: /\s*\(24h?\s*urine\)\s*$/i, type: 'urine-24h' },
  { pattern: /\s*\(urine[^)]*\)\s*$/i, type: 'urine' },
  { pattern: /\s*\(plasma[^)]*\)\s*$/i, type: 'plasma' },
  { pattern: /\s*\(serum[^)]*\)\s*$/i, type: 'serum' },
  { pattern: /\s*\(siero[^)]*\)\s*$/i, type: 'serum' }, // Italian for serum
  { pattern: /\s*\(sangue[^)]*\)\s*$/i, type: 'whole-blood' }, // Italian for blood
  { pattern: /\s*\(whole[- ]?blood[^)]*\)\s*$/i, type: 'whole-blood' },
  { pattern: /\s*\(semen[^)]*\)\s*$/i, type: 'semen' },
  { pattern: /\s*\(liquido seminale[^)]*\)\s*$/i, type: 'semen' }, // Italian
  { pattern: /\s*\(csf[^)]*\)\s*$/i, type: 'csf' },
  { pattern: /\s*\(liquor[^)]*\)\s*$/i, type: 'csf' }, // Alternative name
  { pattern: /\s*\(saliva[^)]*\)\s*$/i, type: 'saliva' },
  { pattern: /\s*\(stool[^)]*\)\s*$/i, type: 'stool' },
  { pattern: /\s*\(feci[^)]*\)\s*$/i, type: 'stool' }, // Italian for stool
];

/**
 * Extract specimen type from biomarker name and return clean name
 */
function extractSpecimenFromName(name: string): { cleanName: string; extractedSpecimen?: SpecimenType } {
  for (const { pattern, type } of SPECIMEN_PATTERNS) {
    if (pattern.test(name)) {
      return {
        cleanName: name.replace(pattern, '').trim(),
        extractedSpecimen: type,
      };
    }
  }
  return { cleanName: name };
}

/**
 * Get specimen type - from dictionary match or extracted from name
 */
function getEffectiveSpecimen(biomarker: MatchedBiomarker): SpecimenType | undefined {
  // Prefer dictionary match
  if (biomarker.dictionaryMatch?.specimenType) {
    return biomarker.dictionaryMatch.specimenType;
  }
  // Fall back to extracting from name
  const { extractedSpecimen } = extractSpecimenFromName(biomarker.name);
  return extractedSpecimen;
}

/**
 * Get display name - strip specimen suffix if present since it's shown in column
 */
function getDisplayName(biomarker: MatchedBiomarker): string {
  const { cleanName } = extractSpecimenFromName(biomarker.name);
  return cleanName;
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
        // Check if unit is required - some biomarkers like pH are unitless
        if (!b.unit) {
          const biomarkerDef = findBiomarker(b.name || '');
          // Only require unit if biomarker is not found or has a non-empty canonical unit
          if (!biomarkerDef || biomarkerDef.canonicalUnit !== '') {
            missing.push('unit');
          }
        }

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

                      // Determine row background color based on issues
                      let rowBg: string | undefined;
                      if (biomarker.hasDuplicateConflict) {
                        rowBg = 'var(--mantine-color-orange-light)';
                      } else if (biomarker.confidence < 0.7) {
                        rowBg = 'var(--mantine-color-yellow-light)';
                      }

                      const tooltipContent = getBiomarkerTooltipContent(biomarker);

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
                                {tooltipContent ? (
                                  <Tooltip
                                    label={tooltipContent}
                                    multiline
                                    w={300}
                                    withArrow
                                  >
                                    <Text size="sm" style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
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
                            <Group gap={4}>
                              <IconTestPipe size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
                              <Text size="sm" c="dimmed">
                                {getSpecimenLabel(getEffectiveSpecimen(biomarker))}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            {isEditing ? (
                              biomarker.isInterval ? (
                                <Group gap="xs" wrap="nowrap">
                                  <NumberInput
                                    size="xs"
                                    value={biomarker.intervalLow ?? ''}
                                    onChange={(value) =>
                                      updateBiomarker(resultIndex, bioIndex, {
                                        intervalLow: value === '' ? undefined : Number(value),
                                        // Update the midpoint value as well
                                        value: value === '' || biomarker.intervalHigh === undefined
                                          ? biomarker.value
                                          : (Number(value) + biomarker.intervalHigh) / 2,
                                      })
                                    }
                                    decimalScale={2}
                                    placeholder="Low"
                                    w={60}
                                  />
                                  <Text size="xs">-</Text>
                                  <NumberInput
                                    size="xs"
                                    value={biomarker.intervalHigh ?? ''}
                                    onChange={(value) =>
                                      updateBiomarker(resultIndex, bioIndex, {
                                        intervalHigh: value === '' ? undefined : Number(value),
                                        // Update the midpoint value as well
                                        value: value === '' || biomarker.intervalLow === undefined
                                          ? biomarker.value
                                          : (biomarker.intervalLow + Number(value)) / 2,
                                      })
                                    }
                                    decimalScale={2}
                                    placeholder="High"
                                    w={60}
                                  />
                                </Group>
                              ) : (
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
                              )
                            ) : (
                              <Text size="sm">
                                {biomarker.isInterval && biomarker.intervalLow !== undefined && biomarker.intervalHigh !== undefined
                                  ? `${biomarker.intervalLow}-${biomarker.intervalHigh}`
                                  : biomarker.value}
                              </Text>
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
