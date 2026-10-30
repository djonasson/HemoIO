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
  // The maps as stored: a failed save puts back the stored entry, as the one
  // shown before it may not have been saved either
  const storedRef = useRef<Maps>(maps);

  useEffect(() => {
    if (!db || !isReady) return;
    let cancelled = false;
    db.getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        storedRef.current = fromStored(prefs);
        setMaps(storedRef.current);
        setIsLoaded(true);
      })
      .catch(() => console.error('Failed to load preferences'));
    return () => {
      cancelled = true;
    };
  }, [db, isReady]);

  const reload = useCallback(async () => {
    if (!db || !isReady) return;
    storedRef.current = fromStored(await db.getPreferences());
    setMaps(storedRef.current);
    setIsLoaded(true);
  }, [db, isReady]);

  // The latest maps, for reading the value a failed save must put back
  const mapsRef = useRef(maps);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  /**
   * Change one map: shown at once, then saved. A failed save puts back the
   * stored value of each entry it changed, unless a later change replaced
   * that entry already.
   */
  const updateField = useCallback(
    async <F extends MapField>(field: F, update: (map: Maps[F]) => Maps[F]) => {
      const before = mapsRef.current[field] as Record<string, unknown>;
      const after = update(mapsRef.current[field]) as Record<string, unknown>;
      setMaps((current) => ({ ...current, [field]: update(current[field]) }));
      try {
        if (!db || !isReady) throw new Error('Database not available');
        await db.updatePreferences((stored) => ({ [field]: update(fromStored(stored)[field]) }));
        storedRef.current = { ...storedRef.current, [field]: update(storedRef.current[field]) };
      } catch (err) {
        const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
          (key) => before[key] !== after[key]
        );
        const stored = storedRef.current[field] as Record<string, unknown>;
        setMaps((current) => {
          const map = { ...(current[field] as Record<string, unknown>) };
          for (const key of changed) {
            if (map[key] !== after[key]) continue;
            if (stored[key] === undefined) delete map[key];
            else map[key] = stored[key];
          }
          return { ...current, [field]: map };
        });
        throw err;
      }
    },
    [db, isReady]
  );

  const setEntry = useCallback(
    <F extends MapField>(field: F, key: string, value: Maps[F][string] | null) =>
      updateField(
        field,
        (map) => withEntry(map as Record<string, Maps[F][string]>, key, value) as Maps[F]
      ),
    [updateField]
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
    (values: ReadonlyArray<SavedName>) =>
      updateField('learnedAliases', (map) => learnFromSaved(map, values)),
    [updateField]
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
