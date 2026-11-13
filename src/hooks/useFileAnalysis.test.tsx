import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CatalogContext } from '@contexts/useCatalog';
import { PreferencesContext, type PreferencesState } from '@hooks/usePreferences';
import { fixtureCatalog } from '@/test/loincFixture';
import { analyzeLabReport } from '../services/analysis';
import type { AnalysisResult as ServiceAnalysisResult } from '../services/analysis';
import type { UploadedFile } from '../components/import/UploadStep';
import { useFileAnalysis, type UseFileAnalysisOptions } from './useFileAnalysis';

vi.mock('../services/analysis', () => ({
  analyzeLabReport: vi.fn(),
}));

const catalog = fixtureCatalog();
const LEARNED = { 'zorb|mg/dL': '2339-0' };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <CatalogContext.Provider value={catalog}>
      <PreferencesContext.Provider value={{ learnedTests: LEARNED } as unknown as PreferencesState}>
        {children}
      </PreferencesContext.Provider>
    </CatalogContext.Provider>
  );
}

function uploaded(name: string): UploadedFile {
  return { file: new File(['x'], name, { type: 'application/pdf' }), id: name, formattedSize: '1 KB' };
}

function analysis(values: number): ServiceAnalysisResult {
  return {
    matchedBiomarkers: Array.from({ length: values }, () => ({ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.9 })),
    labDate: '2024-01-15',
    labName: 'Lab',
    overallConfidence: 0.9,
    warnings: [],
    duplicateConflicts: [],
  } as unknown as ServiceAnalysisResult;
}

/** The files analysed, in call order */
function analysedFiles(): string[] {
  return vi.mocked(analyzeLabReport).mock.calls.map(([file]) => file.name);
}

function renderAnalysis(options: Partial<UseFileAnalysisOptions> = {}) {
  const initialProps: UseFileAnalysisOptions = {
    files: [uploaded('a.pdf')],
    active: true,
    aiProvider: 'openai',
    getApiKey: vi.fn().mockResolvedValue('sk-test-key'),
    aiModel: 'gpt-4',
    ...options,
  };
  const rendered = renderHook((props: UseFileAnalysisOptions) => useFileAnalysis(props), { initialProps, wrapper });
  let props = initialProps;
  /** Render again with some options changed */
  const update = (changed: Partial<UseFileAnalysisOptions>) => {
    props = { ...props, ...changed };
    rendered.rerender(props);
  };
  return { ...rendered, update };
}

