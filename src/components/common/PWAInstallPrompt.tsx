/**
 * PWA Install Prompt Component
 *
 * Displays an install button when the app can be installed as a PWA.
 * Captures the beforeinstallprompt event and provides a user-friendly install experience.
 */

import { useState, useEffect } from 'react';
import { Button, Paper, Text, Group, CloseButton } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Check if app is already installed (runs once at module load)
function checkIsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

// Check if user previously dismissed
function checkIsDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissedAt = localStorage.getItem('pwa-install-dismissed');
  if (dismissedAt) {
    const dismissedTime = parseInt(dismissedAt, 10);
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
    return daysSinceDismissed < 7;
  }
  return false;
}

export function PWAInstallPrompt(): React.ReactNode {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(checkIsDismissed);
  const [isInstalled, setIsInstalled] = useState(checkIsInstalled);

  useEffect(() => {
    // Skip if already installed
    if (isInstalled) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isInstalled]);

  const handleInstall = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't show if already installed, dismissed, or no prompt available
  if (isInstalled || dismissed || !installPrompt) {
    return null;
  }

  return (
    <Paper
      shadow="md"
      p="md"
      radius="md"
      withBorder
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        maxWidth: 360,
        width: '90%',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Text fw={500} size="sm">Install HemoIO</Text>
        <CloseButton size="sm" onClick={handleDismiss} aria-label="Dismiss" />
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Install the app for quick access and offline use. Your data stays private on your device.
      </Text>
      <Button
        fullWidth
        leftSection={<IconDownload size={16} />}
        onClick={handleInstall}
        size="sm"
      >
        Install App
      </Button>
    </Paper>
  );
}
