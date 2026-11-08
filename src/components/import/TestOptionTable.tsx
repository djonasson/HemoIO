import { Box, Table, Text, UnstyledButton } from '@mantine/core';
import { NOT_A_LOINC_TEST } from './notLoincTest';
import { TestNotes } from './TestNotes';
import { TestOptionName } from './TestOptionName';
import { UnitsText } from './UnitsText';
import { accessibleName, type TestOptionLayoutProps } from './testOptionLayout';

/**
 * The tests side by side, LOINC's name cut into its parts so a difference
 * shows as a different cell in a column. A click anywhere on a row chooses
 * it; the button in its first cell is what the keyboard reaches, and its
 * click reaches the row.
 */
export function TestOptionTable({ options, current, notLoinc, unit, onChoose }: TestOptionLayoutProps): React.ReactElement {
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
              <TestOptionName current={notLoinc} label={NOT_A_LOINC_TEST} />
            </UnstyledButton>
          </Table.Td>
        </Table.Tr>
        {options.map((option) => {
          const isCurrent = current === option.code;
          return (
            <Table.Tr key={option.code} style={{ cursor: 'pointer' }} onClick={() => onChoose(option.code)}>
              <Table.Td>
                <UnstyledButton aria-current={isCurrent ? 'true' : undefined} aria-label={accessibleName(option)}>
                  <TestOptionName current={isCurrent} option={option} />
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