describe('useFileAnalysis', () => {
  beforeEach(() => {
    vi.mocked(analyzeLabReport).mockReset();
  });

  it('analyses every file and gives the results in upload order', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValueOnce(analysis(2)).mockRejectedValueOnce(new Error('AI analysis failed: down'));
    const { result } = renderAnalysis({ files: [uploaded('a.pdf'), uploaded('b.pdf')] });

    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    expect(result.current.results.map((r) => [r.fileName, r.success, r.biomarkers.length])).toEqual([
      ['a.pdf', true, 2],
      ['b.pdf', false, 0],
    ]);
    expect(result.current.fileStates.map((f) => [f.name, f.status, f.error])).toEqual([
      ['a.pdf', 'success', undefined],
      ['b.pdf', 'error', 'AI analysis failed: down'],
    ]);
    expect(result.current.overallProgress).toBe(100);
  });

  it('matches in the LOINC catalog with the learned tests, with the API key', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValue(analysis(1));
    const { result } = renderAnalysis();
    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    const options = vi.mocked(analyzeLabReport).mock.calls[0][1];
    expect(options.catalog).toBe(catalog);
    expect(options.learnedTests).toEqual(LEARNED);
    expect(options.aiConfig).toEqual({ apiKey: 'sk-test-key', model: 'gpt-4' });
  });

  it('asks no API key of Ollama', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValue(analysis(1));
    const getApiKey = vi.fn();
    const { result } = renderAnalysis({ aiProvider: 'ollama', getApiKey });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));
    expect(getApiKey).not.toHaveBeenCalled();
  });

  it('fails every file when the API key is not available', async () => {
    const { result } = renderAnalysis({
      files: [uploaded('a.pdf'), uploaded('b.pdf')],
      getApiKey: vi.fn().mockResolvedValue(null),
    });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    expect(result.current.fileStates.map((f) => f.error)).toEqual(['API key not available', 'API key not available']);
    expect(analyzeLabReport).not.toHaveBeenCalled();
  });

  it("shows a file's stage and progress while it is analysed", async () => {
    vi.mocked(analyzeLabReport).mockImplementation(async (file, options) => {
      if (file.name === 'a.pdf') options.onProgress?.('Waiting for the AI provider (rate limited)', 0.5);
      return new Promise(() => {});
    });
    const { result } = renderAnalysis({ files: [uploaded('a.pdf'), uploaded('b.pdf')] });

    await waitFor(() =>
      expect(result.current.fileStates[0]).toMatchObject({
        status: 'processing',
        stage: 'Waiting for the AI provider (rate limited)',
        progress: 50,
      })
    );
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.overallProgress).toBe(25);
  });

  it('analyses nothing while the analysis step is not shown', async () => {
    const getApiKey = vi.fn().mockResolvedValue('sk-test-key');
    const { result } = renderAnalysis({ active: false, getApiKey });
    await act(async () => {});
    expect(getApiKey).not.toHaveBeenCalled();
    expect(result.current.fileStates[0].status).toBe('pending');
  });

  it('keeps the results when the step is left and shown again', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValue(analysis(1));
    const { result, update } = renderAnalysis();
    await waitFor(() => expect(result.current.isProcessing).toBe(false));
    const finished = result.current.results;

    update({ active: false });
    update({ active: true });
    await act(async () => {});

    expect(analyzeLabReport).toHaveBeenCalledTimes(1);
    expect(result.current.results).toEqual(finished);
    expect(result.current.results[0]).toBe(finished[0]);
  });

  it('stops the analysis when the step is left, and analyses the file when shown again', async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(analyzeLabReport)
      .mockImplementationOnce(async (_file, options) => {
        if (options.signal) signals.push(options.signal);
        return new Promise(() => {});
      })
      .mockResolvedValueOnce(analysis(1));
    const { result, update } = renderAnalysis();
    await waitFor(() => expect(signals).toHaveLength(1));

    update({ active: false });
    expect(signals[0].aborted).toBe(true);
    expect(result.current.fileStates[0].status).toBe('pending');

    update({ active: true });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));
    expect(analyzeLabReport).toHaveBeenCalledTimes(2);
    expect(result.current.results[0].success).toBe(true);
  });

  it('stops the analysis when the wizard closes', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(analyzeLabReport).mockImplementationOnce(async (_file, options) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    const { unmount } = renderAnalysis();
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('retries only a failed file', async () => {
    vi.mocked(analyzeLabReport)
      .mockResolvedValueOnce(analysis(1))
      .mockRejectedValueOnce(new Error('AI analysis failed: down'))
      .mockResolvedValueOnce(analysis(3));
    const { result } = renderAnalysis({ files: [uploaded('a.pdf'), uploaded('b.pdf')] });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));
    const first = result.current.results[0];

    act(() => result.current.retry('b.pdf'));
    expect(result.current.fileStates[1].status).not.toBe('error');
    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    expect(analysedFiles()).toEqual(['a.pdf', 'b.pdf', 'b.pdf']);
    expect(result.current.results[0]).toBe(first);
    expect(result.current.results[1]).toMatchObject({ fileName: 'b.pdf', success: true });
    expect(result.current.results[1].biomarkers).toHaveLength(3);
  });

  it('never analyses a file that succeeded again', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValue(analysis(1));
    const { result } = renderAnalysis();
    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    act(() => result.current.retry('a.pdf'));
    await act(async () => {});

    expect(analyzeLabReport).toHaveBeenCalledTimes(1);
    expect(result.current.fileStates[0].status).toBe('success');
  });

  it('keeps the results of the files still chosen, analysing only new ones', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValue(analysis(1));
    const a = uploaded('a.pdf');
    const b = uploaded('b.pdf');
    const { result, update } = renderAnalysis({ files: [a, b] });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    update({ files: [a, b], active: false });
    update({ files: [b, uploaded('c.pdf')], active: true });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));

    expect(analysedFiles()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(result.current.results.map((r) => r.fileName)).toEqual(['b.pdf', 'c.pdf']);
    expect(result.current.fileStates.map((f) => f.name)).toEqual(['b.pdf', 'c.pdf']);
  });

});
