/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { MessageType } from '../types.js';

/**
 * /models list - Lists available models by provider.
 */
const listModelsCommand: SlashCommand = {
  name: 'list',
  get description() {
    return t('List available models by provider');
  },
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
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
    if (!coordinator) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Provider coordinator not available.'),
      };
    }

    const allModels = coordinator.listAllModels();
    const filterProvider = args.trim().toLowerCase();

    // Filter by provider if specified
    const filteredModels = filterProvider
      ? allModels.filter((m) => m.providerId.toLowerCase() === filterProvider)
      : allModels;

    if (filteredModels.length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: filterProvider
            ? t('No models available for provider: {{provider}}', {
                provider: filterProvider,
              })
            : t(
                'No models available. Configure providers with API keys to see available models.',
              ),
        },
        Date.now(),
      );
      return;
    }

    // Group models by provider
    const modelsByProvider = filteredModels.reduce(
      (acc, model) => {
        const pid = model.providerId;
        if (!acc[pid]) {
          acc[pid] = [];
        }
        acc[pid].push(model);
        return acc;
      },
      {} as Record<string, typeof filteredModels>,
    );

    // Build output text
    const lines: string[] = [];
    for (const [providerId, models] of Object.entries(modelsByProvider)) {
      lines.push(`\n${providerId} (${models.length} models):`);
      for (const model of models.slice(0, 10)) {
        lines.push(`  ● ${model.modelId}`);
      }
      if (models.length > 10) {
        lines.push(`  ... and ${models.length - 10} more`);
      }
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: t('Available Models:') + lines.join('\n'),
      },
      Date.now(),
    );
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const { config } = context.services;
    if (!config) return [];

    const coordinator = config.getProviderCoordinator?.();
    if (!coordinator) return [];

    const providers = coordinator.listProviders();
    return providers
      .map((p) => p.id)
      .filter((id) => id.toLowerCase().startsWith(partialArg.toLowerCase()));
  },
};

/**
 * /models command - Lists available models, optionally filtered by provider.
 */
export const modelsCommand: SlashCommand = {
  name: 'models',
  get description() {
    return t('List available models by provider');
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [listModelsCommand],
  // Default action when no subcommand is provided
  action: async (context: CommandContext, args: string) =>
    listModelsCommand.action!(context, args),
};
