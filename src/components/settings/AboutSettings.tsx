/**
 * Settings → About: the app's license and the notices of the material it
 * contains, which their licenses ask the app to show
 */
import { Anchor, Stack, Text, Title } from '@mantine/core';
import { useCatalog } from '@contexts/useCatalog';
import { LOINC_NOTICE } from '@data/biomarkers/loinc';

/**
 * The notice the UCUM library's license asks to be reproduced in the
 * documentation of binary distributions
 */
const UCUM_NOTICE =
  'The UCUM table and UCUM codes are copyright © 1995-2009, Regenstrief Institute, Inc. and the Unified Codes for Units of Measures (UCUM) Organization. All rights reserved. The library was developed by the Lister Hill National Center for Biomedical Communications (LHNCBC), U.S. National Library of Medicine, with the permission and based on the copyrighted content of the Regenstrief Institute. It is provided "as is", without warranty, and its names and its contributors\' names are not used to endorse HemoIO.';

/** The About tab: the app's license and the LOINC notice */
export function AboutSettings(): React.ReactNode {
  const { version } = useCatalog();
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
        LOINC (version {version})
      </Text>
      <Text size="sm">{LOINC_NOTICE}</Text>
      <Text size="sm">
        <Anchor href="https://loinc.org/license" target="_blank" rel="noopener noreferrer">
          Read the LOINC license
        </Anchor>
      </Text>
      <Text size="sm" fw={500} mt="sm">
        UCUM (@lhncbc/ucum-lhc 8.0.1)
      </Text>
      <Text size="sm">{UCUM_NOTICE}</Text>
      <Text size="sm">
        <Anchor href="https://ucum.org/license" target="_blank" rel="noopener noreferrer">
          Read the UCUM license
        </Anchor>
      </Text>
    </Stack>
  );
}
