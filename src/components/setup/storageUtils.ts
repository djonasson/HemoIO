import type { StorageProviderType } from '@/types';

export function isStorageStepValid(
  storage: StorageProviderType,
  directoryName?: string | null
): boolean {
  switch (storage) {
    case 'local':
      return true;
    case 'filesystem':
      // Filesystem requires a directory to be selected
      return directoryName !== null && directoryName !== undefined && directoryName !== '';
    default:
      return false;
  }
}
