/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin Package Entry Point.
 *
 * @module plugin
 */

// Tool helpers
export {
  tool,
  type ToolDefinition,
  type ToolContext,
  type AskInput,
} from './tool.js';

// Types
export type {
  Plugin,
  PluginInput,
  Hooks,
  TriggerableHookName,
  AuthHook,
  AuthOAuthResult,
  AuthSuccessResult,
  OAuthMethod,
  ApiMethod,
  AuthPrompt,
  AuthTextPrompt,
  AuthSelectPrompt,
  MessageInfo,
  PartInfo,
  PermissionInfo,
} from './types.js';
