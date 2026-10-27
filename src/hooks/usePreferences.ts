/**
 * Unit preferences and personal targets, shared by every view. Must be used
 * within a PreferencesProvider so a change in one view shows in all.
 */
import { createContext, useContext } from 'react';
import type { SavedName } from '@data/biomarkers/learnedAliases';

export type { SavedName };

export interface PersonalTargetRange {
  low?: number;
  high?: number;
}

export interface PreferencesState {
  /** biomarkerKey → preferred unit */
  unitPreferences: Readonly<Record<string, string>>;
  /** biomarkerKey → personal target, in the biomarker's standard unit */
  personalTargets: Readonly<Record<string, PersonalTargetRange>>;
  /** True once the stored preferences have been read */
  isLoaded: boolean;
  setPreferredUnit(biomarkerKey: string, unit: string): Promise<void>;
  /** null removes the target */
  setPersonalTarget(biomarkerKey: string, target: PersonalTargetRange | null): Promise<void>;
  /** The user's own aliases: printed name (normalised) → biomarker key */
  learnedAliases: Readonly<Record<string, string>>;
  /** Learn the names of saved values; "Not in dictionary" forgets them */
  learnAliases(values: ReadonlyArray<SavedName>): Promise<void>;
  removeLearnedAlias(name: string): Promise<void>;
  /** Re-read the stored preferences, e.g. after a backup restore */
  reload(): Promise<void>;
}

export const PreferencesContext = createContext<PreferencesState | null>(null);

export function usePreferences(): PreferencesState {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
