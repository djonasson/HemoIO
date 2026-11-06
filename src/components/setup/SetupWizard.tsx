import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Container,
  Stepper,
  Button,
  Group,
  Title,
  Text,
  Paper,
  Stack,
  ThemeIcon,
  Alert,
  Center,
  Loader,
  useMatches,
} from '@mantine/core';
import {
  IconLock,
  IconDatabase,
  IconBrain,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconRocket,
} from '@tabler/icons-react';
import { PasswordStep } from './PasswordStep';
import { ExistingDataStep } from './ExistingDataStep';
import { notifySetUpElsewhere, notifySetUpElsewhereLocked, notifySetupFailed } from './setupNotices';
import { StorageStep } from './StorageStep';
import { AIConfigStep } from './AIConfigStep';
import { useAuth } from '@contexts';
import { loadStoredCredentials, mayChangeCredentials } from '@contexts/credentialsStorage';
import { useFormKeyboardSubmit } from '@hooks';
import { useExistingBrowserData } from '@hooks/useExistingBrowserData';
import { ENCRYPTED_API_KEY_STORAGE_KEY } from '@hooks/useEncryptedApiKey';
import type { StorageProviderType, AIProviderType } from '@/types';
import { isAIConfigured } from './aiConfigUtils';
import { isPasswordStepValid } from './passwordUtils';
import { isStorageStepValid } from './storageUtils';
import { encryptString } from '@data/encryption';
import { STORAGE_PROVIDER_KEY } from '@data/storage/storageChoice';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps): React.ReactNode {
  const { setupPassword } = useAuth();
  const existingData = useExistingBrowserData();
  // Kept aside or cleared: the wizard goes on to its first step
  const [existingDataSettled, setExistingDataSettled] = useState(false);

  // Responsive stepper orientation - vertical on small screens
  const stepperOrientation = useMatches({
    base: 'vertical' as const,
    sm: 'horizontal' as const,
  });

  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guards against a second submit before React re-renders the loading button
  const submittingRef = useRef(false);

  // Step 1: Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Storage
  const [storageProvider, setStorageProvider] =
    useState<StorageProviderType>('local');
  const [selectedDirectoryName, setSelectedDirectoryName] = useState<string | null>(null);

  // Step 3: AI Configuration
  const [aiProvider, setAiProvider] = useState<AIProviderType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [ollamaModel, setOllamaModel] = useState<string | undefined>(undefined);

  // What this tab chose, by name only: lost if another tab's setup comes first
  const unsavedChoices: string[] = [
    ...(storageProvider === 'filesystem' ? ['folder storage'] : []),
    ...(aiProvider ? ['AI provider'] : []),
    ...(aiProvider && apiKey ? ['API key'] : []),
  ];
  const unsavedChoicesRef = useRef(unsavedChoices);
  unsavedChoicesRef.current = unsavedChoices;
  // Whether the user has begun: past the first screen, anything typed, or a
  // clear confirmed
  const clearConfirmedRef = useRef(false);
  const startedRef = useRef(false);
  startedRef.current =
    existingDataSettled ||
    clearConfirmedRef.current ||
    activeStep > 0 ||
    password !== '' ||
    confirmPassword !== '';

  // Another tab finished setup while this one was on it: AuthContext moves
  // to the login screen; say why, once the user had begun. A submit in
  // progress says so itself, from its outcome.
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (!mayChangeCredentials(event) || !loadStoredCredentials()) return;
      if (submittingRef.current || !startedRef.current) return;
      notifySetUpElsewhere(unsavedChoicesRef.current, { unlock: true });
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const canProceed = useMemo((): boolean => {
    switch (activeStep) {
      case 0:
        return isPasswordStepValid(password, confirmPassword);
      case 1:
        return isStorageStepValid(storageProvider, selectedDirectoryName);
      case 2:
        // AI step is optional, always can proceed
        return true;
      case 3:
        return true; // Completion step
      default:
        return false;
    }
  }, [activeStep, password, confirmPassword, storageProvider, selectedDirectoryName]);

  // Enable Enter key submission from any element in the form
  const { formRef } = useFormKeyboardSubmit({
    canSubmit: canProceed,
  });

  const handleNext = useCallback(() => {
    if (activeStep < 3) {
      setActiveStep((prev) => prev + 1);
    }
  }, [activeStep]);

  const handleBack = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
    }
  }, [activeStep]);

  const handleComplete = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Stored before the app unlocks, so the providers that load at unlock
      // (API key, AI settings) start with them
      const outcome = await setupPassword(password, async (encryptionKey) => {
        localStorage.setItem(STORAGE_PROVIDER_KEY, storageProvider);

        if (aiProvider) {
          localStorage.setItem('hemoio_ai_provider', aiProvider);

          if (apiKey) {
            const encryptedApiKey = await encryptString(apiKey, encryptionKey);
            localStorage.setItem(ENCRYPTED_API_KEY_STORAGE_KEY, encryptedApiKey);
          }

          if (aiProvider === 'ollama' && ollamaModel) {
            localStorage.setItem('hemoio_ollama_model', ollamaModel);
          }
        }
      });

      if (outcome === 'existing-locked') {
        // The login screen shows in place of the wizard
        notifySetUpElsewhereLocked();
        return;
      }
      if (outcome === 'unlocked-existing') {
        notifySetUpElsewhere(unsavedChoicesRef.current);
      }
      onComplete();
    } catch {
      // Fixed text: the error could name the credentials. The wizard stays,
      // to be submitted again
      console.error('Setup failed');
      notifySetupFailed();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [password, setupPassword, onComplete, storageProvider, aiProvider, apiKey, ollamaModel]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canProceed) return;

      if (activeStep < 3) {
        handleNext();
      } else {
        handleComplete();
      }
    },
    [activeStep, canProceed, handleNext, handleComplete]
  );

  const renderStep = (): React.ReactNode => {
    switch (activeStep) {
      case 0:
        return (
          <PasswordStep
            password={password}
            confirmPassword={confirmPassword}
            onPasswordChange={setPassword}
            onConfirmPasswordChange={setConfirmPassword}
          />
        );
      case 1:
        return (
          <StorageStep
            selectedStorage={storageProvider}
            onStorageChange={setStorageProvider}
            selectedDirectoryName={selectedDirectoryName}
            onDirectorySelect={setSelectedDirectoryName}
          />
        );
      case 2:
        return (
          <AIConfigStep
            aiProvider={aiProvider}
            apiKey={apiKey}
            ollamaModel={ollamaModel}
            onProviderChange={setAiProvider}
            onApiKeyChange={setApiKey}
            onOllamaModelChange={setOllamaModel}
          />
        );
      case 3:
        return (
          <CompletionStep
            storageProvider={storageProvider}
            directoryName={selectedDirectoryName}
            aiConfigured={isAIConfigured(aiProvider, apiKey)}
          />
        );
      default:
        return null;
    }
  };

  const welcome = (
    <div>
      <Title order={1} ta="center">
        Welcome to HemoIO
      </Title>
      <Text c="dimmed" ta="center" mt="sm">
        Let's set up your secure lab results tracker
      </Text>
    </div>
  );

  // Never set up over stored data without saying so: counted first
  if (existingData.rows === null) {
    return (
      <Container size="sm" py="xl">
        <Stack gap="xl">
          {welcome}
          <Center>
            <Loader type="dots" aria-label="Checking this browser for HemoIO data" />
          </Center>
        </Stack>
      </Container>
    );
  }

  if (existingData.rows > 0 && !existingDataSettled) {
    return (
      <Container size="sm" py="xl">
        <Stack gap="xl">
          {welcome}
          <Paper withBorder shadow="sm" p="xl" radius="md">
            <ExistingDataStep
              onKeep={() => setExistingDataSettled(true)}
              onClear={async () => {
                clearConfirmedRef.current = true;
                startedRef.current = true;
                // Not cleared when another tab finished setup meanwhile:
                // that tab's storage event takes this one to the login screen
                if (await existingData.clear()) setExistingDataSettled(true);
              }}
            />
          </Paper>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        {welcome}

        <Stepper
          active={activeStep}
          onStepClick={setActiveStep}
          allowNextStepsSelect={false}
          orientation={stepperOrientation}
          aria-label="Setup wizard progress"
        >
          <Stepper.Step
            label="Security"
            description="Create password"
            icon={<IconLock size={18} />}
            aria-label="Step 1: Security - Create password"
          />
          <Stepper.Step
            label="Storage"
            description="Choose storage"
            icon={<IconDatabase size={18} />}
            aria-label="Step 2: Storage - Choose storage"
          />
          <Stepper.Step
            label="AI Setup"
            description="Configure AI"
            icon={<IconBrain size={18} />}
            aria-label="Step 3: AI Setup - Configure AI provider"
          />
          <Stepper.Step
            label="Complete"
            description="Get started"
            icon={<IconCheck size={18} />}
            aria-label="Step 4: Complete - Get started"
          />
        </Stepper>

        <form ref={formRef} onSubmit={handleSubmit}>
          <Paper withBorder shadow="sm" p="xl" radius="md">
            {renderStep()}
          </Paper>

          <Group justify="space-between" mt="xl">
            <Button
              type="button"
              variant="default"
              onClick={handleBack}
              disabled={activeStep === 0}
              leftSection={<IconArrowLeft size={16} />}
              aria-label="Go to previous step"
            >
              Back
            </Button>

            {activeStep < 3 ? (
              <Button
                type="submit"
                disabled={!canProceed}
                rightSection={<IconArrowRight size={16} />}
                aria-label="Go to next step"
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                loading={isSubmitting}
                rightSection={<IconRocket size={16} />}
                color="green"
                aria-label="Complete setup and get started"
              >
                Get Started
              </Button>
            )}
          </Group>
        </form>
      </Stack>
    </Container>
  );
}

