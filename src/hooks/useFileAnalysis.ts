/**
 * File analysis of an import
 *
 * Each uploaded file is analysed once: its result is kept while the import
 * wizard moves between steps, so going back to the analysis never asks the
 * AI again. Only a file without a result is analysed: a new one, or a failed
 * one the user retries.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PreferencesContext } from '@hooks/usePreferences';
import { dayOrderOf } from '@/utils/labDate';
import { useCatalog } from '@contexts/useCatalog';
import { analyzeLabReport } from '../services/analysis';
import { processWithConcurrency } from '../utils/concurrency';
import type { UploadedFile } from '../components/import/UploadStep';
import type { AnalysisResult } from '../components/import/AnalysisStep';

/** Where a file is in its analysis */
export type FileAnalysisStatus = 'pending' | 'processing' | 'success' | 'error';

/** A file's analysis as shown on the analysis step */
export interface FileAnalysisState {
  id: string;
  name: string;
  status: FileAnalysisStatus;
  /** 0 to 100 */
  progress: number;
  /** What the analysis is doing, while it is processing */
  stage?: string;
  /** Why the analysis failed */
  error?: string;
}

export interface UseFileAnalysisOptions {
  /** The import's files, in upload order */
  files: UploadedFile[];
  /**
   * Whether the analysis step is shown. Files are analysed only then;
   * leaving the step stops what is in progress, to go on when it is shown again.
   */
  active: boolean;
  aiProvider: 'openai' | 'anthropic' | 'ollama';
  /** Function to get decrypted API key (not required for Ollama) */
  getApiKey: () => Promise<string | null>;
  aiModel?: string;
}

export interface UseFileAnalysisResult {
  /** Every file's analysis, in upload order */
  fileStates: FileAnalysisState[];
  /** The finished analyses (succeeded or failed), in upload order */
  results: AnalysisResult[];
  /** Whether a file is still waiting for or in its analysis */
  isProcessing: boolean;
  /** 0 to 100, over all files */
  overallProgress: number;
  /** Analyse a failed file again; a file that succeeded is kept as it is */
  retry: (fileId: string) => void;
}

/** A file's analysis once it has started */
interface Entry {
  status: Exclude<FileAnalysisStatus, 'pending'>;
  progress: number;
  stage?: string;
  result?: AnalysisResult;
}

function without<T>(record: Record<string, T>, ids: string[]): Record<string, T> {
  const kept = { ...record };
  for (const id of ids) delete kept[id];
  return kept;
}

function failure(file: UploadedFile, error: string): AnalysisResult {
  return {
    fileId: file.id,
    fileName: file.file.name,
    success: false,
    error,
    biomarkers: [],
    confidence: 0,
    warnings: [],
  };
}

/**
 * Analyse the import's files with the AI, each once, while the analysis step is shown
 */
export function useFileAnalysis({
  files,
  active,
  aiProvider,
  getApiKey,
  aiModel,
}: UseFileAnalysisOptions): UseFileAnalysisResult {
  const catalog = useCatalog();
  // The user's learned tests and date order, as they are when each file is matched
  const preferences = useContext(PreferencesContext);
  const learnedTests = preferences?.learnedTests;
  const dayOrder = dayOrderOf(preferences?.dateFormat);
  const latest = useRef({ learnedTests, dayOrder });
  useEffect(() => {
    latest.current = { learnedTests, dayOrder };
  }, [learnedTests, dayOrder]);

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  // Files handed to a run that has not finished them yet
  const queued = useRef(new Set<string>());
  // Shared by the runs of one visit to the analysis step
  const controllerRef = useRef<AbortController | null>(null);

  const analyse = useCallback(
    async (batch: UploadedFile[], signal: AbortSignal) => {
      const setEntry = (id: string, entry: Entry) => {
        if (!signal.aborted) setEntries((prev) => ({ ...prev, [id]: entry }));
      };
      const finish = (file: UploadedFile, result: AnalysisResult) => {
        if (signal.aborted) return;
        queued.current.delete(file.id);
        setEntry(file.id, { status: result.success ? 'success' : 'error', progress: 100, result });
      };

      let apiKey = '';
      if (aiProvider !== 'ollama') {
        const key = await getApiKey();
        if (!key) {
          batch.forEach((file) => finish(file, failure(file, 'API key not available')));
          return;
        }
        apiKey = key;
      }

      // Cloud providers can handle parallel requests, Ollama should stay sequential
      const concurrency = aiProvider === 'ollama' ? 1 : 3;
      await processWithConcurrency(
        batch,
        async (file) => {
          if (signal.aborted) return;
          setEntry(file.id, { status: 'processing', progress: 0, stage: 'Starting...' });
          try {
            const result = await analyzeLabReport(file.file, {
              aiProvider,
              aiConfig: { apiKey, model: aiModel },
              signal,
              catalog,
              ...latest.current,
              onProgress: (stage, progress) => {
                setEntry(file.id, { status: 'processing', progress: progress * 100, stage });
              },
            });
            finish(file, {
              fileId: file.id,
              fileName: file.file.name,
              success: true,
              biomarkers: result.matchedBiomarkers,
              labDate: result.labDate,
              labName: result.labName,
              confidence: result.overallConfidence,
              warnings: result.warnings,
              duplicateConflicts: result.duplicateConflicts,
            });
          } catch (error) {
            finish(file, failure(file, error instanceof Error ? error.message : 'Unknown error'));
          }
        },
        concurrency
      );
    },
    [aiProvider, getApiKey, aiModel, catalog]
  );

  // Leaving the step stops the AI requests and rate-limit waits still in
  // progress; their files are analysed again when the step is shown again
  useEffect(() => {
    if (!active) return;
    const pending = queued.current;
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      const stopped = [...pending];
      pending.clear();
      setEntries((prev) => without(prev, stopped));
    };
  }, [active]);

  // Analyse the files that have no result and are not being analysed yet
  useEffect(() => {
    if (!active) return;
    const batch = files.filter((f) => !entries[f.id] && !queued.current.has(f.id));
    if (batch.length === 0) return;
    batch.forEach((f) => queued.current.add(f.id));
    controllerRef.current ??= new AbortController();
    void analyse(batch, controllerRef.current.signal);
  }, [active, files, entries, analyse]);

  const retry = useCallback((fileId: string) => {
    setEntries((prev) => (prev[fileId]?.status === 'error' ? without(prev, [fileId]) : prev));
  }, []);

  const fileStates = useMemo(
    () =>
      files.map((f): FileAnalysisState => {
        const entry = entries[f.id];
        return {
          id: f.id,
          name: f.file.name,
          status: entry?.status ?? 'pending',
          progress: entry?.progress ?? 0,
          stage: entry?.status === 'processing' ? entry.stage : undefined,
          error: entry?.result?.error,
        };
      }),
    [files, entries]
  );

  const results = useMemo(
    () => files.flatMap((f) => entries[f.id]?.result ?? []),
    [files, entries]
  );

  const overallProgress =
    files.length === 0
      ? 0
      : fileStates.reduce((sum, f) => sum + f.progress, 0) / files.length;

  return {
    fileStates,
    results,
    isProcessing: results.length < files.length,
    overallProgress,
    retry,
  };
}
