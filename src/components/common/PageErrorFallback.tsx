import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { errorText } from '@/utils/errorText';
import { reloadPage } from '@/utils/reloadPage';
import { ErrorDetails } from './ErrorDetails';
import { RELOAD_LOCKS_NOTE } from './errorFallbackText';
import type { FallbackProps } from 'react-error-boundary';

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
        <ErrorDetails error={error} />
        <Text size="sm">{RELOAD_LOCKS_NOTE}</Text>
        <Group gap="sm">
          <Button onClick={resetErrorBoundary}>Try again</Button>
          <Button variant="default" onClick={reloadPage}>
            Reload HemoIO
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
