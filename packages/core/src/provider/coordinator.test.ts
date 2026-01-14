/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderCoordinator } from './coordinator.js';
import { ProviderError } from './types.js';
import type {
  Provider,
  ChatMessage,
  ChatResponse,
  ChatChunk,
} from './types.js';

/**
 * Creates a mock provider for testing
 */
function createMockProvider(
  id: string,
  options: {
    healthy?: boolean;
    chatResponse?: ChatResponse;
    chatError?: Error;
    streamChunks?: ChatChunk[];
    streamError?: Error;
  } = {},
): Provider {
  const {
    healthy = true,
    chatResponse = { content: `Response from ${id}`, finishReason: 'stop' },
    chatError,
    streamChunks = [
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'finish', finishReason: 'stop' },
    ],
    streamError,
  } = options;

  return {
    id,
    name: `Mock ${id}`,
    models: {},
    languageModel: vi.fn(),
    validate: vi.fn().mockResolvedValue({ isValid: true }),
    isHealthy: vi.fn().mockResolvedValue(healthy),
    chat: chatError
      ? vi.fn().mockRejectedValue(chatError)
      : vi.fn().mockResolvedValue(chatResponse),
    chatStream: streamError
      ? (): AsyncGenerator<ChatChunk> =>
          // Return an async generator that throws on first iteration
          (async function* () {
            // This yield is unreachable but satisfies the require-yield rule
            // The throw happens before any yield can occur
            await Promise.reject(streamError);
            yield { type: 'error', error: streamError };
          })()
      : async function* (): AsyncGenerator<ChatChunk> {
          for (const chunk of streamChunks) {
            yield chunk;
          }
        },
  };
}

