/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderFactory } from './provider-factory.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { AzureProvider } from './azure.js';
import { BedrockProvider } from './bedrock.js';
import { GoogleProvider } from './google.js';
import { OpenRouterProvider } from './openrouter.js';
import { LocalProvider } from './local.js';

describe('ProviderFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('create', () => {
    it('should create OpenAI provider', () => {
      const provider = ProviderFactory.create('openai', { apiKey: 'test-key' });
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.id).toBe('openai');
    });

    it('should create Anthropic provider', () => {
      const provider = ProviderFactory.create('anthropic', {
        apiKey: 'test-key',
      });
      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.id).toBe('anthropic');
    });

    it('should create Azure provider', () => {
      const provider = ProviderFactory.create('azure', {
        apiKey: 'test-key',
        baseUrl: 'test-resource',
      });
      expect(provider).toBeInstanceOf(AzureProvider);
      expect(provider.id).toBe('azure');
    });

    it('should create Bedrock provider', () => {
      const provider = ProviderFactory.create('bedrock', {
        apiKey: 'test-key',
      });
      expect(provider).toBeInstanceOf(BedrockProvider);
      expect(provider.id).toBe('bedrock');
    });

    it('should create Google provider', () => {
      const provider = ProviderFactory.create('google', { apiKey: 'test-key' });
      expect(provider).toBeInstanceOf(GoogleProvider);
      expect(provider.id).toBe('google');
    });

    it('should create OpenRouter provider', () => {
      const provider = ProviderFactory.create('openrouter', {
        apiKey: 'test-key',
      });
      expect(provider).toBeInstanceOf(OpenRouterProvider);
      expect(provider.id).toBe('openrouter');
    });

    it('should create Local provider', () => {
      const provider = ProviderFactory.create('local', {
        baseUrl: 'http://localhost:11434/v1',
      });
      expect(provider).toBeInstanceOf(LocalProvider);
      expect(provider.id).toBe('local');
    });

    it('should create OpenAI-compatible provider', () => {
      const provider = ProviderFactory.create('openai-compatible', {
        baseUrl: 'http://localhost:8080/v1',
        apiKey: 'test-key',
      });
      expect(provider).toBeInstanceOf(LocalProvider);
    });

    it('should throw for unknown provider type', () => {
      expect(() => ProviderFactory.create('unknown' as never, {})).toThrow(
        'Unknown provider type: unknown',
      );
    });
  });

  describe('createFromConfig', () => {
    it('should create provider with custom id', () => {
      const provider = ProviderFactory.createFromConfig({
        type: 'openai',
        id: 'custom-openai',
        config: { apiKey: 'test-key' },
      });
      expect(provider.id).toBe('custom-openai');
    });

    it('should create provider with custom name', () => {
      const provider = ProviderFactory.createFromConfig({
        type: 'anthropic',
        name: 'My Anthropic',
        config: { apiKey: 'test-key' },
      });
      expect(provider.name).toBe('My Anthropic');
    });
  });

  describe('createCoordinator', () => {
    it('should create coordinator with multiple providers', () => {
      const coordinator = ProviderFactory.createCoordinator({
        providers: {
          openai: { type: 'openai', config: { apiKey: 'key1' } },
          anthropic: { type: 'anthropic', config: { apiKey: 'key2' } },
        },
      });

      const providers = coordinator.listProviders();
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.id)).toContain('openai');
      expect(providers.map((p) => p.id)).toContain('anthropic');
    });

    it('should set default provider', () => {
      const coordinator = ProviderFactory.createCoordinator({
        providers: {
          openai: { type: 'openai', config: { apiKey: 'key1' } },
          anthropic: { type: 'anthropic', config: { apiKey: 'key2' } },
        },
        defaultProvider: 'anthropic',
      });

      expect(coordinator.getActiveProvider().id).toBe('anthropic');
    });

    it('should set fallback order', () => {
      const coordinator = ProviderFactory.createCoordinator({
        providers: {
          openai: { type: 'openai', config: { apiKey: 'key1' } },
          anthropic: { type: 'anthropic', config: { apiKey: 'key2' } },
          google: { type: 'google', config: { apiKey: 'key3' } },
        },
        fallbackOrder: ['anthropic', 'google', 'openai'],
      });

      expect(coordinator.getFallbackOrder()).toEqual([
        'anthropic',
        'google',
        'openai',
      ]);
    });
  });

  describe('createFromEnvironment', () => {
    it('should create providers from environment variables', () => {
      process.env['OPENAI_API_KEY'] = 'test-openai-key';
      process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';

      const providers = ProviderFactory.createFromEnvironment();

      expect(providers.length).toBeGreaterThanOrEqual(2);
      expect(providers.some((p) => p.id === 'openai')).toBe(true);
      expect(providers.some((p) => p.id === 'anthropic')).toBe(true);
    });

    it('should return empty array when no env vars set', () => {
      delete process.env['OPENAI_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['AZURE_API_KEY'];
      delete process.env['AWS_ACCESS_KEY_ID'];
      delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
      delete process.env['OPENROUTER_API_KEY'];

      const providers = ProviderFactory.createFromEnvironment();
      expect(providers).toHaveLength(0);
    });
  });

  describe('getDefaultProviderType', () => {
    it('should return anthropic when ANTHROPIC_API_KEY is set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'test-key';
      delete process.env['OPENAI_API_KEY'];

      expect(ProviderFactory.getDefaultProviderType()).toBe('anthropic');
    });

    it('should return openai when only OPENAI_API_KEY is set', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      process.env['OPENAI_API_KEY'] = 'test-key';

      expect(ProviderFactory.getDefaultProviderType()).toBe('openai');
    });

    it('should return null when no env vars set', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['AZURE_API_KEY'];
      delete process.env['AWS_ACCESS_KEY_ID'];
      delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
      delete process.env['OPENROUTER_API_KEY'];

      expect(ProviderFactory.getDefaultProviderType()).toBeNull();
    });
  });
});
