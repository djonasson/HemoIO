import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FOLDER_BACKUPS_CHANNEL_NAME,
  FOLDER_CHANNEL_NAME,
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

  describe('across the tabs of this browser', () => {
    /** Another tab of this browser */
    let otherTab: BroadcastChannel | null = null;
    const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

    afterEach(() => {
      otherTab?.close();
      otherTab = null;
    });

    it('tells the other tabs that the folder changed, and nothing more', async () => {
      const received: unknown[] = [];
      otherTab = new BroadcastChannel(FOLDER_CHANNEL_NAME);
      otherTab.onmessage = (event: MessageEvent) => received.push(event.data);

      notifyFolderAccessChanged();
      await delivered();

      expect(received).toEqual([{ type: 'changed' }]);
    });

    it('hears another tab choose a folder, and not its own change once more', async () => {
      otherTab = new BroadcastChannel(FOLDER_CHANNEL_NAME);
      const listener = vi.fn();
      const stop = onFolderAccessChanged(listener);

      otherTab.postMessage({ type: 'changed' });
      notifyFolderAccessChanged();
      await delivered();
      stop();

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('hears another tab save or delete a dated backup', async () => {
      otherTab = new BroadcastChannel(FOLDER_BACKUPS_CHANNEL_NAME);
      const listener = vi.fn();
      const stop = onFolderBackupsChanged(listener);

      otherTab.postMessage({ type: 'changed' });
      await delivered();
      stop();

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
