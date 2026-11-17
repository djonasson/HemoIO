import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentFolder } from './StorageProviderFactory';
import { notifyFolderAccessChanged } from './folderAccessEvents';
import { grantFolderAccess } from './grantFolderAccess';

const requestPermission = vi.fn();

vi.mock('./StorageProviderFactory', () => ({ currentFolder: vi.fn() }));
vi.mock('./folderAccessEvents', () => ({ notifyFolderAccessChanged: vi.fn() }));

describe('grantFolderAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentFolder).mockReturnValue({ requestPermission } as unknown as ReturnType<typeof currentFolder>);
  });

  it('tells every tab once access is given', async () => {
    requestPermission.mockResolvedValue('granted');

    await expect(grantFolderAccess()).resolves.toBe('granted');
    expect(notifyFolderAccessChanged).toHaveBeenCalledTimes(1);
  });

  it.each(['prompt', 'denied'])('tells no one when the browser answers %s', async (state) => {
    requestPermission.mockResolvedValue(state);

    await expect(grantFolderAccess()).resolves.toBe(state);
    expect(notifyFolderAccessChanged).not.toHaveBeenCalled();
  });
});
