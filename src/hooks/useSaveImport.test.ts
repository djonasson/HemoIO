import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { SaveError } from '@data/db/saveError';
import { saveImportResults } from '@services/persistence';
import { useSaveImport } from './useSaveImport';
import type { ReviewedResult } from '@components/import';

vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('@services/persistence', () => ({ saveImportResults: vi.fn() }));

const refresh = vi.fn();
const learnAliases = vi.fn();
const encryptedDb = { db: {} as unknown, isReady: true };
vi.mock('./useEncryptedDb', () => ({ useEncryptedDb: () => encryptedDb }));
vi.mock('./useLabResults', () => ({ useLabResults: () => ({ refresh }) }));
vi.mock('./usePreferences', () => ({ usePreferences: () => ({ learnAliases }) }));

const REVIEWED = [
  {
    fileId: 'f1',
    fileName: 'hiv-test.pdf',
    success: true,
    biomarkers: [],
    confidence: 0.9,
    warnings: [],
    labName: 'Quest Diagnostics',
    editedBiomarkers: [
      { name: 'Glucose', value: 125, unit: 'mg/dL', confidence: 0.9, isExactMatch: true, normalizedUnit: 'mg/dL' },
    ],
  },
] as unknown as ReviewedResult[];

function renderSave(syncNow = vi.fn().mockResolvedValue(undefined)) {
  return renderHook(() => useSaveImport(syncNow));
}

describe('useSaveImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptedDb.isReady = true;
    refresh.mockResolvedValue(undefined);
    learnAliases.mockResolvedValue(undefined);
  });

  it('saves, says so, learns the names, shows the results and syncs', async () => {
    vi.mocked(saveImportResults).mockResolvedValue({ totalLabResults: 1, totalTestValues: 1 });
    const syncNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderSave(syncNow);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current(REVIEWED);
    });

    expect(saved).toBe(true);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Import Complete', color: 'green' })
    );
    expect(learnAliases).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(syncNow).toHaveBeenCalled();
  });

  it('says nothing was saved, and why, when the storage does not keep the import', async () => {
    vi.mocked(saveImportResults).mockRejectedValue(new SaveError('quota'));
    const syncNow = vi.fn();
    const { result } = renderSave(syncNow);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current(REVIEWED);
    });

    expect(saved).toBe(false);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Import not saved',
        message: expect.stringMatching(/^Nothing was saved\. .*no room left/),
        color: 'red',
      })
    );
    // Nothing is learned from, shown or synced that was not stored
    expect(learnAliases).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('never shows the import itself in the message', async () => {
    vi.mocked(saveImportResults).mockRejectedValue(new Error('Glucose 125 mg/dL hiv-test.pdf'));
    const { result } = renderSave();

    await act(async () => {
      await result.current(REVIEWED);
    });

    expect(JSON.stringify(vi.mocked(notifications.show).mock.calls)).not.toMatch(
      /Glucose|125|hiv-test|Quest/
    );
  });

  it('saves nothing while the database is not available', async () => {
    encryptedDb.isReady = false;
    const { result } = renderSave();

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current(REVIEWED);
    });

    expect(saved).toBe(false);
    expect(saveImportResults).not.toHaveBeenCalled();
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Import not saved', color: 'red' })
    );
  });
});
