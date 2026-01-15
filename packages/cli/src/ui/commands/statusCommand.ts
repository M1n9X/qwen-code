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
import {
  getMCPServerStatus,
  getMCPDiscoveryState,
  MCPServerStatus,
  MCPDiscoveryState,
} from '@qwen-code/qwen-code-core';
import { t } from '../../i18n/index.js';
import { MessageType } from '../types.js';

/**
 * Get status icon for MCP server status
 */
function getStatusIcon(status: MCPServerStatus): string {
  switch (status) {
    case MCPServerStatus.CONNECTED:
      return '●';
    case MCPServerStatus.CONNECTING:
      return '○';
    case MCPServerStatus.DISCONNECTED:
    default:
      return '◌';
  }
}

/**
 * /status show - Shows system status including provider health and MCP/LSP status.
 */
const showStatusCommand: SlashCommand = {
  name: 'show',
  get description() {
    return t('Show system status (providers, MCP, LSP)');
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

    const lines: string[] = [];

    // Current Model
    const contentGeneratorConfig = config.getContentGeneratorConfig?.();
    const currentModel = contentGeneratorConfig?.model || t('Not configured');
    lines.push(t('Current Model:'));
    lines.push(`  ● ${currentModel}`);
    lines.push('');

    // Provider Status
    const coordinator = config.getProviderCoordinator?.();
    const providers = coordinator?.listProviders?.() ?? [];
    lines.push(t('Connected Providers:'));
    if (providers.length === 0) {
      lines.push(`  ${t('No providers connected')}`);
    } else {
      for (const provider of providers) {
        lines.push(`  ● ${provider.name} (${provider.id})`);
      }
    }
    lines.push('');

    // MCP Status
    const mcpServers = config.getMcpServers?.() || {};
    const mcpServerNames = Object.keys(mcpServers);
    const mcpDiscoveryState = getMCPDiscoveryState();
    const isMcpDiscovering =
      mcpDiscoveryState === MCPDiscoveryState.IN_PROGRESS;

    lines.push(
      t('MCP Servers:') + (isMcpDiscovering ? ` (${t('discovering...')})` : ''),
    );
    if (mcpServerNames.length === 0) {
      lines.push(`  ${t('No MCP servers configured')}`);
    } else {
      for (const name of mcpServerNames) {
        const status = getMCPServerStatus(name);
        const icon = getStatusIcon(status);
        lines.push(`  ${icon} ${name} - ${status}`);
      }
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: t('System Status:') + '\n' + lines.join('\n'),
      },
      Date.now(),
    );
  },
};

/**
 * /status command - Shows system status including provider health and MCP/LSP status.
 */
export const statusCommand: SlashCommand = {
  name: 'status',
  get description() {
    return t('Show system status (providers, MCP, LSP)');
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [showStatusCommand],
  // Default action when no subcommand is provided
  action: async (context: CommandContext, args: string) =>
    showStatusCommand.action!(context, args),
};
