import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyFolderAccessChanged } from './folderAccessEvents';
import { isFolderStorageOn } from './storageChoice';
import { chooseFolder } from './chooseFolder';

const selectDirectory = vi.fn<() => Promise<{ name: string } | null>>();

vi.mock('./FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class {
    selectDirectory = selectDirectory;
  },
}));

vi.mock('./folderAccessEvents', () => ({
  notifyFolderAccessChanged: vi.fn(),
}));

vi.mock('./storageChoice', () => ({
  isFolderStorageOn: vi.fn(),
}));

describe('chooseFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFolderStorageOn).mockReturnValue(true);
  });

  it('shows the picker at once, and tells the sync and Settings about the folder chosen', async () => {
    selectDirectory.mockResolvedValue({ name: 'Other' });

    const chosen = chooseFolder();
    // Called before anything is awaited: the picker needs the click's user activation
    expect(selectDirectory).toHaveBeenCalledTimes(1);

    expect(await chosen).toBe('chosen');
    expect(notifyFolderAccessChanged).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the picker is cancelled', async () => {
    selectDirectory.mockResolvedValue(null);

    expect(await chooseFolder()).toBe('cancelled');
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });

  it('rejects when the folder cannot be chosen, telling no one', async () => {
    selectDirectory.mockRejectedValue(new Error('Please grant folder access to continue.'));

    await expect(chooseFolder()).rejects.toThrow();
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });

  it('shows no picker once folder storage was switched off', async () => {
    vi.mocked(isFolderStorageOn).mockReturnValue(false);

    expect(await chooseFolder()).toBe('off');
    expect(selectDirectory).not.toHaveBeenCalled();
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });

  it('switching folder storage on: picks even while it is off, and announces nothing', async () => {
    vi.mocked(isFolderStorageOn).mockReturnValue(false);
    selectDirectory.mockResolvedValue({ name: 'Other' });

    expect(await chooseFolder({ switchingOn: true })).toBe('chosen');
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });
});