interface CompletionStepProps {
  storageProvider: StorageProviderType;
  directoryName: string | null;
  aiConfigured: boolean;
}

function CompletionStep({
  storageProvider,
  directoryName,
  aiConfigured,
}: CompletionStepProps): React.ReactNode {
  return (
    <Stack gap="lg">
      <Group justify="center">
        <ThemeIcon size={60} radius="xl" color="green" variant="light">
          <IconCheck size={30} />
        </ThemeIcon>
      </Group>

      <Title order={2} ta="center">
        You're all set!
      </Title>

      <Text c="dimmed" ta="center">
        Your HemoIO instance is configured and ready to use.
      </Text>

      <Stack gap="sm">
        <Paper withBorder p="md" radius="md">
          <Group>
            <ThemeIcon size="md" variant="light" color="blue">
              <IconLock size={16} />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={500}>
                Password Protection
              </Text>
              <Text size="xs" c="dimmed">
                Your data is encrypted with your password
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group>
            <ThemeIcon size="md" variant="light" color="blue">
              <IconDatabase size={16} />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={500}>
                {storageProvider === 'local'
                  ? 'Local Storage'
                  : storageProvider === 'filesystem'
                    ? `Local Directory: ${directoryName}`
                    : storageProvider}
              </Text>
              <Text size="xs" c="dimmed">
                {storageProvider === 'filesystem'
                  ? 'Data stored in selected folder'
                  : 'Data stored on this device'}
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group>
            <ThemeIcon
              size="md"
              variant="light"
              color={aiConfigured ? 'blue' : 'gray'}
            >
              <IconBrain size={16} />
            </ThemeIcon>
            <div>
              <Text size="sm" fw={500}>
                AI Document Analysis
              </Text>
              <Text size="xs" c="dimmed">
                {aiConfigured
                  ? 'Configured and ready'
                  : 'Not configured - manual entry only'}
              </Text>
            </div>
          </Group>
        </Paper>
      </Stack>

      {!aiConfigured && (
        <Alert variant="light" color="yellow" title="AI not configured">
          You can configure AI document analysis later in Settings to enable
          automatic extraction from lab reports.
        </Alert>
      )}
    </Stack>
  );
}
