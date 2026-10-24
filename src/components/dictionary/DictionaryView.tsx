/**
 * DictionaryView Component
 *
 * The biomarker list, or one biomarker's detail in its place. The list stays
 * mounted while hidden, so Back returns to the same search and open
 * categories; the scroll position and focus are restored by hand.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useLabResults } from '@hooks/useLabResults';
import { usePreferences } from '@hooks/usePreferences';
import { resolveDisplayUnit } from '@services/units';
import { summarizeBiomarkerResults } from '@services/statistics';
import { PersonalTargetModal } from '@components/settings/PersonalTargetModal';
import { BiomarkerDictionary } from './BiomarkerDictionary';
import { BiomarkerDetail } from './BiomarkerDetail';
import type { BiomarkerDefinition } from '@data/biomarkers';

export interface DictionaryViewProps {
  /** Show a biomarker's trend chart */
  onOpenTrend: (biomarkerKey: string) => void;
}

/** Where to put the list back when the detail closes */
interface ListPosition {
  biomarkerKey: string;
  scrollY: number;
}

export function DictionaryView({ onOpenTrend }: DictionaryViewProps): React.ReactNode {
  const { results } = useLabResults();
  const { unitPreferences, personalTargets, setPersonalTarget } = usePreferences();
  const [selected, setSelected] = useState<BiomarkerDefinition | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listPosition = useRef<ListPosition | null>(null);

  const handleSelectFromList = useCallback((biomarker: BiomarkerDefinition) => {
    listPosition.current = { biomarkerKey: biomarker.key, scrollY: window.scrollY };
    setSelected(biomarker);
    window.scrollTo(0, 0);
  }, []);

  // A related biomarker replaces the detail; Back still returns to the list
  // as it was when the first detail was opened
  const handleSelectRelated = useCallback((biomarker: BiomarkerDefinition) => {
    setSelected(biomarker);
    window.scrollTo(0, 0);
  }, []);

  const handleBack = useCallback(() => setSelected(null), []);

  // Before paint, so the list never shows at the top first
  useLayoutEffect(() => {
    if (selected || !listPosition.current) return;
    const { biomarkerKey, scrollY } = listPosition.current;
    listPosition.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-biomarker-key="${biomarkerKey}"]`)
      ?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
  }, [selected]);

  const summary = useMemo(
    () =>
      selected
        ? summarizeBiomarkerResults(
            results,
            selected,
            resolveDisplayUnit(selected, unitPreferences[selected.key])
          )
        : null,
    [results, selected, unitPreferences]
  );

  const handleSaveTarget = useCallback(
    (biomarkerKey: string, low: number | undefined, high: number | undefined) => {
      setEditingTarget(false);
      setPersonalTarget(biomarkerKey, { low, high }).catch(() => {
        notifications.show({
          title: 'Personal target not saved',
          message: 'Your target could not be saved. Try again.',
          color: 'red',
        });
      });
    },
    [setPersonalTarget]
  );

  const target = selected ? personalTargets[selected.key] : undefined;

  return (
    <>
      <Box ref={listRef} style={{ display: selected ? 'none' : undefined }}>
        <BiomarkerDictionary
          onSelectBiomarker={handleSelectFromList}
          selectedBiomarker={selected?.name}
        />
      </Box>
      {selected && (
        <BiomarkerDetail
          biomarker={selected}
          summary={summary}
          personalTarget={target}
          onBack={handleBack}
          onViewTrend={onOpenTrend}
          onEditTarget={() => setEditingTarget(true)}
          onSelectRelated={handleSelectRelated}
        />
      )}
      <PersonalTargetModal
        target={
          selected && editingTarget
            ? {
                biomarkerKey: selected.key,
                biomarkerName: selected.name,
                unit: selected.canonicalUnit,
                standardLow: selected.defaultReferenceRange?.low,
                standardHigh: selected.defaultReferenceRange?.high,
                personalLow: target?.low,
                personalHigh: target?.high,
              }
            : null
        }
        onSave={handleSaveTarget}
        onClose={() => setEditingTarget(false)}
      />
    </>
  );
}
