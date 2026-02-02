import type { StorageProviderType } from '@/types';

export function isStorageStepValid(storage: StorageProviderType): boolean {
  return storage === 'local'; // Only local storage is currently supported
}
