import { MantineProvider, LoadingOverlay, Center, Stack, Text } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import {
  AuthProvider,
  AISettingsProvider,
  CatalogProvider,
  AlertStateProvider,
  EncryptedApiKeyProvider,
  LabResultsProvider,
  PreferencesProvider,
  useAuth,
} from '@contexts';
import { SetupWizard } from '@components/setup';
import { LoginScreen } from '@components/auth';
import { AppShell, HEADER_HEIGHT } from '@components/layout';
import { PWAUpdatePrompt, PWAInstallPrompt } from '@components/common';
import { cssVariablesResolver, theme } from './theme/theme';

/**
 * No cut-off height (Mantine's 200px default): a notice with buttons, a large
 * font or a narrow screen must still show every one of them. Taller than any
 * notice, so it only bounds the closing animation.
 */
const NOTIFICATION_MAX_HEIGHT = 2000;

function AppContent(): React.ReactNode {
  const { status, startingOver } = useAuth();

  if (status === 'loading') {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <LoadingOverlay
            visible
            overlayProps={{ radius: 'sm', blur: 2 }}
            loaderProps={{ type: 'dots' }}
          />
          <Text c="dimmed">Loading...</Text>
        </Stack>
      </Center>
    );
  }

  // Until the page reloads: setup would show only to be thrown away
  if (startingOver) {
    return (
      <Center h="100vh">
        <Text role="status">Removing HemoIO's data from this browser…</Text>
      </Center>
    );
  }

  if (status === 'needs_setup') {
    return <SetupWizard onComplete={() => {}} />;
  }

  if (status === 'locked') {
    return <LoginScreen />;
  }

  // status === 'unlocked': the catalog loads only now, so login never waits for it
  return (
    <CatalogProvider>
      <AppShell />
    </CatalogProvider>
  );
}

function App(): React.ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {/* Below the header: a notice that stays until closed must never cover its buttons.
          A margin, not top: Mantine renders a container for each position, and the
          margin moves only those placed from the top. Its height: NOTIFICATION_MAX_HEIGHT. */}
      <Notifications
        position="top-right"
        notificationMaxHeight={NOTIFICATION_MAX_HEIGHT}
        styles={{ root: { marginTop: HEADER_HEIGHT } }}
      />
      <AuthProvider>
        <EncryptedApiKeyProvider>
          <AISettingsProvider>
            <AlertStateProvider>
              <PreferencesProvider>
                <LabResultsProvider>
                  <AppContent />
                </LabResultsProvider>
              </PreferencesProvider>
            </AlertStateProvider>
          </AISettingsProvider>
        </EncryptedApiKeyProvider>
      </AuthProvider>
      <PWAUpdatePrompt />
      <PWAInstallPrompt />
    </MantineProvider>
  );
}

export default App;
