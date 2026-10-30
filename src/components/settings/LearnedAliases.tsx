/**
 * Settings → Biomarkers: the names the user saved under a test, which later
 * imports match by. Each can be removed.
 */
import { ActionIcon, Group, List, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { usePreferences } from '@hooks/usePreferences';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';
import { saveErrorMessage } from '@data/db/saveError';

export function LearnedAliases() {
  const { learnedAliases, removeLearnedAlias } = usePreferences();
  const entries = Object.entries(learnedAliases).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Stack gap="sm">
      <Title order={4}>Learned names</Title>
      <Text size="sm" c="dimmed">
        Names from your reports that you saved under a test. Later imports match them to that test
        when the AI does not identify it.
      </Text>
      {entries.length === 0 ? (
        <Text size="sm">No learned names yet.</Text>
      ) : (
        <List aria-label="Learned names" listStyleType="none" spacing="xs">
          {entries.map(([name, key]) => (
            <List.Item key={name}>
              <Group gap="xs">
                <Text size="sm">
                  {name} → {getBiomarkerByKey(key)?.name ?? key}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    removeLearnedAlias(name).catch((err: unknown) =>
                      notifications.show({
                        title: 'Learned name not removed',
                        message: saveErrorMessage(err),
                        color: 'red',
                      })
                    );
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </List.Item>
          ))}
        </List>
      )}
    </Stack>
  );
}
