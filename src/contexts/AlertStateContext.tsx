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

/** The later of two dates: an acknowledgement or dismissal never moves back */
function later(current: Date | undefined, next: Date): Date {
  return current && current.getTime() > next.getTime() ? current : next;
}

const NONE: Record<string, Date> = {};

export function AlertStateProvider({ children }: { children: ReactNode }): ReactNode {
  const { db, isReady } = useEncryptedDb();
  // Acknowledgements belong to the session that loaded them: locking forgets
  // them, and the next unlock reads the stored ones again
  const [loaded, setLoaded] = useState<{ db: typeof db; through: Record<string, Date> }>({
    db: null,
    through: NONE,
  });
  const sessionDb = isReady ? db : null;
  const acknowledgedThrough = loaded.db === sessionDb && sessionDb ? loaded.through : NONE;
  // Dismissals belong to the session too, and to the data they were made on
  const [dismissed, setDismissed] = useState<{ db: typeof db; through: Record<string, Date> }>({
    db: null,
    through: NONE,
  });
  const dismissedThrough = dismissed.db === sessionDb && sessionDb ? dismissed.through : NONE;
  const acknowledgedRef = useRef(acknowledgedThrough);

  useEffect(() => {
    acknowledgedRef.current = acknowledgedThrough;
  }, [acknowledgedThrough]);

  /** Change this session's acknowledgements */
  const update = useCallback(
    (change: (current: Record<string, Date>) => Record<string, Date>) => {
      setLoaded((prev) => ({
        db: sessionDb,
        through: change(prev.db === sessionDb ? prev.through : NONE),
      }));
    },
    [sessionDb]
  );

  useEffect(() => {
    if (!sessionDb) return;
    let cancelled = false;
    sessionDb
      .getPreferences()
      .then((prefs) => {
        // Acknowledgements made while loading win over the stored ones
        if (!cancelled) update((current) => ({ ...toDates(prefs?.acknowledgedAlerts), ...current }));
      })
      .catch(() => console.error('Failed to load alert acknowledgements'));
    return () => {
      cancelled = true;
    };
  }, [sessionDb, update]);

  /** Read the stored acknowledgements again, e.g. after a backup restore replaced them */
  const reload = useCallback(async () => {
    if (!sessionDb) return;
    const prefs = await sessionDb.getPreferences();
    update(() => toDates(prefs?.acknowledgedAlerts));
    // Restored data is not what was dismissed
    setDismissed({ db: sessionDb, through: NONE });
  }, [sessionDb, update]);

  const acknowledge = useCallback(
    async (biomarkerKey: string, through: Date) => {
      const previous = acknowledgedRef.current[biomarkerKey];
      const kept = later(previous, through);
      update((current) => ({ ...current, [biomarkerKey]: later(current[biomarkerKey], through) }));
      if (!sessionDb) return;

      try {
        // One transaction per save, so concurrent acknowledgements all stick
        await sessionDb.updatePreferences((prefs) => {
          const storedIso = prefs?.acknowledgedAlerts?.[biomarkerKey];
          const stored = storedIso ? new Date(storedIso) : undefined;
          return {
            acknowledgedAlerts: {
              ...prefs?.acknowledgedAlerts,
              [biomarkerKey]: later(stored, through).toISOString(),
            },
          };
        });
      } catch (err) {
        // Not saved: show the alert again rather than let it reappear on reload
        update((current) => {
          if (current[biomarkerKey] !== kept) return current;
          const next = { ...current };
          if (previous) next[biomarkerKey] = previous;
          else delete next[biomarkerKey];
          return next;
        });
        throw err;
      }
    },
    [sessionDb, update]
  );

  const dismiss = useCallback(
    (biomarkerKey: string, through: Date) => {
      setDismissed((prev) => {
        const current = prev.db === sessionDb ? prev.through : NONE;
        return {
          db: sessionDb,
          through: { ...current, [biomarkerKey]: later(current[biomarkerKey], through) },
        };
      });
    },
    [sessionDb]
  );

  const value = useMemo<AlertState>(
    () => ({ acknowledgedThrough, dismissedThrough, acknowledge, dismiss, reload }),
    [acknowledgedThrough, dismissedThrough, acknowledge, dismiss, reload]
  );

  return <AlertStateContext.Provider value={value}>{children}</AlertStateContext.Provider>;
}
