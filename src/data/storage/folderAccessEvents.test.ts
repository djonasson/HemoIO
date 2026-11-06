import { describe, it, expect, vi } from 'vitest';
import {
  notifyFolderAccessChanged,
  notifyFolderBackupsChanged,
  onFolderAccessChanged,
  onFolderBackupsChanged,
} from './folderAccessEvents';

describe('folder access events', () => {
  it('tells every listener, until it unsubscribes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onFolderAccessChanged(first);
    const stopSecond = onFolderAccessChanged(second);

    notifyFolderAccessChanged();
    stopFirst();
    notifyFolderAccessChanged();
    stopSecond();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('tells backup listeners of backup changes only, until they unsubscribe', () => {
    const backups = vi.fn();
    const access = vi.fn();
    const stopBackups = onFolderBackupsChanged(backups);
    const stopAccess = onFolderAccessChanged(access);

    notifyFolderBackupsChanged();
    stopBackups();
    notifyFolderBackupsChanged();
    stopAccess();

    expect(backups).toHaveBeenCalledTimes(1);
    expect(access).not.toHaveBeenCalled();
  });
});
