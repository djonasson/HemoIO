import { useDeferredValue, useEffect, useState } from 'react';
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCatalog } from '@contexts/useCatalog';
import { searchTests } from '@services/analysis/reviewEdits';
import { formatReviewedValue } from '@/utils/formatReviewedValue';
import { IdentificationLabels } from './IdentificationLabels';
import { NOT_A_LOINC_TEST } from './notLoincTest';
import { TestOptionList } from './TestOptionList';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

/** What a value is saved as, in words */
function savedAsText(biomarker: MatchedBiomarker, name: string | undefined): string {
  if (biomarker.loincCode) return name ?? `LOINC ${biomarker.loincCode}`;
  return biomarker.savedAsUnknown ? NOT_A_LOINC_TEST : 'No test chosen';
}

/**
 * Whether a key ends or cancels an input method's composition: Safari sends
 * that key after the composition, with key code 229
 */
/** Where the tests no longer fit side by side, and the list takes the whole screen */
const PHONE_QUERY = '(max-width: 48em)';

function isComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

interface SavedAsCellProps {
  biomarker: MatchedBiomarker;
  /** A LOINC code, or null for "Not a LOINC test" */
  onChoose: (code: string | null) => void;
}

/** The LOINC test a value will be saved as, with a list to change it */
export function SavedAsCell({ biomarker, onChoose }: SavedAsCellProps): React.ReactElement {
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // The catalog is large: typing stays quick while the results catch up
  const query = useDeferredValue(search);
  const current = biomarker.loincCode;
  const currentName = current ? catalog.test(current)?.name : undefined;
  const isPhone = useMediaQuery(PHONE_QUERY);
  const printed = biomarker.analyzed ?? biomarker;
  // Escape closes the list wherever focus is, as Mantine's own does, but
  // not the Escape that cancels Safari's composition (Mantine's misses it)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isComposing(e)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  // The search is cleared when the list opens, not as it closes: the list
  // stays under the pointer, unchanged, while the dialog fades out
  const openList = () => {
    setSearch('');
    setOpen(true);
  };
  const choose = (code: string | null) => {
    // A second click during the fade-out chooses nothing
    if (!open) return;
    setOpen(false);
    onChoose(code);
  };

  return (
    // The test's name on its own line, wrapping between words; its code,
    // Change and the labels below it, so neither squeezes the other
    <Stack gap={4} align="flex-start">
      <Text size="sm" data-testid="saved-as">
        {savedAsText(biomarker, currentName)}
      </Text>
      {current && (
        <Text size="xs" c="dimmed">
          LOINC {current}
        </Text>
      )}
      <Button
        size="compact-xs"
        variant="subtle"
        px={0}
        onClick={openList}
        aria-label={`Change test for ${biomarker.name}`}
      >
        Change
      </Button>
      <IdentificationLabels biomarker={biomarker} />
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        closeOnEscape={false}
        title={`Saved as: ${biomarker.name}`}
        // Wide enough to set the tests side by side; a phone's whole screen for the cards
        size="72rem"
        fullScreen={isPhone}
      >
        <Text size="sm" c="dimmed" mb="xs">
          {/* As the report printed it, whatever the row was edited to since */}
          Printed: {printed.name} · {formatReviewedValue(biomarker)} {printed.unit}
        </Text>
        <TextInput
          label="Search tests"
          description="Search LOINC by name or code; Enter chooses the first test found"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || isComposing(e.nativeEvent) || !search.trim()) return;
            // The results for exactly what was typed, even before the list catches up
            const [first] = searchTests(catalog, search);
            if (!first) return;
            e.preventDefault();
            choose(first.code);
          }}
          data-autofocus
        />
        <TestOptionList biomarker={biomarker} query={query} isPhone={isPhone} onChoose={choose} />
      </Modal>
    </Stack>
  );
}
