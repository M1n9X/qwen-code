/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from './shared/TextInput.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';

interface ApiKeyInputDialogProps {
  providerName: string;
  onSubmit: (apiKey: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * ApiKeyInputDialog - Dialog for entering API key for a provider.
 */
export function ApiKeyInputDialog({
  providerName,
  onSubmit,
  onCancel,
}: ApiKeyInputDialogProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!value.trim()) {
      setError(t('API key cannot be empty'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(value.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed to save API key'));
      setIsSubmitting(false);
    }
  }, [value, onSubmit]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: !isSubmitting },
  );

  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {t('Enter API Key for')} {providerName}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          {t('Your API key will be securely stored locally.')}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="sk-..."
          isActive={!isSubmitting}
        />
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {isSubmitting && (
        <Box marginBottom={1}>
          <Text color="yellow">{t('Saving...')}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{t('Enter to save, ESC to cancel')}</Text>
        {providerName.toLowerCase().includes('openai') && (
          <Text dimColor>
            {t('Get your key at')}{' '}
            <Text color="blue">https://platform.openai.com/api-keys</Text>
          </Text>
        )}
        {providerName.toLowerCase().includes('anthropic') && (
          <Text dimColor>
            {t('Get your key at')}{' '}
            <Text color="blue">
              https://console.anthropic.com/settings/keys
            </Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}
