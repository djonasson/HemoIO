import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { FallbackProps } from 'react-error-boundary';

/**
 * What a failed error says: its name and message, never its stack. It is
 * shown on screen only, so the user can tell what went wrong.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  return String(error);
}

/**
 * Shown in place of a page that failed while it was drawn: what went wrong,
 * a new try, and a reload, which locks HemoIO (the key lives only in memory)
 */
export function PageErrorFallback({ error, resetErrorBoundary }: FallbackProps): React.ReactNode {
  return (
    <Alert
      role="alert"
      color="red"
      variant="light"
      icon={<IconAlertTriangle aria-hidden="true" />}
      title="This page could not be shown"
      maw={640}
      mx="auto"
      mt="md"
    >
      <Stack gap="sm">
        <Text size="sm">Something went wrong while showing this page. The rest of HemoIO still works from the menu.</Text>
        <Text size="sm" ff="monospace" style={{ overflowWrap: 'anywhere' }}>
          {errorText(error)}
        </Text>
        <Text size="sm">Reloading locks HemoIO until you enter your password again.</Text>
        <Group gap="sm">
          <Button onClick={resetErrorBoundary}>Try again</Button>
          <Button variant="default" onClick={() => window.location.reload()}>
            Reload HemoIO
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
