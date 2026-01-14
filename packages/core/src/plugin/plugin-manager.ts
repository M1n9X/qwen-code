/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin Manager.
 *
 * This module handles loading plugins and triggering hooks.
 *
 * @module plugin/plugin-manager
 */

import { EventEmitter } from 'node:events';
import type {
  Plugin,
  PluginInput,
  Hooks,
  TriggerableHookName,
  ToolDefinition,
} from '@qwen-code/plugin';

/**
 * Plugin manager for loading and managing plugins.
 */
export class PluginManager extends EventEmitter {
  private hooks: Hooks[] = [];
  private initialized = false;
  private input: PluginInput;

  constructor(input: PluginInput) {
    super();
    this.input = input;
  }

  /**
   * Check if a plugin is a valid plugin function.
   */
  private isPlugin(obj: unknown): obj is Plugin {
    return typeof obj === 'function';
  }

  /**
   * Load a plugin from a module path and initialize it.
   *
   * @param pluginPath - Path to the plugin module (file:// URL or npm package)
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Import the module
      const mod = await import(pluginPath);

      // Handle default export and named exports
      const seen = new Set<Plugin>();

      for (const [_name, fn] of Object.entries(mod)) {
        if (!this.isPlugin(fn)) continue;
        if (seen.has(fn)) continue;
        seen.add(fn);

        const hooks = await fn(this.input);
        this.hooks.push(hooks);
        this.emit('plugin:loaded', { path: pluginPath });
      }
    } catch (error) {
      this.emit('plugin:error', { path: pluginPath, error });
      throw error;
    }
  }

  /**
   * Load multiple plugins.
   *
   * @param pluginPaths - Array of plugin paths to load
   */
  async loadPlugins(pluginPaths: string[]): Promise<void> {
    for (const pluginPath of pluginPaths) {
      try {
        await this.loadPlugin(pluginPath);
      } catch (error) {
        // Continue loading other plugins even if one fails
        this.emit('plugin:error', { path: pluginPath, error });
      }
    }
  }

  /**
   * Register hooks directly (for internal/built-in plugins).
   *
   * @param hooks - Hooks object to register
   */
  registerHooks(hooks: Hooks): void {
    this.hooks.push(hooks);
    this.emit('hooks:registered');
  }

  /**
   * Trigger a hook on all registered plugins.
   *
   * This follows the input/output pattern where:
   * - `input` is read-only context
   * - `output` is mutable and can be modified by hooks
   *
   * @param name - Hook name to trigger
   * @param input - Read-only input context
   * @param output - Mutable output that hooks can modify
   * @returns The (possibly modified) output
   */
  async trigger<
    Name extends TriggerableHookName,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output): Promise<Output> {
    for (const hook of this.hooks) {
      const fn = hook[name] as
        | ((input: Input, output: Output) => Promise<void>)
        | undefined;
      if (!fn) continue;
      await fn(input, output);
    }
    return output;
  }

  /**
   * Get all plugin-defined tools.
   *
   * @returns Map of tool name to tool definition
   */
  getTools(): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDefinition>();

    for (const hook of this.hooks) {
      if (!hook.tool) continue;
      for (const [name, definition] of Object.entries(hook.tool)) {
        tools.set(name, definition);
      }
    }

    return tools;
  }

  /**
   * Get all auth hooks for a specific provider.
   *
   * @param provider - Provider ID to get auth hooks for
   */
  getAuthHooks(provider: string): Array<Hooks['auth']> {
    return this.hooks
      .map((h) => h.auth)
      .filter(
        (auth): auth is NonNullable<Hooks['auth']> =>
          auth !== undefined && auth.provider === provider,
      );
  }

  /**
   * Initialize the plugin manager.
   * Sets up event subscription and triggers config hooks.
   *
   * @param config - Configuration object to pass to config hooks
   */
  async init(config?: unknown): Promise<void> {
    if (this.initialized) return;

    // Trigger config hooks
    for (const hook of this.hooks) {
      if (hook.config) {
        await hook.config(config);
      }
    }

    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Subscribe to events and forward them to plugin event hooks.
   *
   * @param subscribe - Function to subscribe to events
   */
  subscribeToEvents(
    subscribe: (handler: (event: unknown) => void) => void,
  ): void {
    subscribe(async (event) => {
      for (const hook of this.hooks) {
        if (hook.event) {
          try {
            await hook.event({ event });
          } catch (error) {
            this.emit('hook:error', { hook: 'event', error });
          }
        }
      }
    });
  }

  /**
   * Get all registered hooks.
   */
  getHooks(): Hooks[] {
    return [...this.hooks];
  }

  /**
   * Get the plugin input context.
   */
  getInput(): PluginInput {
    return this.input;
  }
}
