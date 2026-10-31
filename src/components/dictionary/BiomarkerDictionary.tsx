/**
 * BiomarkerDictionary Component
 *
 * Browse and search the biomarker reference dictionary.
 */

import { useState, useMemo, useCallback } from 'react';
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
import {
  BIOMARKER_DEFINITIONS,
  CATEGORY_NAMES,
  searchBiomarkers,
  type BiomarkerDefinition,
} from '@data/biomarkers';
import type { BiomarkerCategory } from '@/types';

/**
 * Props for BiomarkerDictionary component
 */
export interface BiomarkerDictionaryProps {
  /** Called when a biomarker is selected */
  onSelectBiomarker?: (biomarker: BiomarkerDefinition) => void;
  /** Currently selected biomarker name */
  selectedBiomarker?: string;
  /** The search field, for the caller to focus */
  searchRef?: React.Ref<HTMLInputElement>;
}

/**
 * Get biomarkers grouped by category
 */
function getBiomarkersByCategory(): Record<BiomarkerCategory, BiomarkerDefinition[]> {
  const grouped: Record<BiomarkerCategory, BiomarkerDefinition[]> = {
    cbc: [],
    metabolic: [],
    lipid: [],
    thyroid: [],
    iron: [],
    vitamin: [],
    urinalysis: [],
    fertility: [],
    other: [],
  };

  for (const biomarker of BIOMARKER_DEFINITIONS) {
    grouped[biomarker.category].push(biomarker);
  }

  return grouped;
}

/**
 * BiomarkerDictionary component for browsing biomarker reference information
 */
export function BiomarkerDictionary({
  onSelectBiomarker,
  selectedBiomarker,
  searchRef,
}: BiomarkerDictionaryProps): React.ReactNode {
  const [searchTerm, setSearchTerm] = useState('');

  // Group biomarkers by category
  const biomarkersByCategory = useMemo(() => getBiomarkersByCategory(), []);

  // Filter biomarkers by search term
  const filteredBiomarkers = useMemo(() => {
    if (!searchTerm.trim()) {
      return null; // Show category view
    }
    return searchBiomarkers(searchTerm);
  }, [searchTerm]);

  // Handle biomarker click
  const handleBiomarkerClick = useCallback(
    (biomarker: BiomarkerDefinition) => {
      onSelectBiomarker?.(biomarker);
    },
    [onSelectBiomarker]
  );

  // Get categories with biomarkers
  const categoriesWithBiomarkers = useMemo(() => {
    return (Object.keys(CATEGORY_NAMES) as BiomarkerCategory[]).filter(
      (category) => biomarkersByCategory[category].length > 0
    );
  }, [biomarkersByCategory]);

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
                  key={biomarker.name}
                  biomarker={biomarker}
                  isSelected={selectedBiomarker === biomarker.name}
                  onClick={() => handleBiomarkerClick(biomarker)}
                />
              ))}
            </Stack>
          )}
        </Stack>
      ) : (
        /* Category View */
        <Accordion variant="contained" chevronPosition="right">
          {categoriesWithBiomarkers.map((category) => (
            <Accordion.Item key={category} value={category}>
              <Accordion.Control>
                <Group justify="space-between">
                  <Text fw={500}>{CATEGORY_NAMES[category]}</Text>
                  <Badge variant="light" color="gray">
                    {biomarkersByCategory[category].length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {biomarkersByCategory[category].map((biomarker) => (
                    <BiomarkerListItem
                      key={biomarker.name}
                      biomarker={biomarker}
                      isSelected={selectedBiomarker === biomarker.name}
                      onClick={() => handleBiomarkerClick(biomarker)}
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
  biomarker: BiomarkerDefinition;
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
      data-biomarker-key={biomarker.key}
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
          <Group gap="xs" wrap="nowrap">
            <Text fw={500} truncate>
              {biomarker.name}
            </Text>
            {biomarker.aliases.length > 0 && (
              <Text size="xs" c="dimmed" truncate>
                ({biomarker.aliases[0]})
              </Text>
            )}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {biomarker.description}
          </Text>
        </Box>
        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
      </Group>
    </Paper>
  );
}
