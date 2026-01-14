/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin Module Entry Point.
 *
 * @module plugin
 */

export { PluginManager } from './plugin-manager.js';

// Re-export types from plugin package for convenience
export type {
  Plugin,
  PluginInput,
  Hooks,
  TriggerableHookName,
  AuthHook,
  ToolDefinition,
  ToolContext,
} from '@qwen-code/plugin';
