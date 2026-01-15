/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  MessageActionReturn,
  OpenDialogActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { MessageType } from '../types.js';

/**
 * All supported providers
 */
const ALL_SUPPORTED_PROVIDERS = [
  { id: 'qwen', name: 'Qwen' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google AI' },
  { id: 'azure', name: 'Azure OpenAI' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'bedrock', name: 'AWS Bedrock' },
  { id: 'local', name: 'Local (Ollama)' },
];

/**
 * /provider list - Lists all providers and their connection status.
 */
const listProvidersCommand: SlashCommand = {
  name: 'list',
  get description() {
    return t('List all providers and their connection status');
  },
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<void | MessageActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Config not loaded.'),
      };
    }

    const coordinator = config.getProviderCoordinator?.();
    const registeredProviders = new Set(
      coordinator?.listProviders?.().map((p) => p.id) ?? [],
    );

    // Build output text
    const lines: string[] = [];
    for (const provider of ALL_SUPPORTED_PROVIDERS) {
      const isConnected = registeredProviders.has(provider.id);
      const icon = isConnected ? '●' : '○';
      const status = isConnected ? t('Connected') : t('Not connected');
      lines.push(`  ${icon} ${provider.name} (${provider.id}) - ${status}`);
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: t('LLM Providers:') + '\n' + lines.join('\n'),
      },
      Date.now(),
    );
  },
};

/**
 * /provider connect - Opens dialog to connect a provider.
 */
const connectProviderCommand: SlashCommand = {
  name: 'connect',
  get description() {
    return t('Connect to a provider (configure API key)');
  },
  kind: CommandKind.BUILT_IN,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'provider',
  }),
};

/**
 * /provider command - View and configure LLM providers.
 */
export const providerCommand: SlashCommand = {
  name: 'provider',
  altNames: ['providers'],
  get description() {
    return t('View and configure LLM providers');
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [listProvidersCommand, connectProviderCommand],
  // Default action when no subcommand is provided - show list
  action: async (context: CommandContext, args: string) =>
    listProvidersCommand.action!(context, args),
};
