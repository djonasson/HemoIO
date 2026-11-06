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
import { FolderRecoveryStep } from './FolderRecoveryStep';
import { SetupStartStep } from './SetupStartStep';
import { notifySetUpElsewhere, notifySetupChoicesNotSaved, notifySetupFailed } from './setupNotices';
import { StorageStep } from './StorageStep';
import { AIConfigStep } from './AIConfigStep';
import { useAuth } from '@contexts';
import { loadStoredCredentials, mayChangeCredentials } from '@contexts/credentialsStorage';
import { useFormKeyboardSubmit } from '@hooks';
import { useExistingBrowserData } from '@hooks/useExistingBrowserData';
import { useFolderRecovery } from '@hooks/useFolderRecovery';
import { ENCRYPTED_API_KEY_STORAGE_KEY } from '@hooks/useEncryptedApiKey';
import type { StorageProviderType, AIProviderType } from '@/types';
import type { SetupOutcome } from '@contexts/AuthContext';
import { isAIConfigured } from './aiConfigUtils';
import { isPasswordStepValid } from './passwordUtils';
import { isStorageStepValid } from './storageUtils';
import { encryptString } from '@data/encryption';
import { saveStorageChoice } from '@data/storage/storageChoice';
import { currentFolder } from '@data/storage/StorageProviderFactory';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { logFailure } from '@/utils/logFailure';
import type { FolderUnlockProblem } from '@services/sync';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps): React.ReactNode {
  const { setupPassword } = useAuth();
  const existingData = useExistingBrowserData();
  // Kept aside or cleared: the wizard goes on to its first step
  const [existingDataSettled, setExistingDataSettled] = useState(false);
  const folderRecovery = useFolderRecovery();
  // A folder copy can be used only where the browser can open folders
  const [foldersSupported] = useState(isFileSystemAccessSupported);
  // The first screen (the existing data, or where folders can be used, the
  // choice of how to start), recovery from a folder copy, or the wizard
  const [screen, setScreen] = useState<'start' | 'folder' | 'wizard'>('start');

  // Responsive stepper orientation - vertical on small screens
  const stepperOrientation = useMatches({
    base: 'vertical' as const,
    sm: 'horizontal' as const,
  });

  const [activeStep, setActiveStep] = useState(0);
  // The provider that picks the folder keeps it to itself until setup
  // completes: another tab may set up first, and its folder must stay
  const [folder] = useState(() => currentFolder());
  const selectFolder = useCallback(() => folder.selectDirectory({ persist: false }), [folder]);
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
    screen === 'folder' ||
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

  /** Runs a submit with the storage listener muted: its outcome says itself whether another tab came first */
  const whileSubmitting = useCallback(async <T,>(submit: () => Promise<T>): Promise<T> => {
    submittingRef.current = true;
    try {
      return await submit();
    } finally {
      submittingRef.current = false;
    }
  }, []);

  const handleComplete = useCallback(async () => {
    if (submittingRef.current) return;
    setIsSubmitting(true);
    // Set when the choices could not be stored after the password lock was
    // saved: setup still finishes, and says what was not kept
    let choicesFailed = false;
    let outcome: SetupOutcome;
    try {
      // Stored before the app unlocks, so the providers that load at unlock
      // (API key, AI settings) start with them
      outcome = await whileSubmitting(() => setupPassword(password, async (encryptionKey) => {
        try {
          if (storageProvider === 'filesystem') await folder.persistDirectory();
          saveStorageChoice(storageProvider);

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
        } catch {
          choicesFailed = true;
        }
      }));
    } catch {
      // Only before the password lock was saved, so nothing was set up.
      // Fixed text: the error could name the credentials. The wizard stays,
      // to be submitted again
      logFailure('Setup failed');
      notifySetupFailed();
      return;
    } finally {
      setIsSubmitting(false);
    }

    // Outside the try: the password lock is saved by now, so nothing here may
    // report "Setup failed"
    if (outcome === 'existing-locked') {
      // The login screen shows in place of the wizard
      notifySetUpElsewhere(unsavedChoicesRef.current, { unlock: true });
      return;
    }
    if (outcome === 'unlocked-existing') {
      notifySetUpElsewhere(unsavedChoicesRef.current);
    } else if (choicesFailed) {
      notifySetupChoicesNotSaved(unsavedChoicesRef.current);
    }
    onComplete();
  }, [password, setupPassword, whileSubmitting, onComplete, storageProvider, folder, aiProvider, apiKey, ollamaModel]);

  const handleRecover = useCallback(
    async (folderPassword: string): Promise<FolderUnlockProblem | 'existing-locked' | null> => {
      const result = await whileSubmitting(() => folderRecovery.recover(folderPassword));
      if (result === 'existing-locked') {
        // The login screen shows in place of the wizard
        notifySetUpElsewhere(['folder storage'], { unlock: true });
      } else if (result === null) {
        onComplete();
      }
      return result;
    },
    [folderRecovery, whileSubmitting, onComplete]
  );

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
            selectDirectory={selectFolder}
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

  const firstScreen = (content: React.ReactNode): React.ReactNode => (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        {welcome}
        <Paper withBorder shadow="sm" p="xl" radius="md">
          {content}
        </Paper>
      </Stack>
    </Container>
  );

  if (screen === 'folder') {
    return firstScreen(
      <FolderRecoveryStep
        folderName={folderRecovery.folderName}
        onChooseFolder={folderRecovery.chooseFolder}
        onRecover={handleRecover}
        onBack={() => setScreen('start')}
      />
    );
  }

  const openFolderCopy = foldersSupported ? () => setScreen('folder') : undefined;

  if (existingData.rows > 0 && !existingDataSettled) {
    return firstScreen(
      <ExistingDataStep
        onKeep={() => {
          setExistingDataSettled(true);
          setScreen('wizard');
        }}
        onClear={async () => {
          clearConfirmedRef.current = true;
          startedRef.current = true;
          // Not cleared when another tab finished setup meanwhile:
          // that tab's storage event takes this one to the login screen
          if (await existingData.clear()) {
            setExistingDataSettled(true);
            setScreen('wizard');
          }
        }}
        onFolderCopy={openFolderCopy}
      />
    );
  }

  if (openFolderCopy && screen === 'start') {
    return firstScreen(
      <SetupStartStep onSetUp={() => setScreen('wizard')} onFolderCopy={openFolderCopy} />
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
