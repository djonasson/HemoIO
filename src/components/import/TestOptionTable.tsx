import { Box, Group, Table, Text, UnstyledButton } from '@mantine/core';
import { CurrentMark } from './CurrentMark';
import { TestNotes } from './TestNotes';
import { UnitsText } from './UnitsText';
import type { TestOptionDetails } from '@services/analysis/testOptions';

interface TestOptionTableProps {
  options: TestOptionDetails[];
  /** The code the value is saved as, if any */
  current: string | undefined;
  /** Whether the value is saved as "Not a LOINC test" */
  notLoinc: boolean;
  /** The value's own unit */
  unit: string;
  notLoincLabel: string;
  onChoose: (code: string | null) => void;
}

/**
 * The tests side by side, LOINC's name cut into its parts so a difference
 * shows as a different cell in a column. A click anywhere on a row chooses
 * it; the button in its first cell is what the keyboard reaches.
 */
export function TestOptionTable({ options, current, notLoinc, unit, notLoincLabel, onChoose }: TestOptionTableProps) {
  return (
    <Table highlightOnHover stickyHeader verticalSpacing="xs" aria-label="Tests">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Test</Table.Th>
          <Table.Th>Sample</Table.Th>
          <Table.Th>Method</Table.Th>
          <Table.Th>Units</Table.Th>
          <Table.Th>Code</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => onChoose(null)}>
          <Table.Td colSpan={5}>
            <UnstyledButton aria-current={notLoinc ? 'true' : undefined}>
              <Group component="span" gap={6} wrap="nowrap">
                <CurrentMark current={notLoinc} />
                <Text span size="sm" fw={notLoinc ? 600 : undefined}>
                  {notLoincLabel}
                </Text>
              </Group>
            </UnstyledButton>
          </Table.Td>
        </Table.Tr>
        {options.map((option) => {
          const isCurrent = current === option.code;
          return (
            <Table.Tr key={option.code} style={{ cursor: 'pointer' }} onClick={() => onChoose(option.code)}>
              <Table.Td>
                {/* Named by LOINC's long name and code, as the test is known */}
                <UnstyledButton aria-current={isCurrent ? 'true' : undefined} aria-label={`${option.name} · ${option.code}`}>
                  <Group component="span" gap={6} wrap="nowrap" align="flex-start">
                    <CurrentMark current={isCurrent} />
                    <Text span size="sm" fw={isCurrent ? 600 : 500}>
                      {option.component}
                      <Text span size="xs" c="dimmed" fw={400}>
                        {' · '}
                        {option.kind}
                      </Text>
                    </Text>
                  </Group>
                </UnstyledButton>
                <Box pl={20}>
                  <TestNotes option={option} />
                </Box>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{option.sample}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c={option.method ? undefined : 'dimmed'}>
                  {option.method || '—'}
                </Text>
              </Table.Td>
              <Table.Td>
                <UnitsText option={option} unit={unit} />
              </Table.Td>
              <Table.Td>
                <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                  {option.code}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
