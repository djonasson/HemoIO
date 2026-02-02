/**
 * Analysis Step Component
 *
 * Shows progress while documents are being processed and analyzed.
 */

import { useState, useEffect, useCallback } from 'react';
import {
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
} from '@tabler/icons-react';
import type { UploadedFile } from './UploadStep';
import { analyzeLabReport, AnalysisError } from '../../services/analysis';
import type { AnalysisResult as ServiceAnalysisResult } from '../../services/analysis';
import type { MatchedBiomarker } from '../../services/analysis/LabReportAnalyzer';

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
}

/**
 * File processing status
 */
interface FileStatus {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  stage?: string;
  error?: string;
}

/**
 * Props for AnalysisStep
 */
export interface AnalysisStepProps {
  /** Files to analyze */
  files: UploadedFile[];
  /** AI provider type */
  aiProvider: 'openai' | 'anthropic' | 'ollama';
  /** Function to get decrypted API key (not required for Ollama) */
  getApiKey: () => Promise<string | null>;
  /** AI model to use (provider-specific) */
  aiModel?: string;
  /** Callback when analysis is complete */
  onComplete: (results: AnalysisResult[]) => void;
  /** Callback to go back */
  onBack: () => void;
}

/**
 * Analysis Step - document processing with progress
 */
export function AnalysisStep({
  files,
  aiProvider,
  getApiKey,
  aiModel,
  onComplete,
  onBack,
}: AnalysisStepProps) {
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);
  const [overallProgress, setOverallProgress] = useState(0);

  // Initialize file statuses
  useEffect(() => {
    setFileStatuses(
      files.map((f) => ({
        id: f.id,
        name: f.file.name,
        status: 'pending',
        progress: 0,
      }))
    );
  }, [files]);

  // Update status for a file
  const updateFileStatus = useCallback(
    (id: string, updates: Partial<FileStatus>) => {
      setFileStatuses((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    []
  );

  // Process all files
  useEffect(() => {
    if (fileStatuses.length === 0) return;

    let cancelled = false;

    async function processFiles() {
      const analysisResults: AnalysisResult[] = [];

      // Get decrypted API key (not needed for Ollama)
      let apiKey: string | null = null;
      if (aiProvider !== 'ollama') {
        apiKey = await getApiKey();
        if (!apiKey && !cancelled) {
          // Handle missing API key
          for (const file of files) {
            analysisResults.push({
              fileId: file.id,
              fileName: file.file.name,
              success: false,
              error: 'API key not available',
              biomarkers: [],
              confidence: 0,
              warnings: [],
            });
            updateFileStatus(file.id, {
              status: 'error',
              progress: 100,
              error: 'API key not available',
            });
          }
          setResults(analysisResults);
          setIsProcessing(false);
          setOverallProgress(100);
          return;
        }
      }

      for (let i = 0; i < files.length; i++) {
        if (cancelled) break;

        const uploadedFile = files[i];
        updateFileStatus(uploadedFile.id, {
          status: 'processing',
          progress: 0,
          stage: 'Starting...',
        });

        try {
          const result: ServiceAnalysisResult = await analyzeLabReport(
            uploadedFile.file,
            {
              aiProvider,
              aiConfig: {
                apiKey: apiKey || '',
                model: aiModel,
              },
              onProgress: (stage, progress) => {
                if (!cancelled) {
                  updateFileStatus(uploadedFile.id, {
                    progress: progress * 100,
                    stage,
                  });

                  // Update overall progress
                  const baseProgress = (i / files.length) * 100;
                  const fileProgress = (progress / files.length) * 100;
                  setOverallProgress(baseProgress + fileProgress);
                }
              },
            }
          );

          analysisResults.push({
            fileId: uploadedFile.id,
            fileName: uploadedFile.file.name,
            success: true,
            biomarkers: result.matchedBiomarkers,
            labDate: result.labDate,
            labName: result.labName,
            confidence: result.overallConfidence,
            warnings: result.warnings,
          });

          updateFileStatus(uploadedFile.id, {
            status: 'success',
            progress: 100,
            stage: 'Complete',
          });
        } catch (error) {
          const errorMessage =
            error instanceof AnalysisError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Unknown error';

          analysisResults.push({
            fileId: uploadedFile.id,
            fileName: uploadedFile.file.name,
            success: false,
            error: errorMessage,
            biomarkers: [],
            confidence: 0,
            warnings: [],
          });

          updateFileStatus(uploadedFile.id, {
            status: 'error',
            progress: 100,
            error: errorMessage,
          });
        }
      }

      if (!cancelled) {
        setResults(analysisResults);
        setIsProcessing(false);
        setOverallProgress(100);
      }
    }

    processFiles();

    return () => {
      cancelled = true;
    };
  }, [files, aiProvider, getApiKey, aiModel, fileStatuses.length, updateFileStatus]);

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

  // Get status icon
  const getStatusIcon = (status: FileStatus['status']) => {
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
            ? `Processing ${files.length} file(s)...`
            : 'Processing complete'}
        </Text>
      </Paper>

      {/* File list with status */}
      <List spacing="sm" size="sm" center>
        {fileStatuses.map((file) => (
          <List.Item key={file.id} icon={getStatusIcon(file.status)}>
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm" fw={500}>
                  {file.name}
                </Text>
                {file.stage && file.status === 'processing' && (
                  <Text size="xs" c="dimmed">
                    {file.stage}
                  </Text>
                )}
                {file.error && (
                  <Text size="xs" c="red">
                    {file.error}
                  </Text>
                )}
              </div>
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
              {errorCount} file(s) could not be processed. You can continue with
              the successful files or go back to try again.
            </Alert>
          )}

          {successCount === 0 && (
            <Alert
              icon={<IconX size={16} />}
              title="Analysis Failed"
              color="red"
            >
              No files could be processed. Please check your files and try again.
            </Alert>
          )}
        </>
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
