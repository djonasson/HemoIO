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
import { useCatalog } from '@contexts/useCatalog';
import { testUnits, trendCode } from '@data/loinc/display';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { useLabResults } from '@hooks/useLabResults';
import { usePreferences } from '@hooks/usePreferences';
import { resolveDisplayUnit } from '@services/units';
import { summarizeBiomarkerResults } from '@services/statistics';
import { PersonalTargetModal } from '@components/settings/PersonalTargetModal';
import { toPersonalTarget } from '@components/settings/personalTarget';
import { BiomarkerDictionary } from './BiomarkerDictionary';
import { BiomarkerDetail } from './BiomarkerDetail';

export interface DictionaryViewProps {
  /** Show a biomarker's trend chart */
  onOpenTrend: (biomarkerKey: string) => void;
  /** Open on this test's detail; a key that is not a LOINC test shows the list */
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
  const catalog = useCatalog();
  const { results } = useLabResults();
  const { unitPreferences, personalTargets, setPersonalTarget } = usePreferences();
  // The trend code of the test shown
  const [selected, setSelected] = useState<string | null>(() => {
    const code = initialBiomarkerKey ? trendCode(catalog, initialBiomarkerKey) : undefined;
    return code && catalog.test(code) ? code : null;
  });
  const [openedOnDetail] = useState(selected !== null);
  // Opened on a detail, the list is built only if Back asks for it
  const [listShown, setListShown] = useState(!openedOnDetail);
  const [editingTarget, setEditingTarget] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Opened on a detail: Back shows the list from the top, focused on its search
  const listPosition = useRef<ListPosition | null>(
    openedOnDetail ? { biomarkerKey: null, scrollY: 0 } : null
  );

  const handleSelectFromList = useCallback((code: string) => {
    listPosition.current = { biomarkerKey: code, scrollY: window.scrollY };
    setSelected(code);
    window.scrollTo(0, 0);
  }, []);

  // The list shows the tests of the user's values too
  const valueKeys = useMemo(
    () => [...new Set(results.flatMap((result) => result.testValues.map((tv) => tv.biomarkerKey)))],
    [results]
  );

  const handleBack = useCallback(() => {
    setListShown(true);
    setSelected(null);
  }, []);

  // Before paint, so the list never shows at the top first
  useLayoutEffect(() => {
    if (selected || !listPosition.current) return;
    const { biomarkerKey, scrollY } = listPosition.current;
    listPosition.current = null;
    const focusTarget =
      biomarkerKey === null
        ? searchRef.current
        : listRef.current?.querySelector<HTMLElement>(`[data-biomarker-key="${biomarkerKey}"]`);
    focusTarget?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
  }, [selected]);

  const summary = useMemo(
    () =>
      selected
        ? summarizeBiomarkerResults(
            catalog,
            results,
            selected,
            resolveDisplayUnit(testUnits(catalog, selected), unitPreferences[selected])
          )
        : null,
    [catalog, results, selected, unitPreferences]
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

  const target = selected ? personalTargets[selected] : undefined;

  return (
    <>
      {listShown && (
        <Box ref={listRef} style={{ display: selected ? 'none' : undefined }}>
          <BiomarkerDictionary
            onSelectBiomarker={handleSelectFromList}
            selectedBiomarker={selected ?? undefined}
            valueKeys={valueKeys}
            searchRef={searchRef}
          />
        </Box>
      )}
      {selected && (
        <BiomarkerDetail
          code={selected}
          summary={summary}
          personalTarget={target}
          onBack={handleBack}
          onViewTrend={onOpenTrend}
          onEditTarget={() => setEditingTarget(true)}
        />
      )}
      <PersonalTargetModal
        target={selected && editingTarget ? toPersonalTarget(catalog, selected, target) : null}
        onSave={handleSaveTarget}
        onClose={() => setEditingTarget(false)}
      />
    </>
  );
}
