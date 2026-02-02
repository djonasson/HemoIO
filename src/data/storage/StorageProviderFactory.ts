/**
 * Storage Provider Factory
 *
 * Creates the appropriate storage provider based on user configuration.
 * Currently only supports local storage, but designed to support
 * cloud providers (Dropbox, Google Drive) in the future.
 */

import type { StorageProvider, StorageProviderType } from '@/types';
import { LocalStorageProvider } from './LocalStorageProvider';

/**
 * Storage provider instances cache
 */
const providerCache: Partial<Record<StorageProviderType, StorageProvider>> = {};

/**
 * Create or get a cached storage provider instance
 */
export function getStorageProvider(type: StorageProviderType): StorageProvider {
  // Return cached instance if available
  if (providerCache[type]) {
    return providerCache[type]!;
  }

  // Create new instance based on type
  let provider: StorageProvider;

  switch (type) {
    case 'local':
      provider = new LocalStorageProvider();
      break;

    case 'dropbox':
      // TODO: Implement Dropbox provider
      throw new Error('Dropbox storage is not yet implemented');

    case 'googledrive':
      // TODO: Implement Google Drive provider
      throw new Error('Google Drive storage is not yet implemented');

    default:
      throw new Error(`Unknown storage provider type: ${type}`);
  }

  // Cache and return
  providerCache[type] = provider;
  return provider;
}

/**
 * Clear the provider cache (useful for testing)
 */
export function clearProviderCache(): void {
  for (const key of Object.keys(providerCache)) {
    delete providerCache[key as StorageProviderType];
  }
}

/**
 * Check if a storage provider type is available/implemented
 */
export function isProviderAvailable(type: StorageProviderType): boolean {
  switch (type) {
    case 'local':
      return true;
    case 'dropbox':
    case 'googledrive':
      return false; // Not yet implemented
    default:
      return false;
  }
}

/**
 * Get list of all available storage provider types
 */
export function getAvailableProviders(): StorageProviderType[] {
  const allTypes: StorageProviderType[] = ['local', 'dropbox', 'googledrive'];
  return allTypes.filter(isProviderAvailable);
}

/**
 * Get display information for storage providers
 */
export interface StorageProviderInfo {
  type: StorageProviderType;
  name: string;
  description: string;
  available: boolean;
  icon?: string;
}

export function getStorageProviderInfo(): StorageProviderInfo[] {
  return [
    {
      type: 'local',
      name: 'Local Storage',
      description: 'Store data in your browser. Data stays on this device only.',
      available: true,
    },
    {
      type: 'dropbox',
      name: 'Dropbox',
      description: 'Sync encrypted data across devices via Dropbox.',
      available: false,
    },
    {
      type: 'googledrive',
      name: 'Google Drive',
      description: 'Sync encrypted data across devices via Google Drive.',
      available: false,
    },
  ];
}
