/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin Types.
 *
 * This module defines the core types for the plugin system including
 * PluginInput, Hooks, and AuthHook interfaces.
 *
 * @module plugin/types
 */

import type { ToolDefinition } from './tool.js';

// ============================================================================
// Plugin Input
// ============================================================================

/**
 * Input provided to plugins during initialization.
 */
export interface PluginInput {
  /** The project root directory */
  directory: string;
  /** The git worktree directory (may differ from directory) */
  worktree: string;
}

/**
 * Plugin function signature.
 * Plugins are async functions that receive input and return hooks.
 */
export type Plugin = (input: PluginInput) => Promise<Hooks>;

// ============================================================================
// Authentication
// ============================================================================

/**
 * Text prompt for authentication flow.
 */
export interface AuthTextPrompt {
  type: 'text';
  key: string;
  message: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
  condition?: (inputs: Record<string, string>) => boolean;
}

/**
 * Select prompt for authentication flow.
 */
export interface AuthSelectPrompt {
  type: 'select';
  key: string;
  message: string;
  options: Array<{
    label: string;
    value: string;
    hint?: string;
  }>;
  condition?: (inputs: Record<string, string>) => boolean;
}

/**
 * Authentication prompt types.
 */
export type AuthPrompt = AuthTextPrompt | AuthSelectPrompt;

/**
 * OAuth authentication result.
 */
export type AuthOAuthResult = { url: string; instructions: string } & (
  | {
      method: 'auto';
      callback(): Promise<AuthSuccessResult | { type: 'failed' }>;
    }
  | {
      method: 'code';
      callback(code: string): Promise<AuthSuccessResult | { type: 'failed' }>;
    }
);

/**
 * Successful authentication result.
 */
export type AuthSuccessResult = {
  type: 'success';
  provider?: string;
} & (
  | {
      refresh: string;
      access: string;
      expires: number;
      accountId?: string;
    }
  | { key: string }
);

/**
 * OAuth authentication method.
 */
export interface OAuthMethod {
  type: 'oauth';
  label: string;
  prompts?: AuthPrompt[];
  authorize(inputs?: Record<string, string>): Promise<AuthOAuthResult>;
}

/**
 * API key authentication method.
 */
export interface ApiMethod {
  type: 'api';
  label: string;
  prompts?: AuthPrompt[];
  authorize?(
    inputs?: Record<string, string>,
  ): Promise<
    { type: 'success'; key: string; provider?: string } | { type: 'failed' }
  >;
}

/**
 * Authentication hook for provider auth.
 */
export interface AuthHook {
  /** Provider ID this auth hook applies to */
  provider: string;
  /** Authentication methods (OAuth or API) */
  methods: Array<OAuthMethod | ApiMethod>;
  /** Optional loader for additional provider options */
  loader?: (
    auth: () => Promise<unknown>,
    provider: unknown,
  ) => Promise<Record<string, unknown>>;
}

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Message info for chat hooks.
 */
export interface MessageInfo {
  role: 'user' | 'assistant' | 'system';
  content?: string;
}

/**
 * Part info for message parts.
 */
export interface PartInfo {
  type: string;
  content?: string;
}

/**
 * Permission info for permission hooks.
 */
export interface PermissionInfo {
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
}

/**
 * Plugin hooks interface.
 * Plugins return an object implementing some or all of these hooks.
 */
export interface Hooks {
  /**
   * Global event observer.
   * Called for all events published to the event bus.
   */
  event?: (input: { event: unknown }) => Promise<void>;

  /**
   * Config modification hook.
   * Called during config initialization.
   */
  config?: (input: unknown) => Promise<void>;

  /**
   * Plugin-defined tools.
   * Keys are tool names, values are tool definitions.
   */
  tool?: {
    [key: string]: ToolDefinition;
  };

  /**
   * Authentication hook.
   * Used for custom provider authentication.
   */
  auth?: AuthHook;

  /**
   * Chat message hook.
   * Called when a new message is received.
   */
  'chat.message'?: (
    input: {
      sessionID: string;
      agent?: string;
      model?: { providerID: string; modelID: string };
      messageID?: string;
      variant?: string;
    },
    output: { message: MessageInfo; parts: PartInfo[] },
  ) => Promise<void>;

  /**
   * Chat parameters hook.
   * Modify parameters sent to LLM.
   */
  'chat.params'?: (
    input: {
      sessionID: string;
      agent: string;
      model: unknown;
      provider: unknown;
      message: MessageInfo;
    },
    output: {
      temperature: number;
      topP: number;
      topK: number;
      options: Record<string, unknown>;
    },
  ) => Promise<void>;

  /**
   * Permission ask hook.
   * Called when permission is being requested.
   */
  'permission.ask'?: (
    input: PermissionInfo,
    output: { status: 'ask' | 'deny' | 'allow' },
  ) => Promise<void>;

  /**
   * Tool execute before hook.
   * Called before a tool is executed.
   */
  'tool.execute.before'?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown },
  ) => Promise<void>;

  /**
   * Tool execute after hook.
   * Called after a tool is executed.
   */
  'tool.execute.after'?: (
    input: { tool: string; sessionID: string; callID: string },
    output: {
      title: string;
      output: string;
      metadata: unknown;
    },
  ) => Promise<void>;

  /**
   * Experimental: Transform chat messages.
   */
  'experimental.chat.messages.transform'?: (
    input: object,
    output: {
      messages: Array<{
        info: MessageInfo;
        parts: PartInfo[];
      }>;
    },
  ) => Promise<void>;

  /**
   * Experimental: Transform system prompt.
   */
  'experimental.chat.system.transform'?: (
    input: { sessionID: string },
    output: { system: string[] },
  ) => Promise<void>;

  /**
   * Experimental: Session compaction hook.
   */
  'experimental.session.compacting'?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => Promise<void>;

  /**
   * Experimental: Text completion hook.
   */
  'experimental.text.complete'?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ) => Promise<void>;
}

/**
 * Hook names that can be triggered with input/output pattern.
 * Excludes: auth, event, tool (which have different calling patterns)
 */
export type TriggerableHookName = Exclude<
  keyof Required<Hooks>,
  'auth' | 'event' | 'tool'
>;
