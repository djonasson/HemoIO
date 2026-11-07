import { Badge, Group, Text } from '@mantine/core';
import type { TestOptionDetails } from '@services/analysis/testOptions';

interface TestNotesProps {
  option: TestOptionDetails;
}

/** How common the test is, why it is offered, HemoIO's description of it and LOINC's name */
export function TestNotes({ option }: TestNotesProps) {
  return (
    <>
      {(option.common || option.reason) && (
        <Group component="span" gap={6} mt={2}>
          {option.common && (
            <Badge component="span" size="xs" variant="light" color="gray">
              Common
            </Badge>
          )}
          {option.reason && (
            <Text span size="xs" c="dimmed">
              {option.reason}
            </Text>
          )}
        </Group>
      )}
      {option.description && (
        <Text span size="xs" display="block" mt={2}>
          {option.description}
        </Text>
      )}
      {/* LOINC's own name for the code */}
      <Text span size="xs" c="dimmed" display="block" mt={2}>
        LOINC: {option.name}
      </Text>
    </>
  );
}
