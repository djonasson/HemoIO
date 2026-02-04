import { useState, useCallback, useMemo } from 'react';
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
import { PasswordStep} from './PasswordStep';
import { StorageStep } from './StorageStep';
import { AIConfigStep } from './AIConfigStep';
import { useAuth } from '@contexts';
import { useFormKeyboardSubmit } from '@hooks';
import type { StorageProviderType, AIProviderType } from '@/types';
import { isAIConfigured } from './aiConfigUtils';
import { isPasswordStepValid } from './passwordUtils';
import { isStorageStepValid } from './storageUtils';
import {
  encryptString,
  getEncryptionKey,
  type StoredCredentials,
} from '@data/encryption';

const ENCRYPTED_API_KEY_STORAGE_KEY = 'hemoio_ai_api_key_encrypted';
const CREDENTIALS_STORAGE_KEY = 'hemoio_credentials';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps): React.ReactNode {
  const { setupPassword } = useAuth();

  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Storage
  const [storageProvider, setStorageProvider] =
    useState<StorageProviderType>('local');

  // Step 3: AI Configuration
  const [aiProvider, setAiProvider] = useState<AIProviderType | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [ollamaModel, setOllamaModel] = useState<string | undefined>(undefined);

  const canProceed = useMemo((): boolean => {
    switch (activeStep) {
      case 0:
        return isPasswordStepValid(password, confirmPassword);
      case 1:
        return isStorageStepValid(storageProvider);
      case 2:
        // AI step is optional, always can proceed
        return true;
      case 3:
        return true; // Completion step
      default:
        return false;
    }
  }, [activeStep, password, confirmPassword, storageProvider]);

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
    setIsSubmitting(true);
    try {
      // Setup password and get encryption key
      await setupPassword(password);

      // Save AI configuration to localStorage
      if (aiProvider) {
        localStorage.setItem('hemoio_ai_provider', aiProvider);

        // Encrypt API key if provided
        if (apiKey) {
          // Get the credentials that were just stored
          const credentialsJson = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
          if (credentialsJson) {
            const credentials = JSON.parse(credentialsJson) as StoredCredentials;
            // Derive the same encryption key
            const encryptionKey = await getEncryptionKey(password, credentials);
            // Encrypt and store the API key
            const encryptedApiKey = await encryptString(apiKey, encryptionKey);
            localStorage.setItem(ENCRYPTED_API_KEY_STORAGE_KEY, encryptedApiKey);
          }
        }

        if (aiProvider === 'ollama' && ollamaModel) {
          localStorage.setItem('hemoio_ollama_model', ollamaModel);
        }
      }

      onComplete();
    } catch (error) {
      console.error('Setup failed:', error);
      // TODO: Show error to user
    } finally {
      setIsSubmitting(false);
    }
  }, [password, setupPassword, onComplete, aiProvider, apiKey, ollamaModel]);

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
            aiConfigured={isAIConfigured(aiProvider, apiKey)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1} ta="center">
            Welcome to HemoIO
          </Title>
          <Text c="dimmed" ta="center" mt="sm">
            Let's set up your secure lab results tracker
          </Text>
        </div>

        <Stepper
          active={activeStep}
          onStepClick={setActiveStep}
          allowNextStepsSelect={false}
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
  aiConfigured: boolean;
}

function CompletionStep({
  storageProvider,
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
                {storageProvider === 'local' ? 'Local Storage' : storageProvider}
              </Text>
              <Text size="xs" c="dimmed">
                Data stored on this device
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