describe('ProviderCoordinator', () => {
  let coordinator: ProviderCoordinator;

  beforeEach(() => {
    coordinator = new ProviderCoordinator();
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const provider = createMockProvider('provider-a');
      coordinator.registerProvider(provider);

      expect(coordinator.getProvider('provider-a')).toBe(provider);
    });

    it('should set first registered provider as active', () => {
      const provider = createMockProvider('provider-a');
      coordinator.registerProvider(provider);

      expect(coordinator.getActiveProvider()).toBe(provider);
    });

    it('should add provider to fallback order', () => {
      const provider1 = createMockProvider('provider-a');
      const provider2 = createMockProvider('provider-b');

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      expect(coordinator.getFallbackOrder()).toEqual([
        'provider-a',
        'provider-b',
      ]);
    });
  });

  describe('unregisterProvider', () => {
    it('should remove a provider', () => {
      const provider = createMockProvider('provider-a');
      coordinator.registerProvider(provider);
      coordinator.unregisterProvider('provider-a');

      expect(coordinator.getProvider('provider-a')).toBeUndefined();
    });

    it('should update active provider when active is removed', () => {
      const provider1 = createMockProvider('provider-a');
      const provider2 = createMockProvider('provider-b');

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);
      coordinator.unregisterProvider('provider-a');

      expect(coordinator.getActiveProvider()).toBe(provider2);
    });

    it('should remove from fallback order', () => {
      const provider1 = createMockProvider('provider-a');
      const provider2 = createMockProvider('provider-b');

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);
      coordinator.unregisterProvider('provider-a');

      expect(coordinator.getFallbackOrder()).toEqual(['provider-b']);
    });
  });

  describe('setActiveProvider', () => {
    it('should set active provider', () => {
      const provider1 = createMockProvider('test1');
      const provider2 = createMockProvider('test2');

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);
      coordinator.setActiveProvider('test2');

      expect(coordinator.getActiveProvider()).toBe(provider2);
    });

    it('should throw for non-existent provider', () => {
      expect(() => coordinator.setActiveProvider('nonexistent')).toThrow(
        ProviderError,
      );
    });
  });

  describe('setFallbackOrder', () => {
    it('should set fallback order', () => {
      const provider1 = createMockProvider('test1');
      const provider2 = createMockProvider('test2');

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);
      coordinator.setFallbackOrder(['test2', 'test1']);

      expect(coordinator.getFallbackOrder()).toEqual(['test2', 'test1']);
    });

    it('should throw for non-existent provider in order', () => {
      const provider = createMockProvider('test');
      coordinator.registerProvider(provider);

      expect(() =>
        coordinator.setFallbackOrder(['test', 'nonexistent']),
      ).toThrow(ProviderError);
    });
  });

  describe('listProviders', () => {
    it('should list all providers', () => {
      const provider1 = createMockProvider('test1');
      const provider2 = createMockProvider('test2');

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const providers = coordinator.listProviders();
      expect(providers).toHaveLength(2);
      expect(providers).toContain(provider1);
      expect(providers).toContain(provider2);
    });
  });

  describe('chat', () => {
    it('should use active provider for chat', async () => {
      const provider = createMockProvider('test', {
        chatResponse: { content: 'Hello!', finishReason: 'stop' },
      });
      coordinator.registerProvider(provider);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const response = await coordinator.chat(messages);

      expect(response.content).toBe('Hello!');
      expect(provider.chat).toHaveBeenCalledWith(messages, undefined);
    });

    it('should fallback to next provider on failure', async () => {
      const provider1 = createMockProvider('test1', {
        chatError: new Error('rate limit exceeded'),
      });
      const provider2 = createMockProvider('test2', {
        chatResponse: { content: 'Fallback response', finishReason: 'stop' },
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const response = await coordinator.chat(messages);

      expect(response.content).toBe('Fallback response');
    });

    it('should skip unhealthy providers', async () => {
      const provider1 = createMockProvider('test1', { healthy: false });
      const provider2 = createMockProvider('test2', {
        chatResponse: { content: 'Healthy response', finishReason: 'stop' },
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const response = await coordinator.chat(messages);

      expect(response.content).toBe('Healthy response');
      expect(provider1.chat).not.toHaveBeenCalled();
    });

    it('should throw when all providers fail', async () => {
      const provider1 = createMockProvider('test1', {
        chatError: new Error('500 server error'),
      });
      const provider2 = createMockProvider('test2', {
        chatError: new Error('503 service unavailable'),
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];

      await expect(coordinator.chat(messages)).rejects.toThrow(
        'All providers failed',
      );
    });

    it('should throw when no providers registered', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];

      await expect(coordinator.chat(messages)).rejects.toThrow(
        'All providers failed',
      );
    });
  });

  describe('chatStream', () => {
    it('should stream from active provider', async () => {
      const provider = createMockProvider('test', {
        streamChunks: [
          { type: 'text-delta', textDelta: 'Hello' },
          { type: 'text-delta', textDelta: ' World' },
          { type: 'finish', finishReason: 'stop' },
        ],
      });
      coordinator.registerProvider(provider);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const chunks: ChatChunk[] = [];

      for await (const chunk of coordinator.chatStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'text-delta', textDelta: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'text-delta', textDelta: ' World' });
      expect(chunks[2]).toEqual({ type: 'finish', finishReason: 'stop' });
    });

    it('should fallback on stream error', async () => {
      const provider1 = createMockProvider('test1', {
        streamError: new Error('network error'),
      });
      const provider2 = createMockProvider('test2', {
        streamChunks: [
          { type: 'text-delta', textDelta: 'Fallback' },
          { type: 'finish', finishReason: 'stop' },
        ],
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const chunks: ChatChunk[] = [];

      for await (const chunk of coordinator.chatStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'text-delta', textDelta: 'Fallback' });
    });

    it('should yield error when all providers fail', async () => {
      const provider1 = createMockProvider('test1', {
        streamError: new Error('500 error'),
      });
      const provider2 = createMockProvider('test2', {
        streamError: new Error('503 error'),
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const chunks: ChatChunk[] = [];

      for await (const chunk of coordinator.chatStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toBeInstanceOf(ProviderError);
    });
  });

  describe('fallback behavior', () => {
    it('should respect fallback order', async () => {
      const provider1 = createMockProvider('test1', {
        chatError: new Error('timeout'),
      });
      const provider2 = createMockProvider('test2', {
        chatError: new Error('timeout'),
      });
      const provider3 = createMockProvider('test3', {
        chatResponse: { content: 'Third provider', finishReason: 'stop' },
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);
      coordinator.registerProvider(provider3);
      coordinator.setFallbackOrder(['test1', 'test3', 'test2']);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];
      const response = await coordinator.chat(messages);

      // Should skip test2 and go to test3 based on fallback order
      expect(response.content).toBe('Third provider');
    });

    it('should not fallback on authentication errors', async () => {
      const authError = new ProviderError(
        'Invalid API key',
        'authentication',
        'test1',
        false,
      );
      const provider1 = createMockProvider('test1', {
        chatError: authError,
      });
      const provider2 = createMockProvider('test2', {
        chatResponse: { content: 'Should not reach', finishReason: 'stop' },
      });

      coordinator.registerProvider(provider1);
      coordinator.registerProvider(provider2);

      const messages: ChatMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      ];

      await expect(coordinator.chat(messages)).rejects.toThrow(
        'Invalid API key',
      );
    });
  });
});
