/**
 * BiomarkerDictionary Component
 *
 * Browse the tests HemoIO describes and the tests the user has values for,
 * by LOINC class, and search the whole LOINC catalog.
 */

import { useMemo, useState } from 'react';
import {
  Stack,
  TextInput,
  Accordion,
  Text,
  Badge,
  Group,
  Paper,
  Title,
  Box,
} from '@mantine/core';
import { IconSearch, IconChevronRight } from '@tabler/icons-react';
import { useCatalog } from '@contexts/useCatalog';
import {
  dictionaryEntries,
  groupByClass,
  searchDictionary,
  type DictionaryEntry,
} from './dictionaryEntries';

/**
 * Props for BiomarkerDictionary component
 */
export interface BiomarkerDictionaryProps {
  /** Called with the trend code of the test chosen */
  onSelectBiomarker?: (code: string) => void;
  /** Trend code of the test shown */
  selectedBiomarker?: string;
  /** Keys of the user's values, whose tests the list shows too */
  valueKeys?: ReadonlyArray<string>;
  /** The search field, for the caller to focus */
  searchRef?: React.Ref<HTMLInputElement>;
}

const NO_KEYS: ReadonlyArray<string> = [];

/**
 * BiomarkerDictionary component for browsing biomarker reference information
 */
export function BiomarkerDictionary({
  onSelectBiomarker,
  selectedBiomarker,
  valueKeys = NO_KEYS,
  searchRef,
}: BiomarkerDictionaryProps): React.ReactNode {
  const catalog = useCatalog();
  const [searchTerm, setSearchTerm] = useState('');

  const entries = useMemo(() => dictionaryEntries(catalog, valueKeys), [catalog, valueKeys]);
  const groups = useMemo(() => groupByClass(entries), [entries]);

  // null: no search, so the class view
  const filteredBiomarkers = useMemo(
    () => (searchTerm.trim() ? searchDictionary(catalog, entries, searchTerm) : null),
    [catalog, entries, searchTerm]
  );

  return (
    <Stack gap="md">
      <Title order={2}>Biomarker Dictionary</Title>

      <Text c="dimmed" size="sm">
        Browse and learn about different biomarkers. Click on a biomarker to see
        detailed information including reference ranges and what abnormal values
        may indicate.
      </Text>

      {/* Search */}
      <TextInput
        placeholder="Search biomarkers..."
        leftSection={<IconSearch size={16} />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.currentTarget.value)}
        aria-label="Search biomarkers"
        ref={searchRef}
      />

      {/* Search Results */}
      {filteredBiomarkers !== null ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {filteredBiomarkers.length} result{filteredBiomarkers.length !== 1 ? 's' : ''} found
          </Text>
          {filteredBiomarkers.length === 0 ? (
            <Paper p="md" withBorder>
              <Text c="dimmed" ta="center">
                No biomarkers found matching "{searchTerm}"
              </Text>
            </Paper>
          ) : (
            // No inner scroll box: the page is the only scroll position Back
            // has to restore
            <Stack gap="xs">
              {filteredBiomarkers.map((biomarker) => (
                <BiomarkerListItem
                  key={biomarker.code}
                  biomarker={biomarker}
                  isSelected={selectedBiomarker === biomarker.code}
                  onClick={() => onSelectBiomarker?.(biomarker.code)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      ) : (
        /* Category View */
        <Accordion variant="contained" chevronPosition="right">
          {groups.map((group) => (
            <Accordion.Item key={group.classLabel} value={group.classLabel}>
              <Accordion.Control>
                <Group justify="space-between">
                  <Text fw={500}>{group.classLabel}</Text>
                  <Badge variant="light" color="gray">
                    {group.entries.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {group.entries.map((biomarker) => (
                    <BiomarkerListItem
                      key={biomarker.code}
                      biomarker={biomarker}
                      isSelected={selectedBiomarker === biomarker.code}
                      onClick={() => onSelectBiomarker?.(biomarker.code)}
                    />
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Stack>
  );
}

/**
 * Props for BiomarkerListItem
 */
interface BiomarkerListItemProps {
  biomarker: DictionaryEntry;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Individual biomarker list item
 */
function BiomarkerListItem({
  biomarker,
  isSelected,
  onClick,
}: BiomarkerListItemProps): React.ReactNode {
  return (
    <Paper
      p="sm"
      withBorder
      // Mantine's keyboard focus ring; a Paper has none of its own
      className="mantine-focus-auto"
      style={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      data-biomarker-key={biomarker.code}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`View details for ${biomarker.name}`}
      aria-selected={isSelected}
    >
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} truncate>
            {biomarker.name}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {biomarker.summary}
          </Text>
        </Box>
        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
      </Group>
    </Paper>
  );
}
