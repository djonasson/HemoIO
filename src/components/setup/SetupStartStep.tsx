/**
 * SetupStartStep Component
 *
 * The first setup screen where folders can be used: set HemoIO up anew, or
 * from a folder copy kept by an earlier setup, here or on another computer.
 * Setting up anew is the default.
 */

import { useEffect, useId, useRef } from 'react';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconFolderOpen, IconRocket } from '@tabler/icons-react';

const SETUP_START_TITLE = 'How would you like to start?';

export interface SetupStartStepProps {
  /** Set up anew, from the password step */
  onSetUp: () => void;
  /** Set up from a folder copy */
  onFolderCopy: () => void;
}

export function SetupStartStep({ onSetUp, onFolderCopy }: SetupStartStepProps): React.ReactNode {
  const headingId = useId();
  const setUpRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setUpRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby={headingId}>
      <Stack gap="lg">
        <Title order={2} id={headingId}>
          {SETUP_START_TITLE}
        </Title>
        <Text>
          Set HemoIO up anew, or, if HemoIO already keeps a copy of your data in a folder, set it up
          from that copy with the password you used.
        </Text>
        <Group gap="sm">
          <Button ref={setUpRef} leftSection={<IconRocket size={16} aria-hidden />} onClick={onSetUp}>
            Set up HemoIO
          </Button>
          <Button
            variant="default"
            leftSection={<IconFolderOpen size={16} aria-hidden />}
            onClick={onFolderCopy}
          >
            I already have a folder copy
          </Button>
        </Group>
      </Stack>
    </section>
  );
}
