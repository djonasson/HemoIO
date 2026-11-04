/**
 * Catalog Context
 *
 * Loads the LOINC catalog once the app is unlocked and shares it with every
 * view. Its children render only once it has loaded, so they can use it
 * synchronously; a failed load shows an error the user can retry.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { loadCatalog, type Catalog } from '@data/loinc/catalog';
import { CatalogContext } from './useCatalog';

type LoadState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; catalog: Catalog };

export function CatalogProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadCatalog()
      .then((catalog) => {
        if (!cancelled) setState({ status: 'ready', catalog });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((count) => count + 1);
  }, []);

  if (state.status === 'ready') {
    return <CatalogContext.Provider value={state.catalog}>{children}</CatalogContext.Provider>;
  }

  return (
    <Center h="100vh" p="md">
      {state.status === 'loading' ? (
        <Stack align="center" gap="sm" role="status">
          <Loader aria-hidden="true" />
          <Text c="dimmed">Loading the test catalog…</Text>
        </Stack>
      ) : (
        <Alert
          icon={<IconAlertCircle size={16} aria-hidden="true" />}
          title="Test catalog could not be loaded"
          color="red"
          variant="light"
          role="alert"
          maw={480}
        >
          <Text size="sm">HemoIO needs it to read and show your results.</Text>
          <Button variant="light" color="red" size="xs" mt="sm" onClick={retry}>
            Try again
          </Button>
        </Alert>
      )}
    </Center>
  );
}
