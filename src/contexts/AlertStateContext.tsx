/**
 * Alert State Context
 *
 * Acknowledgements persist in the encrypted user preferences; dismissals
 * last for the page load. One provider keeps the nav badge, the Alerts view
 * and Trends consistent.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useEncryptedDb } from '@hooks/useEncryptedDb';
import { AlertStateContext, type AlertState } from '@hooks/useAlertState';

function toDates(stored: Record<string, string> | undefined): Record<string, Date> {
  return Object.fromEntries(Object.entries(stored ?? {}).map(([key, iso]) => [key, new Date(iso)]));
}

export function AlertStateProvider({ children }: { children: ReactNode }): ReactNode {
  const { db, isReady } = useEncryptedDb();
  const [acknowledgedThrough, setAcknowledgedThrough] = useState<Record<string, Date>>({});
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!db || !isReady) return;
    let cancelled = false;
    db.getPreferences()
      .then((prefs) => {
        if (!cancelled) setAcknowledgedThrough(toDates(prefs?.acknowledgedAlerts));
      })
      .catch(() => console.error('Failed to load alert acknowledgements'));
    return () => {
      cancelled = true;
    };
  }, [db, isReady]);

  const acknowledge = useCallback(
    async (biomarkerKey: string, through: Date) => {
      setAcknowledgedThrough((prev) => ({ ...prev, [biomarkerKey]: through }));
      if (!db || !isReady) return;
      const prefs = await db.getPreferences();
      await db.savePreferences({
        unitPreferences: prefs?.unitPreferences ?? {},
        personalTargets: prefs?.personalTargets ?? {},
        theme: prefs?.theme ?? 'system',
        dateFormat: prefs?.dateFormat ?? 'MM/DD/YYYY',
        acknowledgedAlerts: { ...prefs?.acknowledgedAlerts, [biomarkerKey]: through.toISOString() },
      });
    },
    [db, isReady]
  );

  const dismiss = useCallback((alertId: string) => {
    setDismissedIds((prev) => new Set([...prev, alertId]));
  }, []);

  const value = useMemo<AlertState>(
    () => ({ acknowledgedThrough, dismissedIds, acknowledge, dismiss }),
    [acknowledgedThrough, dismissedIds, acknowledge, dismiss]
  );

  return <AlertStateContext.Provider value={value}>{children}</AlertStateContext.Provider>;
}
