/**
 * Upload Step Component
 *
 * File upload interface with drag & drop support for lab report documents.
 */

import { useState, useCallback } from 'react';
import {
  Stack,
  Group,
  Button,
  Text,
  Paper,
  Image,
  ActionIcon,
  Badge,
  Alert,
} from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import type { FileWithPath } from '@mantine/dropzone';
import {
  IconUpload,
  IconFile,
  IconFileTypePdf,
  IconPhoto,
  IconX,
  IconAlertCircle,
} from '@tabler/icons-react';
import { isSupportedDocument, SUPPORTED_MIME_TYPES } from '../../services/ocr';

/**
 * Uploaded file with preview information
 */
export interface UploadedFile {
  /** Original file object */
  file: File;
  /** Unique ID for this upload */
  id: string;
  /** Preview URL for images */
  preview?: string;
  /** File size formatted */
  formattedSize: string;
}

/**
 * Props for UploadStep
 */
export interface UploadStepProps {
  /** Callback when files are ready to analyze */
  onComplete: (files: UploadedFile[]) => void;
  /** Callback when upload is cancelled */
  onCancel?: () => void;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get icon for file type
 */
function getFileIcon(file: File) {
  if (file.type === SUPPORTED_MIME_TYPES.pdf) {
    return <IconFileTypePdf size={40} stroke={1.5} />;
  }
  if (file.type.startsWith('image/')) {
    return <IconPhoto size={40} stroke={1.5} />;
  }
  return <IconFile size={40} stroke={1.5} />;
}

/**
 * Upload Step - file selection and upload
 */
export function UploadStep({ onComplete, onCancel }: UploadStepProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Handle file drop
  const handleDrop = useCallback((droppedFiles: FileWithPath[]) => {
    setError(null);

    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    for (const file of droppedFiles) {
      if (!isSupportedDocument(file)) {
        errors.push(`${file.name}: Unsupported file type`);
        continue;
      }

      const uploadedFile: UploadedFile = {
        file,
        id: generateId(),
        formattedSize: formatFileSize(file.size),
      };

      // Create preview for images
      if (file.type.startsWith('image/')) {
        uploadedFile.preview = URL.createObjectURL(file);
      }

      newFiles.push(uploadedFile);
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Handle file rejection (from Dropzone)
  const handleReject = useCallback(() => {
    setError('Some files were rejected. Please upload only PDF or image files.');
  }, []);

  // Remove a file from the list
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Handle analyze button click
  const handleAnalyze = useCallback(() => {
    if (files.length > 0) {
      onComplete(files);
    }
  }, [files, onComplete]);

  return (
    <Stack gap="lg">
      {/* Dropzone */}
      <Dropzone
        onDrop={handleDrop}
        onReject={handleReject}
        maxSize={50 * 1024 * 1024} // 50MB
        accept={[
          MIME_TYPES.pdf,
          MIME_TYPES.png,
          MIME_TYPES.jpeg,
          MIME_TYPES.webp,
          MIME_TYPES.gif,
        ]}
        multiple
      >
        <Group justify="center" gap="xl" mih={200} style={{ pointerEvents: 'none' }}>
          <Dropzone.Accept>
            <IconUpload size={52} stroke={1.5} color="var(--mantine-color-blue-6)" />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX size={52} stroke={1.5} color="var(--mantine-color-red-6)" />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconUpload size={52} stroke={1.5} color="var(--mantine-color-dimmed)" />
          </Dropzone.Idle>

          <div>
            <Text size="xl" inline>
              Drag files here or click to select
            </Text>
            <Text size="sm" c="dimmed" inline mt={7}>
              Supported formats: PDF, JPEG, PNG, WebP, GIF
            </Text>
            <Text size="sm" c="dimmed" inline mt={4}>
              Maximum file size: 50MB
            </Text>
          </div>
        </Group>
      </Dropzone>

      {/* Error message */}
      {error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Upload Error"
          color="red"
          withCloseButton
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      {/* File list */}
      {files.length > 0 && (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>Selected Files ({files.length})</Text>
            <Button
              variant="subtle"
              size="sm"
              color="red"
              onClick={() => setFiles([])}
            >
              Remove All
            </Button>
          </Group>

          {files.map((uploadedFile) => (
            <Paper key={uploadedFile.id} p="sm" withBorder>
              <Group justify="space-between" wrap="nowrap">
                <Group wrap="nowrap">
                  {uploadedFile.preview ? (
                    <Image
                      src={uploadedFile.preview}
                      alt={uploadedFile.file.name}
                      w={50}
                      h={50}
                      fit="cover"
                      radius="sm"
                    />
                  ) : (
                    getFileIcon(uploadedFile.file)
                  )}
                  <div>
                    <Text size="sm" fw={500} lineClamp={1}>
                      {uploadedFile.file.name}
                    </Text>
                    <Badge size="sm" variant="light">
                      {uploadedFile.formattedSize}
                    </Badge>
                  </div>
                </Group>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => removeFile(uploadedFile.id)}
                  aria-label={`Remove ${uploadedFile.file.name}`}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Action buttons */}
      <Group justify="flex-end" mt="xl">
        {onCancel && (
          <Button variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleAnalyze}
          disabled={files.length === 0}
          leftSection={<IconUpload size={16} />}
        >
          Analyze {files.length > 0 && `(${files.length})`}
        </Button>
      </Group>
    </Stack>
  );
}
