/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from './shared/TextInput.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { t } from '../../i18n/index.js';

/**
 * OAuth authorization info returned from backend
 */
export interface OAuthAuthorization {
  url: string;
  method: 'auto' | 'code';
  instructions: string;
}

interface OAuthDialogProps {
  providerName: string;
  authorization: OAuthAuthorization;
  /** Called with authorization code for 'code' method */
  onCodeSubmit: (code: string) => Promise<void>;
  /** Called to poll for auto-method completion */
  onAutoCheck?: () => Promise<boolean>;
  onCancel: () => void;
  onSuccess: () => void;
}

/**
 * OAuthDialog - Handles OAuth authorization flow for providers.
 * Supports both 'auto' method (browser opens, wait for callback) and
 * 'code' method (user pastes authorization code).
 */
export function OAuthDialog({
  providerName,
  authorization,
  onCodeSubmit,
  onAutoCheck,
  onCancel,
  onSuccess,
}: OAuthDialogProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(authorization.method === 'auto');

  // For 'auto' method, poll for completion
  useEffect(() => {
    if (authorization.method !== 'auto' || !onAutoCheck) return;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 60; // 2 minutes at 2 second intervals

    const poll = async () => {
      while (!cancelled && retryCount < maxRetries) {
        try {
          const success = await onAutoCheck();
          if (success) {
            setIsWaiting(false);
            onSuccess();
            return;
          }
        } catch {
          // Ignore polling errors
        }
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        setError(t('Authorization timed out. Please try again.'));
        setIsWaiting(false);
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [authorization.method, onAutoCheck, onSuccess]);

  const handleCodeSubmit = useCallback(async () => {
    if (!code.trim()) {
      setError(t('Authorization code cannot be empty'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onCodeSubmit(code.trim());
      onSuccess();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('Invalid authorization code'),
      );
      setIsSubmitting(false);
    }
  }, [code, onCodeSubmit, onSuccess]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
      // For 'auto' method, 'c' copies the URL
      if (
        authorization.method === 'auto' &&
        key.name === 'c' &&
        !key.ctrl &&
        !key.meta
      ) {
        // Note: Actual clipboard copy would require a clipboard library
        // For now, just show the URL is copyable
      }
    },
    { isActive: !isSubmitting },
  );

  // Auto method UI - waiting for browser callback
  if (authorization.method === 'auto') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {t('Authorize')} {providerName}
          </Text>
        </Box>

        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>{authorization.instructions}</Text>
          <Text color="blue">{authorization.url}</Text>
        </Box>

        {isWaiting ? (
          <Box marginBottom={1}>
            <Text color="yellow">{t('Waiting for authorization...')}</Text>
          </Box>
        ) : error ? (
          <Box marginBottom={1}>
            <Text color="red">{error}</Text>
          </Box>
        ) : (
          <Box marginBottom={1}>
            <Text color="green">{t('Authorization successful!')}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>{t('ESC to cancel')}</Text>
        </Box>
      </Box>
    );
  }

  // Code method UI - user enters authorization code
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {t('Authorize')} {providerName}
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>{authorization.instructions}</Text>
        <Text color="blue">{authorization.url}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{t('Enter authorization code:')}</Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={code}
          onChange={setCode}
          onSubmit={handleCodeSubmit}
          placeholder="XXXX-XXXX"
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
          <Text color="yellow">{t('Verifying...')}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{t('Enter to submit, ESC to cancel')}</Text>
      </Box>
    </Box>
  );
}
