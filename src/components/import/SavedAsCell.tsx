import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useCatalog } from '@contexts/useCatalog';
import { searchTests } from '@services/analysis/reviewEdits';
import { IdentificationLabels } from './IdentificationLabels';
import { TestOption } from './TestOption';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

export const NOT_A_LOINC_TEST = 'Not a LOINC test';

/** A test to choose: its code and LOINC long name */
interface Option {
  code: string;
  name: string;
}

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
  // With no search, the tests the value may be (the current one first, if it is not one of them)
  const options = useMemo<Option[]>(() => {
    if (query.trim()) return searchTests(catalog, query).map(({ code, name }) => ({ code, name }));
    const candidates = biomarker.candidates.map(({ code, name }) => ({ code, name }));
    return current && currentName && !candidates.some((c) => c.code === current)
      ? [{ code: current, name: currentName }, ...candidates]
      : candidates;
  }, [catalog, query, biomarker.candidates, current, currentName]);
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
      >
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
        {/* Plain buttons: each is reached with Tab and chosen with Enter or Space */}
        <Stack gap={2} mt="sm" mah={320} style={{ overflowY: 'auto' }} role="group" aria-label="Tests">
          <TestOption current={biomarker.savedAsUnknown === true && !current} onClick={() => choose(null)}>
            {NOT_A_LOINC_TEST}
          </TestOption>
          {options.map((option) => (
            <TestOption
              key={option.code}
              code={option.code}
              current={current === option.code}
              onClick={() => choose(option.code)}
            >
              {option.name}
            </TestOption>
          ))}
          {query.trim() && options.length === 0 && (
            <Text size="sm" c="dimmed" role="status">
              No test found
            </Text>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
