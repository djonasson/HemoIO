import { useCallback, useState } from 'react';

export interface FolderRefresh {
  /** Whether the app is syncing with the folder because the user asked */
  refreshing: boolean;
  /** Sync with the folder now; a failed sync is told by the folder notice */
  refresh: () => void;
}

/** Refreshing from the folder in place, as a reload would lock HemoIO */
export function useFolderRefresh(syncNow: () => Promise<void>): FolderRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setRefreshing(true);
    void syncNow()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [syncNow]);
  return { refreshing, refresh };
}
