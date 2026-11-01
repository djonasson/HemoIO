/**
 * Settings → About: the app's license and the notices of the material it
 * contains, which their licenses ask the app to show
 */
import { Anchor, Stack, Text, Title } from '@mantine/core';
import { LOINC_NOTICE, LOINC_VERSION } from '@data/biomarkers/loinc';

/** The About tab: the app's license and the LOINC notice */
export function AboutSettings(): React.ReactNode {
  return (
    <Stack gap="sm">
      <Title order={4}>About HemoIO</Title>
      <Text size="sm">
        HemoIO is open source under the MIT license.
      </Text>

      <Title order={4} mt="md">
        Third-party notices
      </Title>
      <Text size="sm" fw={500}>
        LOINC (version {LOINC_VERSION})
      </Text>
      <Text size="sm">{LOINC_NOTICE}</Text>
      <Text size="sm">
        <Anchor href="https://loinc.org/license" target="_blank" rel="noopener noreferrer">
          Read the LOINC license
        </Anchor>
      </Text>
    </Stack>
  );
}
