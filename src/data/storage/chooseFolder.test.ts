import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyFolderAccessChanged } from './folderAccessEvents';
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

describe('chooseFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the picker at once, and tells the sync and Settings about the folder chosen', async () => {
    selectDirectory.mockResolvedValue({ name: 'Other' });

    const chosen = chooseFolder();
    // Called before anything is awaited: the picker needs the click's user activation
    expect(selectDirectory).toHaveBeenCalledTimes(1);

    expect(await chosen).toBe(true);
    expect(notifyFolderAccessChanged).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the picker is cancelled', async () => {
    selectDirectory.mockResolvedValue(null);

    expect(await chooseFolder()).toBe(false);
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });

  it('rejects when the folder cannot be chosen, telling no one', async () => {
    selectDirectory.mockRejectedValue(new Error('Please grant folder access to continue.'));

    await expect(chooseFolder()).rejects.toThrow();
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });
});
