/**
 * PersonalTargetModal Component
 *
 * Sets the personal target range of one biomarker. Used by Settings and by
 * the biomarker detail.
 */

import { useState } from 'react';
import { Modal, Stack, Text, Group, NumberInput, Button } from '@mantine/core';
import { formatRange } from '@/utils/formatRange';
import type { PersonalTarget } from './personalTarget';

export interface PersonalTargetModalProps {
  /** The biomarker being edited; null keeps the modal closed */
  target: PersonalTarget | null;
  onSave: (biomarkerKey: string, low: number | undefined, high: number | undefined) => void;
  onClose: () => void;
}

export function PersonalTargetModal({
  target,
  onSave,
  onClose,
}: PersonalTargetModalProps): React.ReactNode {
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={`Set Personal Target for ${target?.biomarkerName}`}
      centered
    >
      {/* Keyed so each biomarker opens on its own values */}
      {target && (
        <TargetForm key={target.biomarkerKey} target={target} onSave={onSave} onClose={onClose} />
      )}
    </Modal>
  );
}

function TargetForm({
  target,
  onSave,
  onClose,
}: {
  target: PersonalTarget;
  onSave: PersonalTargetModalProps['onSave'];
  onClose: () => void;
}): React.ReactNode {
  const [low, setLow] = useState<number | ''>(target.personalLow ?? '');
  const [high, setHigh] = useState<number | ''>(target.personalHigh ?? '');

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Standard reference range: {formatRange(target.standardLow, target.standardHigh)}{' '}
        {target.unit}
      </Text>

      <Group grow>
        <NumberInput
          label="Low Value"
          placeholder="Min"
          value={low}
          onChange={(value) => setLow(value === '' ? '' : Number(value))}
          min={0}
          decimalScale={2}
          aria-label="Personal target low value"
        />
        <NumberInput
          label="High Value"
          placeholder="Max"
          value={high}
          onChange={(value) => setHigh(value === '' ? '' : Number(value))}
          min={0}
          decimalScale={2}
          aria-label="Personal target high value"
        />
      </Group>

      <Text size="xs" c="dimmed">
        Leave a field empty to use only one bound (e.g., only set high value for values that should
        stay below a certain level).
      </Text>

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave(
              target.biomarkerKey,
              low === '' ? undefined : low,
              high === '' ? undefined : high
            )
          }
          disabled={low === '' && high === ''}
        >
          Save Target
        </Button>
      </Group>
    </Stack>
  );
}
