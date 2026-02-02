/**
 * PersonalTargets Component
 *
 * Settings section for personal biomarker target ranges.
 */

import { useState, useCallback } from 'react';
import {
  Stack,
  Paper,
  Title,
  Text,
  Table,
  NumberInput,
  Button,
  Group,
  Alert,
  Modal,
  TextInput,
  Badge,
  ActionIcon,
  Tooltip,
  ScrollArea,
} from '@mantine/core';
import {
  IconTarget,
  IconCheck,
  IconTrash,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';

/**
 * Personal target range for a biomarker
 */
export interface PersonalTarget {
  biomarkerId: number;
  biomarkerName: string;
  unit: string;
  standardLow?: number;
  standardHigh?: number;
  personalLow?: number;
  personalHigh?: number;
}

/**
 * Props for PersonalTargets component
 */
export interface PersonalTargetsProps {
  /** List of biomarkers with their targets */
  targets: PersonalTarget[];
  /** Called when a personal target is set */
  onSetTarget: (biomarkerId: number, low: number | undefined, high: number | undefined) => void;
  /** Called when a personal target is cleared */
  onClearTarget: (biomarkerId: number) => void;
  /** Whether changes are being saved */
  isSaving?: boolean;
}

/**
 * PersonalTargets component for managing custom biomarker ranges
 */
export function PersonalTargets({
  targets,
  onSetTarget,
  onClearTarget,
  isSaving = false,
}: PersonalTargetsProps): React.ReactNode {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTarget, setEditingTarget] = useState<PersonalTarget | null>(null);
  const [editLow, setEditLow] = useState<number | ''>('');
  const [editHigh, setEditHigh] = useState<number | ''>('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Filter targets by search term
  const filteredTargets = targets.filter((target) =>
    target.biomarkerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Count personal targets
  const personalTargetCount = targets.filter(
    (t) => t.personalLow !== undefined || t.personalHigh !== undefined
  ).length;

  // Handle open edit modal
  const handleOpenEdit = useCallback((target: PersonalTarget) => {
    setEditingTarget(target);
    setEditLow(target.personalLow ?? '');
    setEditHigh(target.personalHigh ?? '');
  }, []);

  // Handle save target
  const handleSaveTarget = useCallback(() => {
    if (!editingTarget) return;

    const low = editLow === '' ? undefined : editLow;
    const high = editHigh === '' ? undefined : editHigh;

    onSetTarget(editingTarget.biomarkerId, low, high);
    setEditingTarget(null);

    // Show success briefly
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [editingTarget, editLow, editHigh, onSetTarget]);

  // Handle clear target
  const handleClearTarget = useCallback(
    (biomarkerId: number) => {
      onClearTarget(biomarkerId);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onClearTarget]
  );

  // Handle close modal
  const handleCloseModal = useCallback(() => {
    setEditingTarget(null);
    setEditLow('');
    setEditHigh('');
  }, []);

  // Check if target has personal values
  const hasPersonalTarget = (target: PersonalTarget): boolean => {
    return target.personalLow !== undefined || target.personalHigh !== undefined;
  };

  return (
    <>
      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Personal Target Ranges</Title>
            {personalTargetCount > 0 && (
              <Badge color="blue" variant="light">
                {personalTargetCount} custom
              </Badge>
            )}
          </Group>

          <Text size="sm" c="dimmed">
            Set personal target ranges for biomarkers that differ from standard
            reference ranges. Your personal targets will be used to determine
            if values are within your optimal range.
          </Text>

          {saveSuccess && (
            <Alert color="green" icon={<IconCheck size={16} />}>
              Personal target saved
            </Alert>
          )}

          {/* Search */}
          <TextInput
            placeholder="Search biomarkers..."
            leftSection={<IconSearch size={16} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.currentTarget.value)}
            aria-label="Search biomarkers"
          />

          {/* Targets Table */}
          {filteredTargets.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              No biomarkers found matching your search.
            </Text>
          ) : (
            <ScrollArea h={400}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Biomarker</Table.Th>
                    <Table.Th>Standard Range</Table.Th>
                    <Table.Th>Personal Target</Table.Th>
                    <Table.Th w={100}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredTargets.map((target) => (
                    <Table.Tr key={target.biomarkerId}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {target.biomarkerName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {target.unit}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {formatRange(target.standardLow, target.standardHigh)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {hasPersonalTarget(target) ? (
                          <Badge color="blue" variant="light" leftSection={<IconTarget size={12} />}>
                            {formatRange(target.personalLow, target.personalHigh)}
                          </Badge>
                        ) : (
                          <Text size="sm" c="dimmed">
                            Using standard
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Set personal target">
                            <ActionIcon
                              variant="subtle"
                              onClick={() => handleOpenEdit(target)}
                              disabled={isSaving}
                              aria-label={`Set personal target for ${target.biomarkerName}`}
                            >
                              <IconPlus size={16} />
                            </ActionIcon>
                          </Tooltip>
                          {hasPersonalTarget(target) && (
                            <Tooltip label="Clear personal target">
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => handleClearTarget(target.biomarkerId)}
                                disabled={isSaving}
                                aria-label={`Clear personal target for ${target.biomarkerName}`}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}

          {/* Info Alert */}
          <Alert color="blue" icon={<IconTarget size={16} />} variant="light">
            <Text size="sm">
              Personal targets help you track your health goals. When set, they
              will be used instead of standard reference ranges to highlight
              values outside your optimal range.
            </Text>
          </Alert>
        </Stack>
      </Paper>

      {/* Edit Modal */}
      <Modal
        opened={editingTarget !== null}
        onClose={handleCloseModal}
        title={`Set Personal Target for ${editingTarget?.biomarkerName}`}
        centered
      >
        {editingTarget && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Standard reference range: {formatRange(editingTarget.standardLow, editingTarget.standardHigh)} {editingTarget.unit}
            </Text>

            <Group grow>
              <NumberInput
                label="Low Value"
                placeholder="Min"
                value={editLow}
                onChange={(value) => setEditLow(value === '' ? '' : Number(value))}
                min={0}
                decimalScale={2}
                aria-label="Personal target low value"
              />
              <NumberInput
                label="High Value"
                placeholder="Max"
                value={editHigh}
                onChange={(value) => setEditHigh(value === '' ? '' : Number(value))}
                min={0}
                decimalScale={2}
                aria-label="Personal target high value"
              />
            </Group>

            <Text size="xs" c="dimmed">
              Leave a field empty to use only one bound (e.g., only set high value
              for values that should stay below a certain level).
            </Text>

            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveTarget}
                disabled={editLow === '' && editHigh === ''}
              >
                Save Target
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}

/**
 * Format a range for display
 */
function formatRange(low: number | undefined, high: number | undefined): string {
  if (low === undefined && high === undefined) {
    return 'N/A';
  }
  if (low === undefined) {
    return `< ${high}`;
  }
  if (high === undefined) {
    return `> ${low}`;
  }
  return `${low} - ${high}`;
}
