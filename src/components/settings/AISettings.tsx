/**
 * AISettings Component
 *
 * Settings section for AI provider configuration.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Stack,
  Paper,
  Title,
  Text,
  Select,
  PasswordInput,
  Button,
  Group,
  Alert,
  Badge,
  Box,
  Loader,
  Anchor,
} from '@mantine/core';
import {
  IconKey,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
  IconBrandOpenai,
  IconServer,
  IconAlertTriangle,
} from '@tabler/icons-react';
import type { AIProviderType } from '@/types';
import {
  isOllamaRunning,
  getOllamaModelNames,
  getOpenAIModels,
  getAnthropicModels,
} from '@/services/ai';
import { isLocalhost, getCurrentOrigin } from '@/utils/isLocalhost';

/**
 * Props for AISettings component
 */
export interface AISettingsProps {
  /** Current AI provider */
  provider?: AIProviderType;
  /** Whether an API key is configured (don't pass the actual key) */
  hasApiKey?: boolean;
  /** Last 4 characters of API key for display */
  apiKeyLastFour?: string;
  /** Currently configured Ollama model */
  ollamaModel?: string;
  /** Currently configured OpenAI model */
  openaiModel?: string;
  /** Currently configured Anthropic model */
  anthropicModel?: string;
  /** Called when provider changes */
  onProviderChange?: (provider: AIProviderType) => void;
  /** Called when API key is updated */
  onApiKeyChange?: (apiKey: string) => void | Promise<void>;
  /** Called when Ollama model changes */
  onOllamaModelChange?: (model: string) => void;
  /** Called when OpenAI model changes */
  onOpenaiModelChange?: (model: string) => void;
  /** Called when Anthropic model changes */
  onAnthropicModelChange?: (model: string) => void;
  /** Called when test connection is requested */
  onTestConnection?: () => Promise<boolean>;
  /** Whether settings are being saved */
  isSaving?: boolean;
  /** Function to get the decrypted API key (for model fetching) */
  getApiKey?: () => Promise<string | null>;
}

/**
 * AI provider options
 */
const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI (GPT-5)', requiresApiKey: true },
  { value: 'anthropic', label: 'Anthropic (Claude)', requiresApiKey: true },
  { value: 'ollama', label: 'Ollama (Local)', requiresApiKey: false },
];

/**
 * AISettings component for configuring AI provider
 */
