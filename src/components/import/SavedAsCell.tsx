import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Box, Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCatalog } from '@contexts/useCatalog';
import { searchTests } from '@services/analysis/reviewEdits';
import { describeTestOptions } from '@services/analysis/testOptions';
import { formatReviewedValue } from '@/utils/formatReviewedValue';
import { IdentificationLabels } from './IdentificationLabels';
import { TestOptionCards } from './TestOptionCards';
import { TestOptionTable } from './TestOptionTable';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

export const NOT_A_LOINC_TEST = 'Not a LOINC test';

/** Where the tests no longer fit side by side, and the list takes the whole screen */
const PHONE_QUERY = '(max-width: 48em)';

/** What a value is saved as, in words */
function savedAsText(biomarker: MatchedBiomarker, name: string | undefined): string {
  if (biomarker.loincCode) return name ?? `LOINC ${biomarker.loincCode}`;
  return biomarker.savedAsUnknown ? NOT_A_LOINC_TEST : 'No test chosen';
}

/**
 * Whether a key ends or cancels an input method's composition: Safari sends
 * that key after the composition, with key code 229
 */
function isComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

interface SavedAsCellProps {
  biomarker: MatchedBiomarker;
  /** A LOINC code, or null for "Not a LOINC test" */
  onChoose: (code: string | null) => void;
}

/** The LOINC test a value will be saved as, with a list to change it */
export function SavedAsCell({ biomarker, onChoose }: SavedAsCellProps) {
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // The catalog is large: typing stays quick while the results catch up
  const query = useDeferredValue(search);
  const current = biomarker.loincCode;
  const currentName = current ? catalog.test(current)?.name : undefined;
  const isPhone = useMediaQuery(PHONE_QUERY) ?? false;
  // With no search, the tests the value may be (the current one first, if it is not one of them)
  const options = useMemo(() => {
    const searching = query.trim() !== '';
    const codes = searching
      ? searchTests(catalog, query).map(({ code }) => code)
      : [
          ...(current && !biomarker.candidates.some((c) => c.code === current) ? [current] : []),
          ...biomarker.candidates.map(({ code }) => code),
        ];
    return describeTestOptions(catalog, biomarker, codes, { suggested: !searching });
  }, [catalog, query, biomarker, current]);
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
  const listProps = {
    options,
    current,
    notLoinc: biomarker.savedAsUnknown === true && !current,
    unit: biomarker.unit,
    notLoincLabel: NOT_A_LOINC_TEST,
    onChoose: choose,
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
          Printed: {biomarker.name} · {formatReviewedValue(biomarker)} {biomarker.unit}
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
        <Box mt="sm" mah={isPhone ? undefined : '60vh'} style={{ overflowY: 'auto' }}>
          {isPhone ? <TestOptionCards {...listProps} /> : <TestOptionTable {...listProps} />}
          {query.trim() && options.length === 0 && (
            <Text size="sm" c="dimmed" role="status" mt="xs">
              No test found
            </Text>
          )}
        </Box>
      </Modal>
    </Stack>
  );
}
