/**
 * Analysis Step Component
 *
 * Shows each file's analysis: its progress while it runs, and its outcome.
 */

import { useCallback } from 'react';
import {
  Box,
  Stack,
  Group,
  Button,
  Text,
  Progress,
  Paper,
  List,
  ThemeIcon,
  Alert,
  Badge,
  Loader,
} from '@mantine/core';
import {
  IconCheck,
  IconX,
  IconAlertCircle,
  IconArrowLeft,
  IconFileAnalytics,
  IconRefresh,
} from '@tabler/icons-react';
import { FileName } from './FileName';
import { manualEntryResult } from './manualEntry';
import type { MatchedBiomarker, DuplicateConflict } from '../../services/analysis/LabReportAnalyzer';
import type { FileAnalysisState } from '@hooks/useFileAnalysis';

/**
 * Analysis result for a single file
 */
export interface AnalysisResult {
  /** File ID */
  fileId: string;
  /** File name */
  fileName: string;
  /** Whether analysis succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Extracted biomarkers */
  biomarkers: MatchedBiomarker[];
  /** Lab date */
  labDate?: string;
  /** Lab name */
  labName?: string;
  /** Overall confidence */
  confidence: number;
  /** Warnings from analysis */
  warnings: string[];
  /** Duplicate biomarker conflicts */
  duplicateConflicts?: DuplicateConflict[];
  /** Values are typed in by the user, not extracted */
  manualEntry?: boolean;
}

/**
 * Props for AnalysisStep
 */
export interface AnalysisStepProps {
  /** Every file's analysis, in upload order */
  fileStates: FileAnalysisState[];
  /** The finished analyses, in upload order */
  results: AnalysisResult[];
  /** Whether a file is still waiting for or in its analysis */
  isProcessing: boolean;
  /** 0 to 100, over all files */
  overallProgress: number;
  /** Analyse a failed file again */
  onRetry: (fileId: string) => void;
  /** Callback when analysis is complete */
  onComplete: (results: AnalysisResult[]) => void;
  /** Callback to go back */
  onBack: () => void;
}

/**
 * Analysis Step - the progress and outcome of each file's analysis
 */
export function AnalysisStep({
  fileStates,
  results,
  isProcessing,
  overallProgress,
  onRetry,
  onComplete,
  onBack,
}: AnalysisStepProps): React.JSX.Element {
  const unfinishedCount = fileStates.filter(
    (f) => f.status === 'pending' || f.status === 'processing'
  ).length;

  // Calculate summary statistics
  const successCount = results.filter((r) => r.success).length;
  const errorCount = results.filter((r) => !r.success).length;
  const totalBiomarkers = results.reduce(
    (sum, r) => sum + r.biomarkers.length,
    0
  );

  // Handle continue button
  const handleContinue = useCallback(() => {
    const successfulResults = results.filter((r) => r.success);
    if (successfulResults.length > 0) {
      onComplete(successfulResults);
    }
  }, [results, onComplete]);

  // Files without values: the user types those values in on the review step
  const hasNoValues = (r: AnalysisResult) => !r.success || r.biomarkers.length === 0;
  const filesWithoutValues = results.filter(hasNoValues);
  const enterManually = useCallback(() => {
    onComplete(
      results.map((r) => (hasNoValues(r) ? manualEntryResult(r) : r))
    );
  }, [results, onComplete]);

  // Get status icon
  const getStatusIcon = (status: FileAnalysisState['status']) => {
    switch (status) {
      case 'success':
        return (
          <ThemeIcon color="green" size={24} radius="xl">
            <IconCheck size={16} />
          </ThemeIcon>
        );
      case 'error':
        return (
          <ThemeIcon color="red" size={24} radius="xl">
            <IconX size={16} />
          </ThemeIcon>
        );
      case 'processing':
        return <Loader size="sm" />;
      default:
        return (
          <ThemeIcon color="gray" size={24} radius="xl">
            <IconFileAnalytics size={16} />
          </ThemeIcon>
        );
    }
  };

  return (
    <Stack gap="lg">
      {/* Overall progress */}
      <Paper p="md" withBorder>
        <Text fw={500} mb="sm">
          Overall Progress
        </Text>
        <Progress
          value={overallProgress}
          size="lg"
          radius="xl"
          animated={isProcessing}
        />
        <Text size="sm" c="dimmed" mt="xs">
          {isProcessing
            ? `Processing ${unfinishedCount} file(s)...`
            : 'Processing complete'}
        </Text>
      </Paper>

      {/* File list with status */}
      <List spacing="sm" size="sm" center>
        {fileStates.map((file) => (
          <List.Item key={file.id} icon={getStatusIcon(file.status)}>
            <Group justify="space-between" wrap="nowrap">
              <Box miw={0}>
                <FileName name={file.name} size="sm" />
                {file.stage && file.status === 'processing' && (
                  // Announced, so screen-reader users hear when a file waits
                  <Text size="xs" c="dimmed" aria-live="polite">
                    {file.stage}
                  </Text>
                )}
                {file.error && (
                  <Text size="xs" c="red">
                    {file.error}
                  </Text>
                )}
              </Box>
              {file.status === 'error' && !isProcessing && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => onRetry(file.id)}
                  aria-label={`Retry ${file.name}`}
                >
                  Retry
                </Button>
              )}
              {file.status === 'processing' && (
                <Progress
                  value={file.progress}
                  size="sm"
                  w={100}
                  radius="xl"
                />
              )}
            </Group>
          </List.Item>
        ))}
      </List>

      {/* Summary when complete */}
      {!isProcessing && (
        <>
          {successCount > 0 && (
            <Alert
              icon={<IconCheck size={16} />}
              title="Analysis Complete"
              color="green"
            >
              Successfully extracted {totalBiomarkers} biomarker values from{' '}
              {successCount} file(s).
            </Alert>
          )}

          {errorCount > 0 && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Some Files Failed"
              color="orange"
            >
              {errorCount} file(s) could not be processed. You can retry a failed
              file, or continue with the successful files.
            </Alert>
          )}

          {successCount === 0 && (
            <Alert
              icon={<IconX size={16} />}
              title="Analysis Failed"
              color="red"
            >
              No files could be processed. Retry them, choose other files, or type
              the values in yourself.
            </Alert>
          )}
        </>
      )}

      {/* One choice for all files without values: none is left behind */}
      {!isProcessing && filesWithoutValues.length > 0 && (
        <Group justify="center">
          <Button variant="light" onClick={enterManually}>
            Enter values manually
          </Button>
          <Text size="xs" c="dimmed" miw={0} style={{ overflowWrap: 'anywhere' }}>
            {filesWithoutValues.length === 1
              ? `${filesWithoutValues[0].fileName} has no values yet`
              : `${filesWithoutValues.length} files have no values yet`}
          </Text>
        </Group>
      )}

      {/* Action buttons */}
      <Group justify="space-between" mt="xl">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </Button>
        <Button
          onClick={handleContinue}
          disabled={isProcessing || successCount === 0}
        >
          Review Results
          {successCount > 0 && (
            <Badge ml="xs" size="sm" variant="light">
              {successCount}
            </Badge>
          )}
        </Button>
      </Group>
    </Stack>
  );
}
