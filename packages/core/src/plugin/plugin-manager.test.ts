/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginManager } from './plugin-manager.js';
import type { PluginInput, Hooks } from '@qwen-code/plugin';

/**
 * Create a mock plugin input for testing.
 */
function createMockInput(): PluginInput {
  return {
    directory: '/test/project',
    worktree: '/test/project',
  };
}

/**
 * Create mock hooks for testing.
 */
function createMockHooks(overrides?: Partial<Hooks>): Hooks {
  return {
    event: vi.fn().mockResolvedValue(undefined),
    config: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PluginManager', () => {
  let manager: PluginManager;
  let mockInput: PluginInput;

  beforeEach(() => {
    mockInput = createMockInput();
    manager = new PluginManager(mockInput);
  });

  describe('constructor', () => {
    it('should create manager with input', () => {
      expect(manager.getInput()).toEqual(mockInput);
    });

    it('should start with no plugins', () => {
      expect(manager.listPlugins()).toHaveLength(0);
      expect(manager.pluginCount).toBe(0);
    });
  });

  describe('registerHooks', () => {
    it('should register hooks', () => {
      const hooks = createMockHooks();
      manager.registerHooks(hooks);

      expect(manager.getHooks()).toHaveLength(1);
      expect(manager.getHooks()[0]).toBe(hooks);
    });

    it('should register hooks with name', () => {
      const hooks = createMockHooks();
      manager.registerHooks(hooks, 'test-plugin');

      expect(manager.isLoaded('test-plugin')).toBe(true);
      expect(manager.getPlugin('test-plugin')).toBeDefined();
      expect(manager.getPlugin('test-plugin')?.name).toBe('test-plugin');
    });

    it('should emit hooks:registered event', () => {
      const listener = vi.fn();
      manager.on('hooks:registered', listener);

      manager.registerHooks(createMockHooks());

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('unloadPlugin', () => {
    it('should unload a registered plugin', async () => {
      const hooks = createMockHooks();
      manager.registerHooks(hooks, 'test-plugin');

      expect(manager.isLoaded('test-plugin')).toBe(true);

      await manager.unloadPlugin('test-plugin');

      expect(manager.isLoaded('test-plugin')).toBe(false);
      expect(manager.getHooks()).toHaveLength(0);
    });

    it('should throw error for unknown plugin', async () => {
      await expect(manager.unloadPlugin('unknown')).rejects.toThrow(
        'Plugin "unknown" is not loaded',
      );
    });

    it('should emit plugin:unloaded event', async () => {
      const listener = vi.fn();
      manager.on('plugin:unloaded', listener);

      manager.registerHooks(createMockHooks(), 'test-plugin');
      await manager.unloadPlugin('test-plugin');

      expect(listener).toHaveBeenCalledWith({ name: 'test-plugin' });
    });
  });

  describe('getPlugin', () => {
    it('should return undefined for unknown plugin', () => {
      expect(manager.getPlugin('unknown')).toBeUndefined();
    });

    it('should return plugin info for loaded plugin', () => {
      manager.registerHooks(createMockHooks(), 'test-plugin');

      const plugin = manager.getPlugin('test-plugin');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('test-plugin');
      expect(plugin?.path).toBe('internal');
      expect(plugin?.loadedAt).toBeInstanceOf(Date);
    });
  });

  describe('listPlugins', () => {
    it('should return empty array when no plugins', () => {
      expect(manager.listPlugins()).toEqual([]);
    });

    it('should return all loaded plugins', () => {
      manager.registerHooks(createMockHooks(), 'plugin-1');
      manager.registerHooks(createMockHooks(), 'plugin-2');

      const plugins = manager.listPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins.map((p) => p.name)).toContain('plugin-1');
      expect(plugins.map((p) => p.name)).toContain('plugin-2');
    });
  });

  describe('trigger', () => {
    it('should trigger hook on all registered plugins', async () => {
      const hook1 = vi.fn().mockResolvedValue(undefined);
      const hook2 = vi.fn().mockResolvedValue(undefined);

      manager.registerHooks({ 'chat.message': hook1 });
      manager.registerHooks({ 'chat.message': hook2 });

      const input = { sessionID: 'test' };
      const output = { message: { role: 'user' as const }, parts: [] };

      await manager.trigger('chat.message', input, output);

      expect(hook1).toHaveBeenCalledWith(input, output);
      expect(hook2).toHaveBeenCalledWith(input, output);
    });

    it('should allow hooks to modify output', async () => {
      const hook = vi.fn().mockImplementation(async (_input, output) => {
        output.temperature = 0.5;
      });

      manager.registerHooks({ 'chat.params': hook });

      const input = {
        sessionID: 'test',
        agent: 'default',
        model: {},
        provider: {},
        message: { role: 'user' as const },
      };
      const output = { temperature: 1.0, topP: 1.0, topK: 40, options: {} };

      const result = await manager.trigger('chat.params', input, output);

      expect(result.temperature).toBe(0.5);
    });

    it('should continue on hook error', async () => {
      const errorHook = vi.fn().mockRejectedValue(new Error('Hook error'));
      const successHook = vi.fn().mockResolvedValue(undefined);

      manager.registerHooks({ 'chat.message': errorHook });
      manager.registerHooks({ 'chat.message': successHook });

      const errorListener = vi.fn();
      manager.on('hook:error', errorListener);

      const input = { sessionID: 'test' };
      const output = { message: { role: 'user' as const }, parts: [] };

      await manager.trigger('chat.message', input, output);

      expect(errorHook).toHaveBeenCalled();
      expect(successHook).toHaveBeenCalled();
      expect(errorListener).toHaveBeenCalledWith({
        hook: 'chat.message',
        error: expect.any(Error),
      });
    });
  });

  describe('invokeHook', () => {
    it('should be an alias for trigger', async () => {
      const hook = vi.fn().mockResolvedValue(undefined);
      manager.registerHooks({ 'chat.message': hook });

      const input = { sessionID: 'test' };
      const output = { message: { role: 'user' as const }, parts: [] };

      await manager.invokeHook('chat.message', input, output);

      expect(hook).toHaveBeenCalledWith(input, output);
    });
  });

  describe('getTools', () => {
    it('should return empty map when no tools', () => {
      const tools = manager.getTools();
      expect(tools.size).toBe(0);
    });

    it('should return all registered tools', () => {
      const tool1 = {
        description: 'Tool 1',
        args: {},
        execute: vi.fn(),
      };
      const tool2 = {
        description: 'Tool 2',
        args: {},
        execute: vi.fn(),
      };

      manager.registerHooks({ tool: { tool1 } });
      manager.registerHooks({ tool: { tool2 } });

      const tools = manager.getTools();
      expect(tools.size).toBe(2);
      expect(tools.get('tool1')).toBe(tool1);
      expect(tools.get('tool2')).toBe(tool2);
    });
  });

  describe('getRegisteredTools', () => {
    it('should be an alias for getTools', () => {
      const tool = {
        description: 'Test tool',
        args: {},
        execute: vi.fn(),
      };

      manager.registerHooks({ tool: { testTool: tool } });

      expect(manager.getRegisteredTools()).toEqual(manager.getTools());
    });
  });

  describe('getAuthHooks', () => {
    it('should return empty array when no auth hooks', () => {
      expect(manager.getAuthHooks('test-provider')).toEqual([]);
    });

    it('should return auth hooks for matching provider', () => {
      const authHook = {
        provider: 'test-provider',
        methods: [],
      };

      manager.registerHooks({ auth: authHook });

      const hooks = manager.getAuthHooks('test-provider');
      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toBe(authHook);
    });

    it('should not return auth hooks for different provider', () => {
      const authHook = {
        provider: 'other-provider',
        methods: [],
      };

      manager.registerHooks({ auth: authHook });

      expect(manager.getAuthHooks('test-provider')).toEqual([]);
    });
  });

  describe('init', () => {
    it('should trigger config hooks', async () => {
      const configHook = vi.fn().mockResolvedValue(undefined);
      manager.registerHooks({ config: configHook });

      const config = { setting: 'value' };
      await manager.init(config);

      expect(configHook).toHaveBeenCalledWith(config);
    });

    it('should only initialize once', async () => {
      const configHook = vi.fn().mockResolvedValue(undefined);
      manager.registerHooks({ config: configHook });

      await manager.init({});
      await manager.init({});

      expect(configHook).toHaveBeenCalledTimes(1);
    });

    it('should emit initialized event', async () => {
      const listener = vi.fn();
      manager.on('initialized', listener);

      await manager.init();

      expect(listener).toHaveBeenCalled();
    });

    it('should continue on config hook error', async () => {
      const errorHook = vi.fn().mockRejectedValue(new Error('Config error'));
      const successHook = vi.fn().mockResolvedValue(undefined);

      manager.registerHooks({ config: errorHook });
      manager.registerHooks({ config: successHook });

      const errorListener = vi.fn();
      manager.on('hook:error', errorListener);

      await manager.init();

      expect(errorHook).toHaveBeenCalled();
      expect(successHook).toHaveBeenCalled();
      expect(errorListener).toHaveBeenCalled();
    });
  });

  describe('subscribeToEvents', () => {
    it('should forward events to event hooks', async () => {
      const eventHook = vi.fn().mockResolvedValue(undefined);
      manager.registerHooks({ event: eventHook });

      let eventHandler: ((event: unknown) => void) | undefined;
      const subscribe = (handler: (event: unknown) => void) => {
        eventHandler = handler;
      };

      manager.subscribeToEvents(subscribe);

      const testEvent = { type: 'test', data: 'value' };
      await eventHandler?.(testEvent);

      expect(eventHook).toHaveBeenCalledWith({ event: testEvent });
    });

    it('should handle event hook errors gracefully', async () => {
      const errorHook = vi.fn().mockRejectedValue(new Error('Event error'));
      manager.registerHooks({ event: errorHook });

      const errorListener = vi.fn();
      manager.on('hook:error', errorListener);

      let eventHandler: ((event: unknown) => void) | undefined;
      manager.subscribeToEvents((handler) => {
        eventHandler = handler;
      });

      await eventHandler?.({ type: 'test' });

      expect(errorListener).toHaveBeenCalledWith({
        hook: 'event',
        error: expect.any(Error),
      });
    });
  });

  describe('isLoaded', () => {
    it('should return false for unknown plugin', () => {
      expect(manager.isLoaded('unknown')).toBe(false);
    });

    it('should return true for loaded plugin', () => {
      manager.registerHooks(createMockHooks(), 'test-plugin');
      expect(manager.isLoaded('test-plugin')).toBe(true);
    });
  });

  describe('pluginCount', () => {
    it('should return 0 when no plugins', () => {
      expect(manager.pluginCount).toBe(0);
    });

    it('should return correct count', () => {
      manager.registerHooks(createMockHooks(), 'plugin-1');
      manager.registerHooks(createMockHooks(), 'plugin-2');
      expect(manager.pluginCount).toBe(2);
    });
  });
});
