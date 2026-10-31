/**
 * DictionaryView Component
 *
 * The biomarker list, or one biomarker's detail in its place. Once shown, the
 * list stays mounted while hidden, so Back returns to the same search and
 * open categories; the scroll position and focus are restored by hand.
 * Opened on a detail from another view, the list is built only on Back, and
 * then shows from the top with its search focused.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mantine/core';
import { getBiomarkerByKey } from '@data/biomarkers';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { useLabResults } from '@hooks/useLabResults';
import { usePreferences } from '@hooks/usePreferences';
import { resolveDisplayUnit } from '@services/units';
import { summarizeBiomarkerResults } from '@services/statistics';
import { PersonalTargetModal } from '@components/settings/PersonalTargetModal';
import { toPersonalTarget } from '@components/settings/personalTarget';
import { BiomarkerDictionary } from './BiomarkerDictionary';
import { BiomarkerDetail } from './BiomarkerDetail';
import type { BiomarkerDefinition } from '@data/biomarkers';

export interface DictionaryViewProps {
  /** Show a biomarker's trend chart */
  onOpenTrend: (biomarkerKey: string) => void;
  /** Open on this biomarker's detail; a key the dictionary lacks shows the list */
  initialBiomarkerKey?: string;
}

/** Where to put the list back when the detail closes */
interface ListPosition {
  /** The list item to focus; null focuses the search (the list was never shown) */
  biomarkerKey: string | null;
  scrollY: number;
}

export function DictionaryView({
  onOpenTrend,
  initialBiomarkerKey,
}: DictionaryViewProps): React.ReactNode {
  const { results } = useLabResults();
  const { unitPreferences, personalTargets, setPersonalTarget } = usePreferences();
  const [selected, setSelected] = useState<BiomarkerDefinition | null>(
    () => (initialBiomarkerKey ? (getBiomarkerByKey(initialBiomarkerKey) ?? null) : null)
  );
  const [openedOnDetail] = useState(selected !== null);
  // Opened on a detail, the list is built only if Back asks for it
  const [listShown, setListShown] = useState(!openedOnDetail);
  const [editingTarget, setEditingTarget] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Opened on a detail: Back shows the list from the top, focused on its search
  const listPosition = useRef<ListPosition | null>(
    openedOnDetail ? { biomarkerKey: null, scrollY: 0 } : null
  );

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

  const handleBack = useCallback(() => {
    setListShown(true);
    setSelected(null);
  }, []);

  // Before paint, so the list never shows at the top first
  useLayoutEffect(() => {
    if (selected || !listPosition.current) return;
    const { biomarkerKey, scrollY } = listPosition.current;
    listPosition.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(
        biomarkerKey === null
          ? 'input[aria-label="Search biomarkers"]'
          : `[data-biomarker-key="${biomarkerKey}"]`
      )
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
      setPersonalTarget(biomarkerKey, { low, high }).catch((err: unknown) =>
        notifySaveFailed('Personal target not saved', err)
      );
    },
    [setPersonalTarget]
  );

  const target = selected ? personalTargets[selected.key] : undefined;

  return (
    <>
      {listShown && (
        <Box ref={listRef} style={{ display: selected ? 'none' : undefined }}>
          <BiomarkerDictionary
            onSelectBiomarker={handleSelectFromList}
            selectedBiomarker={selected?.name}
          />
        </Box>
      )}
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
        target={selected && editingTarget ? toPersonalTarget(selected, target) : null}
        onSave={handleSaveTarget}
        onClose={() => setEditingTarget(false)}
      />
    </>
  );
}
