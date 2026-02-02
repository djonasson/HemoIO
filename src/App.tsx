import { MantineProvider, LoadingOverlay, Center, Stack, Text } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import { AuthProvider, useAuth } from '@contexts';
import { SetupWizard } from '@components/setup';
import { LoginScreen } from '@components/auth';
import { AppShell } from '@components/layout';
import { PWAUpdatePrompt } from '@components/common';

function AppContent(): React.ReactNode {
  const { status } = useAuth();

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

  if (status === 'needs_setup') {
    return <SetupWizard onComplete={() => {}} />;
  }

  if (status === 'locked') {
    return <LoginScreen />;
  }

  // status === 'unlocked'
  return <AppShell />;
}

function App(): React.ReactNode {
  return (
    <MantineProvider>
      <Notifications position="top-right" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <PWAUpdatePrompt />
    </MantineProvider>
  );
}

export default App;
