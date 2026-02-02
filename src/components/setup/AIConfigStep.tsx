import { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Select,
  PasswordInput,
  Alert,
  Anchor,
  Badge,
  Group,
  Loader,
} from '@mantine/core';
import {
  IconInfoCircle,
  IconCheck,
  IconAlertTriangle,
  IconServer,
} from '@tabler/icons-react';
import type { AIProviderType } from '@/types';
import { isOllamaRunning, getOllamaModelNames } from '@/services/ai';

interface AIConfigStepProps {
  aiProvider: AIProviderType | null;
  apiKey: string;
  ollamaModel?: string;
  onProviderChange: (provider: AIProviderType | null) => void;
  onApiKeyChange: (apiKey: string) => void;
  onOllamaModelChange?: (model: string) => void;
}

interface ProviderOption {
  value: string;
  label: string;
  keyPlaceholder?: string;
  docsUrl?: string;
  requiresApiKey: boolean;
  isLocal: boolean;
}

export function AIConfigStep({
  aiProvider,
  apiKey,
  ollamaModel,
  onProviderChange,
  onApiKeyChange,
  onOllamaModelChange,
}: AIConfigStepProps): React.ReactNode {
  const [showKey, setShowKey] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  const AI_PROVIDERS: ProviderOption[] = [
    {
      value: 'openai',
      label: 'OpenAI (GPT-5)',
      keyPlaceholder: 'sk-...',
      docsUrl: 'https://platform.openai.com/api-keys',
      requiresApiKey: true,
      isLocal: false,
    },
    {
      value: 'anthropic',
      label: 'Anthropic (Claude)',
      keyPlaceholder: 'sk-ant-...',
      docsUrl: 'https://console.anthropic.com/settings/keys',
      requiresApiKey: true,
      isLocal: false,
    },
    {
      value: 'ollama',
      label: 'Ollama (Local)',
      requiresApiKey: false,
      isLocal: true,
    },
  ];

  const selectedProviderInfo = AI_PROVIDERS.find((p) => p.value === aiProvider);

  // Check Ollama status when provider changes to Ollama
  useEffect(() => {
    if (aiProvider !== 'ollama') {
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
          if (models.length > 0 && !ollamaModel && onOllamaModelChange) {
            onOllamaModelChange(models[0]);
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
  }, [aiProvider, ollamaModel, onOllamaModelChange]);

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
              Ollama connected
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
              Make sure Ollama is running. Start it with:{' '}
              <code>ollama serve</code>
            </Text>
            <Text size="sm" mt="xs">
              If you don&apos;t have Ollama installed, visit{' '}
              <Anchor href="https://ollama.com" target="_blank" rel="noopener noreferrer">
                ollama.com
              </Anchor>
            </Text>
          </Alert>
        );
    }
  };

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        HemoIO uses AI to automatically extract values from lab report documents.
        Configure your AI provider to enable this feature. You can skip this
        step and add it later in settings.
      </Text>

      <Alert
        variant="light"
        color="blue"
        icon={<IconInfoCircle size={16} />}
        title="API Key Security"
      >
        Your API key will be encrypted with your password before being stored.
        It never leaves your device unencrypted.
      </Alert>

      <Select
        label="AI Provider"
        placeholder="Select an AI provider"
        data={AI_PROVIDERS.map((p) => ({
          value: p.value,
          label: p.label,
        }))}
        value={aiProvider}
        onChange={(value) => onProviderChange(value as AIProviderType | null)}
        clearable
        aria-describedby="ai-provider-description"
        leftSection={aiProvider === 'ollama' ? <IconServer size={16} /> : undefined}
      />

      {aiProvider === 'ollama' && (
        <Stack gap="md">
          {renderOllamaStatus()}

          <Alert
            variant="light"
            color="green"
            icon={<IconServer size={16} />}
          >
            <Text size="sm">
              <strong>No API key required.</strong> Ollama runs AI models locally on your device,
              so your health data never leaves your computer.
            </Text>
          </Alert>

          {ollamaStatus === 'connected' && ollamaModels.length > 0 && (
            <Select
              label="Model"
              placeholder="Select a model"
              data={ollamaModels.map((m) => ({ value: m, label: m }))}
              value={ollamaModel}
              onChange={(value) => value && onOllamaModelChange?.(value)}
              description="Choose which Ollama model to use for lab report analysis"
            />
          )}
        </Stack>
      )}

      {aiProvider && selectedProviderInfo?.requiresApiKey && (
        <>
          <PasswordInput
            label="API Key"
            placeholder={selectedProviderInfo?.keyPlaceholder ?? 'Enter your API key'}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            visible={showKey}
            onVisibilityChange={setShowKey}
            description={
              selectedProviderInfo?.docsUrl && (
                <>
                  Get your API key from{' '}
                  <Anchor
                    href={selectedProviderInfo.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                  >
                    {aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} Console
                  </Anchor>
                </>
              )
            }
          />
        </>
      )}

      <Text size="xs" c="dimmed" id="ai-provider-description">
        Without an AI provider configured, you can still use HemoIO by manually
        entering your lab values. AI extraction can be configured later in
        settings.
      </Text>
    </Stack>
  );
}
