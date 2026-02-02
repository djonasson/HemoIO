/**
 * PWA Update Prompt Component
 *
 * Displays a notification when a new version of the app is available.
 */

import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button, Group, Alert } from '@mantine/core';
import { IconRefresh, IconX } from '@tabler/icons-react';

/**
 * PWA Update Prompt component
 * Shows a notification when a new version of the app is available
 */
export function PWAUpdatePrompt(): React.ReactNode {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Check for updates periodically (every hour)
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('Service worker registration error:', error);
    },
  });

  // Compute showPrompt from needRefresh and dismissed state
  const showPrompt = needRefresh && !dismissed;

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setNeedRefresh(false);
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        maxWidth: 400,
        width: '90%',
      }}
    >
      <Alert
        color="blue"
        title="Update Available"
        withCloseButton
        onClose={handleDismiss}
        closeButtonLabel="Dismiss"
        icon={<IconRefresh size={20} />}
      >
        <Group mt="sm" gap="sm">
          <span>A new version of HemoIO is available.</span>
          <Group gap="xs">
            <Button
              size="xs"
              onClick={handleUpdate}
              leftSection={<IconRefresh size={14} />}
            >
              Update Now
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={handleDismiss}
              leftSection={<IconX size={14} />}
            >
              Later
            </Button>
          </Group>
        </Group>
      </Alert>
    </div>
  );
}
