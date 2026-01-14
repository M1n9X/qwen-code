/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Provider,
  Coordinator,
  CoordinatorConfig,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ChatMessage,
} from './types.js';
import { ProviderError } from './types.js';

/**
 * Default coordinator configuration
 */
const DEFAULT_CONFIG: Required<CoordinatorConfig> = {
  fallbackOrder: [],
  maxRetries: 3,
  retryDelay: 1000,
  healthCheckInterval: 60000,
};

/**
 * Provider coordinator with fallback support
 * Manages multiple providers and handles automatic failover
 */
export class ProviderCoordinator implements Coordinator {
  private providers: Map<string, Provider> = new Map();
  private activeProviderId: string | null = null;
  private fallbackOrder: string[] = [];
  private config: Required<CoordinatorConfig>;

  constructor(config?: CoordinatorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fallbackOrder = this.config.fallbackOrder;
  }

  /**
   * Registers a provider
   */
  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);

    // Set as active if no active provider
    if (!this.activeProviderId) {
      this.activeProviderId = provider.id;
    }

    // Add to fallback order if not present
    if (!this.fallbackOrder.includes(provider.id)) {
      this.fallbackOrder.push(provider.id);
    }
  }

  /**
   * Unregisters a provider
   */
  unregisterProvider(id: string): void {
    this.providers.delete(id);

    // Remove from fallback order
    this.fallbackOrder = this.fallbackOrder.filter((pid) => pid !== id);

    // Update active provider if needed
    if (this.activeProviderId === id) {
      this.activeProviderId = this.fallbackOrder[0] ?? null;
    }
  }

  /**
   * Gets a provider by ID
   */
  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /**
   * Lists all registered providers
   */
  listProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Sets the active provider
   */
  setActiveProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new ProviderError(
        `Provider ${id} not found`,
        'invalid_request',
        id,
        false,
      );
    }
    this.activeProviderId = id;
  }

  /**
   * Gets the active provider
   */
  getActiveProvider(): Provider {
    if (!this.activeProviderId) {
      throw new ProviderError(
        'No active provider configured',
        'invalid_request',
        'coordinator',
        false,
      );
    }

    const provider = this.providers.get(this.activeProviderId);
    if (!provider) {
      throw new ProviderError(
        `Active provider ${this.activeProviderId} not found`,
        'invalid_request',
        this.activeProviderId,
        false,
      );
    }

    return provider;
  }

  /**
   * Sets the fallback order for providers
   */
  setFallbackOrder(providerIds: string[]): void {
    // Validate all provider IDs exist
    for (const id of providerIds) {
      if (!this.providers.has(id)) {
        throw new ProviderError(
          `Provider ${id} not found in fallback order`,
          'invalid_request',
          id,
          false,
        );
      }
    }
    this.fallbackOrder = providerIds;
  }

  /**
   * Gets the fallback order
   */
  getFallbackOrder(): string[] {
    return [...this.fallbackOrder];
  }

  /**
   * Performs a chat request with automatic fallback
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const providersToTry = this.getProvidersToTry();

    let lastError: Error | null = null;

    for (const providerId of providersToTry) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      // Check if provider supports chat
      if (!provider.chat) {
        continue;
      }

      // Check provider health if available
      if (provider.isHealthy) {
        const healthy = await provider.isHealthy();
        if (!healthy) {
          continue;
        }
      }

      try {
        const response = await this.executeWithRetry(
          () => provider.chat!(messages, options),
          providerId,
        );
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable and we should try next provider
        if (this.shouldFallback(error)) {
          continue;
        }

        // Non-retryable error, throw immediately
        throw error;
      }
    }

    // All providers failed
    throw new ProviderError(
      `All providers failed. Last error: ${lastError?.message ?? 'Unknown error'}`,
      'server_error',
      'coordinator',
      false,
    );
  }

  /**
   * Performs a streaming chat request with automatic fallback
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk> {
    const providersToTry = this.getProvidersToTry();

    let lastError: Error | null = null;

    for (const providerId of providersToTry) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;

      // Check if provider supports streaming
      if (!provider.chatStream) {
        continue;
      }

      // Check provider health if available
      if (provider.isHealthy) {
        const healthy = await provider.isHealthy();
        if (!healthy) {
          continue;
        }
      }

      try {
        const stream = provider.chatStream(messages, options);
        let hasYielded = false;

        for await (const chunk of stream) {
          hasYielded = true;

          // If we get an error chunk, check if we should fallback
          if (chunk.type === 'error' && chunk.error) {
            if (this.shouldFallback(chunk.error)) {
              lastError = chunk.error;
              break;
            }
            throw chunk.error;
          }

          yield chunk;
        }

        // If we successfully yielded chunks, we're done
        if (hasYielded) {
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.shouldFallback(error)) {
          continue;
        }

        throw error;
      }
    }

    // All providers failed
    yield {
      type: 'error',
      error: new ProviderError(
        `All providers failed. Last error: ${lastError?.message ?? 'Unknown error'}`,
        'server_error',
        'coordinator',
        false,
      ),
    };
  }

  /**
   * Gets the list of providers to try in order
   */
  private getProvidersToTry(): string[] {
    // Start with active provider, then fallback order
    const result: string[] = [];

    if (this.activeProviderId) {
      result.push(this.activeProviderId);
    }

    for (const id of this.fallbackOrder) {
      if (!result.includes(id)) {
        result.push(id);
      }
    }

    return result;
  }

  /**
   * Executes a function with retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    providerId: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Wait before retry with exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new ProviderError(
      `Max retries exceeded for provider ${providerId}. Last error: ${lastError?.message}`,
      'server_error',
      providerId,
      false,
    );
  }

  /**
   * Checks if an error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof ProviderError) {
      return error.retryable;
    }

    // Check for common retryable error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('network')
      );
    }

    return false;
  }

  /**
   * Checks if we should fallback to the next provider
   */
  private shouldFallback(error: unknown): boolean {
    if (error instanceof ProviderError) {
      // Fallback on server errors, rate limits, and timeouts
      return (
        error.type === 'server_error' ||
        error.type === 'rate_limit' ||
        error.type === 'timeout' ||
        error.type === 'network'
      );
    }

    // Check for common fallback-worthy error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('500') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
      );
    }

    return false;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
