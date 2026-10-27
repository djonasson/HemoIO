import { useMemo, useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import {
  BIOMARKER_DEFINITIONS,
  searchBiomarkers,
  type BiomarkerDefinition,
} from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { IdentificationLabels } from './IdentificationLabels';

/** The test a value is saved as; one the AI proposed but whose unit does not fit, as such */
function savedAsText(biomarker: MatchedBiomarker): string {
  if (biomarker.dictionaryMatch) return biomarker.dictionaryMatch.name;
  if (biomarker.suggestedMatch && biomarker.identificationFlags?.includes('unit-mismatch')) {
    return `Proposed: ${biomarker.suggestedMatch.name}`;
  }
  return 'Not in dictionary';
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
  const options = useMemo(
    () => (search.trim() ? searchBiomarkers(search) : BIOMARKER_DEFINITIONS),
    [search]
  );
  const choose = (definition: BiomarkerDefinition | null) => {
    setOpen(false);
    setSearch('');
    onChoose(definition);
  };

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" data-testid="saved-as">
          {savedAsText(biomarker)}
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => setOpen(true)}
          aria-label={`Change test for ${biomarker.name}`}
        >
          Change
        </Button>
      </Group>
      <IdentificationLabels biomarker={biomarker} />
      <Modal opened={open} onClose={() => setOpen(false)} title={`Saved as: ${biomarker.name}`}>
        <TextInput
          label="Search tests"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          data-autofocus
        />
        <Stack
          gap={2}
          mt="sm"
          role="listbox"
          aria-label="Tests"
          mah={320}
          style={{ overflowY: 'auto' }}
        >
          <UnstyledButton
            role="option"
            aria-selected={!biomarker.dictionaryMatch}
            onClick={() => choose(null)}
          >
            Not in dictionary
          </UnstyledButton>
          {options.map((definition) => (
            <UnstyledButton
              key={definition.key}
              role="option"
              aria-selected={biomarker.dictionaryMatch?.key === definition.key}
              onClick={() => choose(definition)}
            >
              {definition.name}
            </UnstyledButton>
          ))}
        </Stack>
      </Modal>
    </Stack>
  );
}
