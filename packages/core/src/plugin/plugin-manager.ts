/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin Manager.
 *
 * This module handles loading, unloading plugins and triggering hooks.
 * Implements: Requirements 6.1-6.6
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
 * Loaded plugin info with metadata.
 */
export interface LoadedPlugin {
  /** Plugin path or identifier */
  path: string;
  /** Plugin name (derived from path or module) */
  name: string;
  /** Plugin hooks */
  hooks: Hooks;
  /** Load timestamp */
  loadedAt: Date;
}

/**
 * Plugin manager events.
 */
export interface PluginManagerEvents {
  'plugin:loaded': { path: string; name: string };
  'plugin:unloaded': { name: string };
  'plugin:error': { path?: string; name?: string; error: unknown };
  'hooks:registered': void;
  'hook:error': { hook: string; error: unknown };
  initialized: void;
}

/**
 * Plugin manager for loading and managing plugins.
 * Implements: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export class PluginManager extends EventEmitter {
  private plugins: Map<string, LoadedPlugin> = new Map();
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
   * Extract plugin name from path.
   */
  private extractPluginName(pluginPath: string): string {
    // Handle file:// URLs
    if (pluginPath.startsWith('file://')) {
      const url = new URL(pluginPath);
      const parts = url.pathname.split('/');
      return parts[parts.length - 1].replace(/\.(js|ts|mjs|cjs)$/, '');
    }

    // Handle npm packages
    if (pluginPath.startsWith('@')) {
      return pluginPath;
    }

    // Handle relative/absolute paths
    const parts = pluginPath.split('/');
    return parts[parts.length - 1].replace(/\.(js|ts|mjs|cjs)$/, '');
  }

  /**
   * Load a plugin from a module path and initialize it.
   * Implements: Requirements 6.1
   *
   * @param pluginPath - Path to the plugin module (file:// URL or npm package)
   * @returns The loaded plugin info
   */
  async loadPlugin(pluginPath: string): Promise<LoadedPlugin> {
    const pluginName = this.extractPluginName(pluginPath);

    // Check if already loaded
    if (this.plugins.has(pluginName)) {
      throw new Error(`Plugin "${pluginName}" is already loaded`);
    }

    try {
      // Import the module
      const mod = await import(pluginPath);

      // Handle default export and named exports
      const seen = new Set<Plugin>();
      let loadedHooks: Hooks | undefined;

      for (const [_name, fn] of Object.entries(mod)) {
        if (!this.isPlugin(fn)) continue;
        if (seen.has(fn)) continue;
        seen.add(fn);

        const hooks = await fn(this.input);
        loadedHooks = hooks;
        this.hooks.push(hooks);
      }

      if (!loadedHooks) {
        throw new Error(`No valid plugin export found in "${pluginPath}"`);
      }

      const loadedPlugin: LoadedPlugin = {
        path: pluginPath,
        name: pluginName,
        hooks: loadedHooks,
        loadedAt: new Date(),
      };

      this.plugins.set(pluginName, loadedPlugin);
      this.emit('plugin:loaded', { path: pluginPath, name: pluginName });

      return loadedPlugin;
    } catch (error) {
      this.emit('plugin:error', { path: pluginPath, error });
      throw error;
    }
  }

  /**
   * Unload a plugin by name.
   * Implements: Requirements 6.6
   *
   * @param name - Plugin name to unload
   */
  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" is not loaded`);
    }

    // Remove hooks from the hooks array
    const hookIndex = this.hooks.indexOf(plugin.hooks);
    if (hookIndex !== -1) {
      this.hooks.splice(hookIndex, 1);
    }

    // Remove from plugins map
    this.plugins.delete(name);

    this.emit('plugin:unloaded', { name });
  }

  /**
   * Get a loaded plugin by name.
   *
   * @param name - Plugin name
   * @returns The loaded plugin info or undefined
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * List all loaded plugins.
   *
   * @returns Array of loaded plugin info
   */
  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Load multiple plugins.
   *
   * @param pluginPaths - Array of plugin paths to load
   * @returns Array of loaded plugin info
   */
  async loadPlugins(pluginPaths: string[]): Promise<LoadedPlugin[]> {
    const loaded: LoadedPlugin[] = [];

    for (const pluginPath of pluginPaths) {
      try {
        const plugin = await this.loadPlugin(pluginPath);
        loaded.push(plugin);
      } catch (error) {
        // Continue loading other plugins even if one fails
        this.emit('plugin:error', { path: pluginPath, error });
      }
    }

    return loaded;
  }

  /**
   * Register hooks directly (for internal/built-in plugins).
   *
   * @param hooks - Hooks object to register
   * @param name - Optional name for the hooks
   */
  registerHooks(hooks: Hooks, name?: string): void {
    this.hooks.push(hooks);

    if (name) {
      this.plugins.set(name, {
        path: 'internal',
        name,
        hooks,
        loadedAt: new Date(),
      });
    }

    this.emit('hooks:registered');
  }

  /**
   * Trigger a hook on all registered plugins.
   * Implements: Requirements 6.2, 6.3, 6.4, 6.5
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

      try {
        await fn(input, output);
      } catch (error) {
        this.emit('hook:error', { hook: name, error });
        // Continue with other hooks even if one fails
      }
    }
    return output;
  }

  /**
   * Invoke a hook (alias for trigger).
   * Implements: Requirements 6.2, 6.3, 6.4, 6.5
   */
  async invokeHook<
    Name extends TriggerableHookName,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output): Promise<Output> {
    return this.trigger(name, input, output);
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
   * Get registered tools (alias for getTools).
   */
  getRegisteredTools(): Map<string, ToolDefinition> {
    return this.getTools();
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
        try {
          await hook.config(config);
        } catch (error) {
          this.emit('hook:error', { hook: 'config', error });
        }
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

  /**
   * Check if a plugin is loaded.
   */
  isLoaded(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get the number of loaded plugins.
   */
  get pluginCount(): number {
    return this.plugins.size;
  }
}
