/**
 * Alert State Context
 *
 * Acknowledgements persist in the user preferences; dismissals
 * last for the page load. One provider keeps the nav badge, the Alerts view
 * and Trends consistent.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEncryptedDb } from '@hooks/useEncryptedDb';
import { AlertStateContext, type AlertState } from '@hooks/useAlertState';

function toDates(stored: Record<string, string> | undefined): Record<string, Date> {
  return Object.fromEntries(Object.entries(stored ?? {}).map(([key, iso]) => [key, new Date(iso)]));
}

export function AlertStateProvider({ children }: { children: ReactNode }): ReactNode {
  const { db, isReady } = useEncryptedDb();
  const [acknowledgedThrough, setAcknowledgedThrough] = useState<Record<string, Date>>({});
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const acknowledgedRef = useRef(acknowledgedThrough);
  // Each save reads then writes the stored record, so saves run one at a time
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    acknowledgedRef.current = acknowledgedThrough;
  }, [acknowledgedThrough]);

  useEffect(() => {
    if (!db || !isReady) return;
    let cancelled = false;
    db.getPreferences()
      .then((prefs) => {
        // Acknowledgements made while loading win over the stored ones
        if (!cancelled)
          setAcknowledgedThrough((prev) => ({
            ...toDates(prefs?.acknowledgedAlerts),
            ...prev,
          }));
      })
      .catch(() => console.error('Failed to load alert acknowledgements'));
    return () => {
      cancelled = true;
    };
  }, [db, isReady]);

  const acknowledge = useCallback(
    async (biomarkerKey: string, through: Date) => {
      const previous = acknowledgedRef.current[biomarkerKey];
      setAcknowledgedThrough((prev) => ({ ...prev, [biomarkerKey]: through }));
      if (!db || !isReady) return;

      const save = saveQueue.current.then(async () => {
        const prefs = await db.getPreferences();
        await db.savePreferences({
          unitPreferences: prefs?.unitPreferences ?? {},
          personalTargets: prefs?.personalTargets ?? {},
          theme: prefs?.theme ?? 'system',
          dateFormat: prefs?.dateFormat ?? 'MM/DD/YYYY',
          acknowledgedAlerts: {
            ...prefs?.acknowledgedAlerts,
            [biomarkerKey]: through.toISOString(),
          },
        });
      });
      saveQueue.current = save.catch(() => undefined);

      try {
        await save;
      } catch (err) {
        // Not saved: show the alert again rather than let it reappear on reload
        setAcknowledgedThrough((prev) => {
          if (prev[biomarkerKey] !== through) return prev;
          const next = { ...prev };
          if (previous) next[biomarkerKey] = previous;
          else delete next[biomarkerKey];
          return next;
        });
        throw err;
      }
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
