/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

// Basic types for the Agent Client Protocol (ACP)
// These define the structure of messages and tool calls within the agent loop.

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export type AgentState = 'pending' | 'running' | 'completed' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
}

// Phase 4 additions
import type { Model } from '../provider/types.js';
import type { Config as CoreConfig } from '../config/config.js';

export interface ACPConfig {
  sdk: {
    config: CoreConfig;
  };
  defaultModel?: {
    modelID: string;
    providerID: string;
  };
  config: CoreConfig;
}

export interface ACPSessionState {
  id: string;
  cwd: string;
  mcpServers: unknown[]; // Precise type can be refined
  model: Model;
  summary?: string;
  pinnedMessageIds?: string[];
}
