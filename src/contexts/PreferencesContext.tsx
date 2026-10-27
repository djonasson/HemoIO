/**
 * Preferences Context
 *
 * Holds the unit preferences and personal targets in memory. Changes show at
 * once and are saved through EncryptedDb.updatePreferences; a failed save
 * puts the previous value back and rethrows, so the caller can tell the user.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEncryptedDb } from '@hooks/useEncryptedDb';
import {
  PreferencesContext,
  type PersonalTargetRange,
  type PreferencesState,
  type SavedName,
} from '@hooks/usePreferences';
import { learnFromSaved, learnedAliasName } from '@data/biomarkers/learnedAliases';
import type { UserPreferences } from '@/types';

interface Maps {
  unitPreferences: Record<string, string>;
  personalTargets: Record<string, PersonalTargetRange>;
  learnedAliases: Record<string, string>;
}

type MapField = keyof Maps;

function fromStored(prefs: UserPreferences | undefined): Maps {
  return {
    unitPreferences: prefs?.unitPreferences ?? {},
    personalTargets: prefs?.personalTargets ?? {},
    learnedAliases: prefs?.learnedAliases ?? {},
  };
}

/** The map with `key` set to `value`, or removed when `value` is null */
function withEntry<T>(map: Record<string, T>, key: string, value: T | null): Record<string, T> {
  const next = { ...map };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}

export function PreferencesProvider({ children }: { children: ReactNode }): ReactNode {
  const { db, isReady } = useEncryptedDb();
  const [maps, setMaps] = useState<Maps>({
    unitPreferences: {},
    personalTargets: {},
    learnedAliases: {},
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db || !isReady) return;
    let cancelled = false;
    db.getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setMaps(fromStored(prefs));
        setIsLoaded(true);
      })
      .catch(() => console.error('Failed to load preferences'));
    return () => {
      cancelled = true;
    };
  }, [db, isReady]);

  const reload = useCallback(async () => {
    if (!db || !isReady) return;
    setMaps(fromStored(await db.getPreferences()));
    setIsLoaded(true);
  }, [db, isReady]);

  // The latest maps, for reading the value a failed save must put back
  const mapsRef = useRef(maps);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  const setEntry = useCallback(
    async <F extends MapField>(field: F, key: string, value: Maps[F][string] | null) => {
      type Entry = Maps[F][string];
      const entries = (m: Maps) => m[field] as Record<string, Entry>;
      const previous = entries(mapsRef.current)[key];
      setMaps((current) => ({ ...current, [field]: withEntry(entries(current), key, value) }));
      try {
        if (!db || !isReady) throw new Error('Database not available');
        await db.updatePreferences((stored) => ({
          [field]: withEntry(entries(fromStored(stored)), key, value),
        }));
      } catch (err) {
        // Put back what was there, unless a later change replaced it already
        setMaps((current) =>
          entries(current)[key] === (value ?? undefined)
            ? { ...current, [field]: withEntry(entries(current), key, previous ?? null) }
            : current
        );
        throw err;
      }
    },
    [db, isReady]
  );

  const setPreferredUnit = useCallback(
    (biomarkerKey: string, unit: string) => setEntry('unitPreferences', biomarkerKey, unit),
    [setEntry]
  );
  const setPersonalTarget = useCallback(
    (biomarkerKey: string, target: PersonalTargetRange | null) =>
      setEntry('personalTargets', biomarkerKey, target),
    [setEntry]
  );

  const removeLearnedAlias = useCallback(
    (name: string) => setEntry('learnedAliases', learnedAliasName(name), null),
    [setEntry]
  );
  const learnAliases = useCallback(
    async (values: ReadonlyArray<SavedName>) => {
      const previous = mapsRef.current.learnedAliases;
      setMaps((current) => ({
        ...current,
        learnedAliases: learnFromSaved(current.learnedAliases, values),
      }));
      try {
        if (!db || !isReady) throw new Error('Database not available');
        await db.updatePreferences((stored) => ({
          learnedAliases: learnFromSaved(stored?.learnedAliases ?? {}, values),
        }));
      } catch (err) {
        setMaps((current) => ({ ...current, learnedAliases: previous }));
        throw err;
      }
    },
    [db, isReady]
  );

  const value = useMemo<PreferencesState>(
    () => ({
      ...maps,
      isLoaded,
      setPreferredUnit,
      setPersonalTarget,
      learnAliases,
      removeLearnedAlias,
      reload,
    }),
    [maps, isLoaded, setPreferredUnit, setPersonalTarget, learnAliases, removeLearnedAlias, reload]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
