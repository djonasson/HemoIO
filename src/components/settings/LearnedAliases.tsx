/**
 * Settings → Biomarkers: the tests the user taught for a lab's wording and
 * unit, which later imports match without asking. Each can be removed.
 */
import { ActionIcon, Group, List, Stack, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { usePreferences } from '@hooks/usePreferences';
import { useCatalog } from '@contexts/useCatalog';
import { isNotALoincTest, learnedWording } from '@data/loinc/learnedTests';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import type { Catalog } from '@data/loinc/catalog';

/** What a wording was learned as: a LOINC test with its code, or "Not a LOINC test" */
function learnedAs(catalog: Catalog, code: string): string {
  if (isNotALoincTest(code)) return 'Not a LOINC test';
  const name = catalog.test(code)?.name;
  return name ? `${name} · ${code}` : `LOINC ${code}`;
}

export function LearnedAliases() {
  const { learnedTests, removeLearnedTest } = usePreferences();
  const catalog = useCatalog();
  const entries = Object.entries(learnedTests).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Stack gap="sm">
      <Title order={4}>Learned names</Title>
      <Text size="sm" c="dimmed">
        Names and units from your reports, with the LOINC test you saved them as. Later imports
        match them to that test without asking.
      </Text>
      {entries.length === 0 ? (
        <Text size="sm">No learned names yet.</Text>
      ) : (
        <List aria-label="Learned names" listStyleType="none" spacing="xs">
          {entries.map(([key, code]) => {
            const wording = learnedWording(key);
            return (
              <List.Item key={key}>
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm">
                    {wording} → {learnedAs(catalog, code)}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label={`Remove ${wording}`}
                    onClick={() => {
                      removeLearnedTest(key).catch((err: unknown) =>
                        notifySaveFailed('Learned name not removed', err)
                      );
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </List.Item>
            );
          })}
        </List>
      )}
    </Stack>
  );
}
