/**
 * Mock for virtual:pwa-register/react
 *
 * Provides a mock implementation for testing
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface RegisterSWOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: Error) => void;
}

export function useRegisterSW(_options?: RegisterSWOptions): {
  needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
  offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  void _options; // Intentionally unused in mock
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  const updateServiceWorker = async (_reloadPage?: boolean): Promise<void> => {
    void _reloadPage; // Intentionally unused in mock
  };

  return {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  };
}
