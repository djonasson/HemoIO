import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { proposedTest } from '@services/analysis/nameMatching';
import { searchTests } from '@/utils/biomarkerSuggestions';
import { IdentificationLabels } from './IdentificationLabels';
import { TestOption } from './TestOption';

/** The test a value is saved as; one proposed but whose unit does not fit, as such */
function savedAsText(biomarker: MatchedBiomarker): string {
  if (biomarker.dictionaryMatch) return biomarker.dictionaryMatch.name;
  const proposed = proposedTest(biomarker);
  if (proposed) return `Proposed: ${proposed.name}`;
  return 'Not in dictionary';
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
  /** A dictionary test, or null for "Not in dictionary" */
  onChoose: (definition: BiomarkerDefinition | null) => void;
}

/** The test a value will be saved as, with a list to change it */
export function SavedAsCell({ biomarker, onChoose }: SavedAsCellProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const options = useMemo(() => searchTests(search), [search]);
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
  const choose = (definition: BiomarkerDefinition | null) => {
    // A second click during the fade-out chooses nothing
    if (!open) return;
    setOpen(false);
    onChoose(definition);
  };

  return (
    // The test's name on its own line, wrapping between words; Change and
    // the labels below it, so neither squeezes the other
    <Stack gap={4} align="flex-start">
      <Text size="sm" data-testid="saved-as">
        {savedAsText(biomarker)}
      </Text>
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
          description="Enter chooses the first test found"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isComposing(e.nativeEvent) && search.trim() && options[0]) {
              e.preventDefault();
              choose(options[0]);
            }
          }}
          data-autofocus
        />
        {/* Plain buttons: each is reached with Tab and chosen with Enter or Space */}
        <Stack gap={2} mt="sm" mah={320} style={{ overflowY: 'auto' }} role="group" aria-label="Tests">
          {/* A proposed test is no choice yet */}
          <TestOption
            current={!biomarker.dictionaryMatch && !proposedTest(biomarker)}
            onClick={() => choose(null)}
          >
            Not in dictionary
          </TestOption>
          {options.map((definition) => (
            <TestOption
              key={definition.key}
              current={biomarker.dictionaryMatch?.key === definition.key}
              onClick={() => choose(definition)}
            >
              {definition.name}
            </TestOption>
          ))}
        </Stack>
      </Modal>
    </Stack>
  );
}