export function AISettings({
  provider = 'openai',
  hasApiKey = false,
  apiKeyLastFour,
  ollamaModel,
  openaiModel,
  anthropicModel,
  onProviderChange,
  onApiKeyChange,
  onOllamaModelChange,
  onOpenaiModelChange,
  onAnthropicModelChange,
  onTestConnection,
  isSaving = false,
  getApiKey,
}: AISettingsProps): React.ReactNode {
  const [localProvider, setLocalProvider] = useState<AIProviderType>(provider);
  const [newApiKey, setNewApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [localOllamaModel, setLocalOllamaModel] = useState<string | undefined>(ollamaModel);
  const [localOpenaiModel, setLocalOpenaiModel] = useState<string>(openaiModel || '');
  const [localAnthropicModel, setLocalAnthropicModel] = useState<string>(anthropicModel || '');
  const [openaiModels, setOpenaiModels] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoadingOpenaiModels, setIsLoadingOpenaiModels] = useState(false);
  const [anthropicModels, setAnthropicModels] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoadingAnthropicModels, setIsLoadingAnthropicModels] = useState(false);

  // Sync local state with props
  useEffect(() => {
    setLocalProvider(provider);
  }, [provider]);

  // Sync Ollama model with props
  useEffect(() => {
    setLocalOllamaModel(ollamaModel);
  }, [ollamaModel]);

  // Sync OpenAI model with props
  useEffect(() => {
    if (openaiModel) {
      setLocalOpenaiModel(openaiModel);
    }
  }, [openaiModel]);

  // Sync Anthropic model with props
  useEffect(() => {
    if (anthropicModel) {
      setLocalAnthropicModel(anthropicModel);
    }
  }, [anthropicModel]);

  // Fetch OpenAI models when provider is OpenAI and API key is available
  useEffect(() => {
    if (localProvider !== 'openai' || !hasApiKey || !getApiKey) {
      return;
    }

    let cancelled = false;

    const fetchModels = async () => {
      setIsLoadingOpenaiModels(true);
      try {
        // Get decrypted API key
        const apiKey = await getApiKey();
        if (!apiKey || cancelled) return;

        const models = await getOpenAIModels(apiKey);
        if (!cancelled && models.length > 0) {
          setOpenaiModels(models);
          // If current model is not in the list, select the first one
          if (!models.find(m => m.value === localOpenaiModel)) {
            setLocalOpenaiModel(models[0].value);
            onOpenaiModelChange?.(models[0].value);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch OpenAI models:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingOpenaiModels(false);
        }
      }
    };

    fetchModels();

    return () => {
      cancelled = true;
    };
  }, [localProvider, hasApiKey, localOpenaiModel, onOpenaiModelChange, getApiKey]);

  // Fetch Anthropic models when provider is Anthropic and API key is available
  useEffect(() => {
    if (localProvider !== 'anthropic' || !hasApiKey || !getApiKey) {
      return;
    }

    let cancelled = false;

    const fetchModels = async () => {
      setIsLoadingAnthropicModels(true);
      try {
        // Get decrypted API key
        const apiKey = await getApiKey();
        if (!apiKey || cancelled) return;

        const models = await getAnthropicModels(apiKey);
        if (!cancelled && models.length > 0) {
          setAnthropicModels(models);
          // If current model is not in the list, select the first one
          if (!models.find(m => m.value === localAnthropicModel)) {
            setLocalAnthropicModel(models[0].value);
            onAnthropicModelChange?.(models[0].value);
          }
        }
      } catch (error) {
        console.warn('Failed to fetch Anthropic models:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingAnthropicModels(false);
        }
      }
    };

    fetchModels();

    return () => {
      cancelled = true;
    };
  }, [localProvider, hasApiKey, localAnthropicModel, onAnthropicModelChange, getApiKey]);

  // Check Ollama status when provider is Ollama
  useEffect(() => {
    if (localProvider !== 'ollama') {
      return;
    }

    let cancelled = false;

    const checkStatus = async () => {
      setOllamaStatus('checking');
      try {
        const running = await isOllamaRunning();
        if (cancelled) return;

        if (running) {
          const models = await getOllamaModelNames();
          if (cancelled) return;

          setOllamaModels(models);
          setOllamaStatus('connected');
          // Auto-select first model if none selected
          if (models.length > 0 && !localOllamaModel) {
            setLocalOllamaModel(models[0]);
            onOllamaModelChange?.(models[0]);
          }
        } else {
          setOllamaStatus('disconnected');
          setOllamaModels([]);
        }
      } catch {
        if (!cancelled) {
          setOllamaStatus('disconnected');
          setOllamaModels([]);
        }
      }
    };

    checkStatus();

    return () => {
      cancelled = true;
    };
  }, [localProvider, localOllamaModel, onOllamaModelChange]);

  // Manual retry function for connection check
  const checkOllamaStatus = useCallback(async () => {
    setOllamaStatus('checking');
    try {
      const running = await isOllamaRunning();
      if (running) {
        const models = await getOllamaModelNames();
        setOllamaModels(models);
        setOllamaStatus('connected');
        if (models.length > 0 && !localOllamaModel) {
          setLocalOllamaModel(models[0]);
          onOllamaModelChange?.(models[0]);
        }
      } else {
        setOllamaStatus('disconnected');
        setOllamaModels([]);
      }
    } catch {
      setOllamaStatus('disconnected');
      setOllamaModels([]);
    }
  }, [localOllamaModel, onOllamaModelChange]);

  // Handle provider change
  const handleProviderChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      const newProvider = value as AIProviderType;
      setLocalProvider(newProvider);
      onProviderChange?.(newProvider);
      setTestResult(null);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onProviderChange]
  );

  // Handle Ollama model change
  const handleOllamaModelChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      setLocalOllamaModel(value);
      onOllamaModelChange?.(value);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onOllamaModelChange]
  );

  // Handle OpenAI model change
  const handleOpenaiModelChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      setLocalOpenaiModel(value);
      onOpenaiModelChange?.(value);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onOpenaiModelChange]
  );

  // Handle Anthropic model change
  const handleAnthropicModelChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      setLocalAnthropicModel(value);
      onAnthropicModelChange?.(value);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onAnthropicModelChange]
  );

  // Handle save API key
  const handleSaveApiKey = useCallback(() => {
    if (!newApiKey.trim()) return;

    onApiKeyChange?.(newApiKey.trim());
    setNewApiKey('');
    setIsEditing(false);

    // Show success briefly
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }, [newApiKey, onApiKeyChange]);

  // Handle test connection
  const handleTestConnection = useCallback(async () => {
    if (!onTestConnection) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const success = await onTestConnection();
      setTestResult(success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  }, [onTestConnection]);

  // Handle cancel editing
  const handleCancelEdit = useCallback(() => {
    setNewApiKey('');
    setIsEditing(false);
  }, []);

  // Get provider info
  const providerInfo = PROVIDER_OPTIONS.find((p) => p.value === localProvider);
  const providerLabel = providerInfo?.label || localProvider;
  const requiresApiKey = providerInfo?.requiresApiKey ?? true;

  // Render Ollama status indicator
  const renderOllamaStatus = () => {
    switch (ollamaStatus) {
      case 'checking':
        return (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">Checking Ollama connection...</Text>
          </Group>
        );
      case 'connected':
        return (
          <Group gap="xs">
            <Badge color="green" leftSection={<IconCheck size={12} />}>
              Connected
            </Badge>
            <Text size="sm" c="dimmed">
              {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
            </Text>
          </Group>
        );
      case 'disconnected':
        return (
          <Alert
            variant="light"
            color="yellow"
            icon={<IconAlertTriangle size={16} />}
            title="Ollama not detected"
          >
            <Text size="sm">
              Make sure Ollama is running. Start it with: <code>ollama serve</code>
            </Text>
            <Text size="sm" mt="xs">
              If you don&apos;t have Ollama installed, visit{' '}
              <Anchor href="https://ollama.com" target="_blank" rel="noopener noreferrer">
                ollama.com
              </Anchor>
            </Text>
            <Button
              size="xs"
              variant="light"
              mt="sm"
              leftSection={<IconRefresh size={14} />}
              onClick={checkOllamaStatus}
            >
              Retry Connection
            </Button>
          </Alert>
        );
    }
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Title order={4}>AI Configuration</Title>

        <Text size="sm" c="dimmed">
          Configure your AI provider for document analysis.{' '}
          {requiresApiKey
            ? 'An API key is required to analyze lab reports.'
            : 'Ollama runs locally and does not require an API key.'}
        </Text>

        {saveSuccess && (
          <Alert color="green" icon={<IconCheck size={16} />}>
            Settings saved
          </Alert>
        )}

        {/* Provider Selection */}
        <Stack gap="xs">
          <Text fw={500}>AI Provider</Text>
          <Select
            value={localProvider}
            onChange={handleProviderChange}
            data={PROVIDER_OPTIONS}
            disabled={isSaving}
            leftSection={localProvider === 'ollama' ? <IconServer size={16} /> : <IconBrandOpenai size={16} />}
            aria-label="Select AI provider"
          />
        </Stack>

        {/* Ollama Configuration */}
        {localProvider === 'ollama' && (
          <Stack gap="md">
            {renderOllamaStatus()}

            {ollamaStatus === 'connected' && ollamaModels.length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Model</Text>
                <Select
                  value={localOllamaModel}
                  onChange={handleOllamaModelChange}
                  data={ollamaModels.map((m) => ({ value: m, label: m }))}
                  disabled={isSaving}
                  aria-label="Select Ollama model"
                />
                <Text size="xs" c="dimmed">
                  Choose which model to use for lab report analysis. Different models may have
                  varying accuracy and speed.
                </Text>
              </Stack>
            )}

            {onTestConnection && ollamaStatus === 'connected' && (
              <Box>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconRefresh size={14} />}
                  onClick={handleTestConnection}
                  loading={isTesting}
                  disabled={isSaving}
                >
                  Test Connection
                </Button>
              </Box>
            )}

            {/* Test Result */}
            {testResult === 'success' && (
              <Alert color="green" icon={<IconCheck size={16} />}>
                Connection successful! Ollama is ready to analyze lab reports.
              </Alert>
            )}
            {testResult === 'error' && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                Connection test failed. Please check that Ollama is running.
              </Alert>
            )}

            {/* Privacy Notice for Ollama */}
            <Alert color="green" icon={<IconServer size={16} />} variant="light">
              <Text size="sm">
                Ollama runs AI models locally on your device. Your health data never leaves
                your computer, providing complete privacy.
              </Text>
            </Alert>

            {/* CORS Warning for non-localhost */}
            {!isLocalhost() && (
              <Alert
                color="orange"
                icon={<IconAlertTriangle size={16} />}
                variant="light"
                title="CORS Configuration Required"
              >
                <Text size="sm">
                  Since HemoIO is running from <code>{getCurrentOrigin()}</code>, your browser
                  will block requests to Ollama on localhost due to CORS restrictions.
                </Text>
                <Text size="sm" mt="xs" fw={500}>
                  To use Ollama, choose one of these options:
                </Text>
                <Text size="sm" component="div" mt="xs">
                  <strong>Option 1:</strong> Run HemoIO locally instead:
                  <pre style={{ margin: '4px 0', padding: '8px', background: 'var(--mantine-color-dark-7)', color: 'var(--mantine-color-gray-3)', borderRadius: '4px', overflow: 'auto' }}>
                    git clone https://github.com/djonasson/HemoIO{'\n'}
                    npm install && npm run dev
                  </pre>
                </Text>
                <Text size="sm" component="div" mt="xs">
                  <strong>Option 2:</strong> Configure Ollama to allow this origin:
                  <pre style={{ margin: '4px 0', padding: '8px', background: 'var(--mantine-color-dark-7)', color: 'var(--mantine-color-gray-3)', borderRadius: '4px', overflow: 'auto' }}>
                    OLLAMA_ORIGINS={getCurrentOrigin()} ollama serve
                  </pre>
                </Text>
              </Alert>
            )}
          </Stack>
        )}

        {/* Model Selection (for OpenAI/Anthropic) */}
        {requiresApiKey && hasApiKey && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={500}>Model</Text>
              {((localProvider === 'openai' && isLoadingOpenaiModels) ||
                (localProvider === 'anthropic' && isLoadingAnthropicModels)) && (
                <Group gap="xs">
                  <Loader size="xs" />
                  <Text size="xs" c="dimmed">Loading models from API...</Text>
                </Group>
              )}
            </Group>
            {((localProvider === 'openai' && openaiModels.length > 0) ||
              (localProvider === 'anthropic' && anthropicModels.length > 0)) ? (
              <>
                <Select
                  value={localProvider === 'openai' ? localOpenaiModel : localAnthropicModel}
                  onChange={localProvider === 'openai' ? handleOpenaiModelChange : handleAnthropicModelChange}
                  data={localProvider === 'openai' ? openaiModels : anthropicModels}
                  disabled={isSaving || (localProvider === 'openai' && isLoadingOpenaiModels) || (localProvider === 'anthropic' && isLoadingAnthropicModels)}
                  aria-label={`Select ${localProvider === 'openai' ? 'OpenAI' : 'Anthropic'} model`}
                  placeholder="Select a model"
                  searchable
                />
                <Text size="xs" c="dimmed">
                  {openaiModels.length > 0 || anthropicModels.length > 0
                    ? `${localProvider === 'openai' ? openaiModels.length : anthropicModels.length} models available from your account`
                    : 'Loading models...'}
                </Text>
              </>
            ) : (
              !isLoadingOpenaiModels && !isLoadingAnthropicModels && (
                <Text size="sm" c="dimmed">
                  No models available. Check your API key or try refreshing.
                </Text>
              )
            )}
          </Stack>
        )}

        {/* API Key Configuration (for OpenAI/Anthropic) */}
        {requiresApiKey && (
          <Stack gap="xs">
            <Text fw={500}>API Key</Text>

            {hasApiKey && !isEditing ? (
              <Box>
                <Group gap="sm">
                  <Badge
                    leftSection={<IconKey size={12} />}
                    variant="light"
                    color="green"
                  >
                    Configured
                  </Badge>
                  {apiKeyLastFour && (
                    <Text size="sm" c="dimmed">
                      ••••••••{apiKeyLastFour}
                    </Text>
                  )}
                </Group>
                <Group gap="sm" mt="sm">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setIsEditing(true)}
                    disabled={isSaving}
                  >
                    Update API Key
                  </Button>
                  {onTestConnection && (
                    <Button
                      variant="subtle"
                      size="xs"
                      leftSection={<IconRefresh size={14} />}
                      onClick={handleTestConnection}
                      loading={isTesting}
                      disabled={isSaving}
                    >
                      Test Connection
                    </Button>
                  )}
                </Group>
              </Box>
            ) : (
              <Stack gap="xs">
                <PasswordInput
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.currentTarget.value)}
                  placeholder={`Enter your ${providerLabel} API key`}
                  disabled={isSaving}
                  aria-label="API key"
                />
                <Text size="xs" c="dimmed">
                  {localProvider === 'openai'
                    ? 'Get your API key from platform.openai.com'
                    : 'Get your API key from console.anthropic.com'}
                </Text>
                <Group gap="sm">
                  <Button
                    size="xs"
                    onClick={handleSaveApiKey}
                    disabled={!newApiKey.trim() || isSaving}
                  >
                    Save API Key
                  </Button>
                  {hasApiKey && (
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  )}
                </Group>
              </Stack>
            )}

            {/* Test Result */}
            {testResult === 'success' && (
              <Alert color="green" icon={<IconCheck size={16} />}>
                Connection successful! Your API key is working.
              </Alert>
            )}
            {testResult === 'error' && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                Connection failed. Please check your API key and try again.
              </Alert>
            )}
          </Stack>
        )}

        {/* Security Notice (for cloud providers) */}
        {requiresApiKey && (
          <Alert color="blue" icon={<IconKey size={16} />} variant="light">
            <Text size="sm">
              Your API key is stored securely on your device and is never sent to our
              servers. It is only used to communicate directly with your chosen AI
              provider.
            </Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
