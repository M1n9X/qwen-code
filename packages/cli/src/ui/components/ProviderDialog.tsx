/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useConfig } from '../contexts/ConfigContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { ProviderAuth } from '@qwen-code/qwen-code-core';
import { t } from '../../i18n/index.js';
import { ApiKeyInputDialog } from './ApiKeyInputDialog.js';

/**
 * Auth method types
 */
interface AuthMethod {
  type: 'api' | 'oauth';
  label: string;
}

/**
 * Provider info for display
 */
interface ProviderInfo {
  id: string;
  name: string;
  authMethods: AuthMethod[];
  isConnected: boolean;
}

interface ProviderDialogProps {
  onClose: () => void;
}

/**
 * Default auth methods for known providers
 */
const PROVIDER_AUTH_METHODS: Record<string, AuthMethod[]> = {
  openai: [{ type: 'api', label: 'API Key' }],
  anthropic: [
    { type: 'api', label: 'API Key' },
    { type: 'oauth', label: 'OAuth (Claude Max)' },
  ],
  google: [{ type: 'api', label: 'API Key' }],
  qwen: [
    { type: 'api', label: 'API Key' },
    { type: 'oauth', label: 'Qwen OAuth' },
  ],
  'github-copilot': [{ type: 'oauth', label: 'GitHub OAuth' }],
  openrouter: [{ type: 'api', label: 'API Key' }],
  azure: [{ type: 'api', label: 'API Key' }],
  gemini: [{ type: 'api', label: 'API Key' }],
};

/**
 * Priority for provider display order
 */
const PROVIDER_PRIORITY: Record<string, number> = {
  qwen: 0,
  anthropic: 1,
  openai: 2,
  google: 3,
  'github-copilot': 4,
};

type DialogMode = 'list' | 'auth_method' | 'api_key';

/**
 * All supported providers (shown regardless of connection status)
 */
const ALL_SUPPORTED_PROVIDERS: Array<{ id: string; name: string }> = [
  { id: 'qwen', name: 'Qwen' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google AI' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'azure', name: 'Azure OpenAI' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
  { id: 'bedrock', name: 'AWS Bedrock' },
  { id: 'local', name: 'Local (Ollama)' },
];

/**
 * ProviderDialog - Shows available providers and their status.
 * Allows users to view and manage provider configurations with auth method selection.
 */
export function ProviderDialog({
  onClose,
}: ProviderDialogProps): React.JSX.Element {
  const config = useConfig();
  const [mode, setMode] = useState<DialogMode>('list');
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(
    null,
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get provider coordinator to check which providers are registered
  const coordinator = config?.getProviderCoordinator?.();
  const registeredProviders = new Set(
    coordinator?.listProviders?.().map((p) => p.id) ?? [],
  );

  // Build provider info list from all supported providers
  const providers: ProviderInfo[] = ALL_SUPPORTED_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    authMethods: PROVIDER_AUTH_METHODS[p.id] || [
      { type: 'api' as const, label: 'API Key' },
    ],
    isConnected: registeredProviders.has(p.id),
  })).sort((a, b) => {
    const aPriority = PROVIDER_PRIORITY[a.id] ?? 99;
    const bPriority = PROVIDER_PRIORITY[b.id] ?? 99;
    return aPriority - bPriority;
  });

  const handleProviderSelect = useCallback((provider: ProviderInfo) => {
    setSelectedProvider(provider);
    if (provider.authMethods.length === 1) {
      // Only one auth method, go directly
      if (provider.authMethods[0].type === 'api') {
        setMode('api_key');
      } else {
        // TODO: Handle OAuth
        setMode('api_key'); // Fallback for now
      }
    } else {
      setMode('auth_method');
    }
  }, []);

  const handleAuthMethodSelect = useCallback((method: AuthMethod) => {
    if (method.type === 'api') {
      setMode('api_key');
    } else {
      // TODO: Implement OAuth flow
      setMode('api_key'); // Fallback for now
    }
  }, []);

  const handleApiKeySubmit = useCallback(
    async (apiKey: string) => {
      if (!selectedProvider) return;

      await ProviderAuth.set(selectedProvider.id, { type: 'api', key: apiKey });

      // Close dialog after successful save
      onClose();
    },
    [selectedProvider, onClose],
  );

  const handleBack = useCallback(() => {
    if (mode === 'api_key') {
      if (selectedProvider && selectedProvider.authMethods.length > 1) {
        setMode('auth_method');
      } else {
        setMode('list');
        setSelectedProvider(null);
      }
    } else if (mode === 'auth_method') {
      setMode('list');
      setSelectedProvider(null);
    } else {
      onClose();
    }
  }, [mode, selectedProvider, onClose]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleBack();
        return;
      }
      if (key.name === 'q' && mode === 'list') {
        onClose();
        return;
      }

      if (mode === 'list') {
        if (key.name === 'up' || key.name === 'k') {
          setSelectedIndex((i) => Math.max(0, i - 1));
        } else if (key.name === 'down' || key.name === 'j') {
          setSelectedIndex((i) => Math.min(providers.length - 1, i + 1));
        } else if (key.name === 'return') {
          const provider = providers[selectedIndex];
          if (provider) {
            handleProviderSelect(provider);
          }
        }
      } else if (mode === 'auth_method' && selectedProvider) {
        const methods = selectedProvider.authMethods;
        if (key.name === 'up' || key.name === 'k') {
          setSelectedIndex((i) => Math.max(0, i - 1));
        } else if (key.name === 'down' || key.name === 'j') {
          setSelectedIndex((i) => Math.min(methods.length - 1, i + 1));
        } else if (key.name === 'return') {
          const method = methods[selectedIndex];
          if (method) {
            handleAuthMethodSelect(method);
          }
        }
      }
    },
    { isActive: mode !== 'api_key' },
  );

  // Render API Key input dialog
  if (mode === 'api_key' && selectedProvider) {
    return (
      <ApiKeyInputDialog
        providerName={selectedProvider.name}
        onSubmit={handleApiKeySubmit}
        onCancel={handleBack}
      />
    );
  }

  // Render auth method selection
  if (mode === 'auth_method' && selectedProvider) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {t('Select auth method for')} {selectedProvider.name}
          </Text>
        </Box>

        <Box flexDirection="column">
          {selectedProvider.authMethods.map((method, index) => (
            <Box key={method.label}>
              <Text color={selectedIndex === index ? 'green' : undefined}>
                {selectedIndex === index ? '> ' : '  '}
                {method.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>{t('ESC to go back, Enter to select')}</Text>
        </Box>
      </Box>
    );
  }

  // Render provider list
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {t('Connect a Provider')}
        </Text>
      </Box>

      {providers.length === 0 ? (
        <Box flexDirection="column">
          <Text color="yellow">{t('No providers available.')}</Text>
          <Text dimColor>{t('Check your provider configuration.')}</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {providers.map((provider, index) => (
            <Box key={provider.id}>
              <Text color={selectedIndex === index ? 'green' : undefined}>
                {selectedIndex === index ? '> ' : '  '}
                {provider.isConnected ? '● ' : '○ '}
                {provider.name}
                {provider.isConnected && <Text dimColor> (Connected)</Text>}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {t('↑↓ to navigate, Enter to select, q/ESC to close')}
        </Text>
      </Box>
    </Box>
  );
}
