/**
 * Settings → About: the app's license and the notices of the material it
 * contains, which their licenses ask the app to show
 */
import { Anchor, Stack, Text, Title } from '@mantine/core';
import { useCatalog } from '@contexts/useCatalog';
import { LOINC_NOTICE } from '@data/loinc/notice';

/**
 * The notice the UCUM library's license asks to be reproduced in the
 * documentation of binary distributions
 */
const UCUM_NOTICE =
  'The UCUM table and UCUM codes are copyright © 1995-2009, Regenstrief Institute, Inc. and the Unified Codes for Units of Measures (UCUM) Organization. All rights reserved. The library was developed by the Lister Hill National Center for Biomedical Communications (LHNCBC), U.S. National Library of Medicine, with the permission and based on the copyrighted content of the Regenstrief Institute. It is provided "as is", without warranty, and its names and its contributors\' names are not used to endorse HemoIO.';

/**
 * The MIT license of is-finite, which the UCUM library ships in the app;
 * the license asks for it in every copy. The library's other package,
 * is-integer, is used under the WTFPL, which asks for no notice.
 */
const IS_FINITE_NOTICE =
  'Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com). Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';

/** The About tab: the app's license and the LOINC and UCUM notices */
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
        UCUM (@lhncbc/ucum-lhc {__UCUM_LHC_VERSION__})
      </Text>
      <Text size="sm">{UCUM_NOTICE}</Text>
      <Text size="sm">
        <Anchor href="https://ucum.org/license" target="_blank" rel="noopener noreferrer">
          Read the UCUM license
        </Anchor>
      </Text>
      <Text size="sm" fw={500} mt="sm">
        is-finite (MIT license), used by the UCUM library
      </Text>
      <Text size="sm">{IS_FINITE_NOTICE}</Text>
    </Stack>
  );
}
