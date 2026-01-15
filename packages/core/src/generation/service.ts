/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generation Service Implementation.
 *
 * Implements the GenerationService interface using ProviderCoordinator
 * for provider management and optional PluginManager for hook integration.
 *
 * @module generation/service
 */

import {
  generateText,
  streamText,
  type ModelMessage,
  type LanguageModel,
} from 'ai';
import { EventEmitter } from 'node:events';
import type { ProviderCoordinator } from '../provider/coordinator.js';
import type { PluginManager } from '../plugin/plugin-manager.js';
import { migrationDebug } from '../config/featureFlags.js';
import type {
  GenerationService,
  GenerationOptions,
  GenerationResult,
  GenerationChunk,
  FinishReason,
} from './interface.js';

/**
 * Configuration for GenerationServiceImpl
 */
export interface GenerationServiceConfig {
  /** Default model to use if not specified in options */
  defaultModel?: string;
  /** Default provider to use if not specified in options */
  defaultProvider?: string;
  /** Enable plugin hooks */
  enablePluginHooks?: boolean;
}

/**
 * Implementation of GenerationService using ProviderCoordinator.
 *
 * This is the primary entry point for LLM generation in the unified architecture.
 * It handles:
 * - Provider selection via ProviderCoordinator
 * - Plugin hook integration (message transforms, pre/post generation)
 * - Streaming and non-streaming generation
 * - Token counting
 */
export class GenerationServiceImpl
  extends EventEmitter
  implements GenerationService
{
  private config: GenerationServiceConfig;
  private ready = false;

  constructor(
    private coordinator: ProviderCoordinator,
    private pluginManager?: PluginManager,
    config?: GenerationServiceConfig,
  ) {
    super();
    this.config = {
      defaultModel: 'gpt-4o',
      enablePluginHooks: true,
      ...config,
    };
    this.ready = true;

    migrationDebug('GenerationServiceImpl initialized', {
      defaultModel: this.config.defaultModel,
      hasPluginManager: !!pluginManager,
    });
  }

  /**
   * Perform a non-streaming generation.
   */
  async generate(
    messages: ModelMessage[],
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    const modelId = options.model || this.config.defaultModel!;
    const providerId =
      options.provider || this.config.defaultProvider || 'default';

    migrationDebug('generate called', {
      modelId,
      providerId,
      messageCount: messages.length,
    });

    // Emit start event
    this.emit('generation:start', { model: modelId });

    try {
      // Apply plugin message transforms if enabled
      let transformedMessages = messages;
      if (this.config.enablePluginHooks && this.pluginManager) {
        transformedMessages = await this.applyMessageTransforms(messages);
      }

      // Apply system prompt if provided
      if (options.systemPrompt) {
        transformedMessages = [
          { role: 'system' as const, content: options.systemPrompt },
          ...transformedMessages.filter((m) => m.role !== 'system'),
        ];
      }

      // Get language model from coordinator
      const model = this.getLanguageModel(modelId, providerId);

      // Generate using Vercel AI SDK
      const result = await generateText({
        model,
        messages: transformedMessages,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        stopSequences: options.stopSequences,
        abortSignal: options.signal,
      });

      // Map result to our interface
      const generationResult: GenerationResult = {
        content: result.text,
        toolCalls: result.toolCalls?.map((tc) => ({
          id: tc.toolCallId,
          name: tc.toolName,
          // The AI SDK uses 'input' for tool call arguments
          arguments:
            (tc as unknown as { input: Record<string, unknown> }).input ?? {},
        })),
        usage: {
          promptTokens: result.usage?.inputTokens ?? 0,
          completionTokens: result.usage?.outputTokens ?? 0,
          totalTokens:
            (result.usage?.inputTokens ?? 0) +
            (result.usage?.outputTokens ?? 0),
        },
        finishReason: this.mapFinishReason(result.finishReason),
        providerId,
        modelId,
      };

      // Apply plugin post-generation hooks if enabled
      if (this.config.enablePluginHooks && this.pluginManager) {
        await this.applyPostGenerationHooks(generationResult);
      }

      // Emit complete event
      this.emit('generation:complete', { result: generationResult });

      return generationResult;
    } catch (error) {
      // Emit error event
      this.emit('generation:error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Perform a streaming generation.
   */
  async *stream(
    messages: ModelMessage[],
    options: GenerationOptions,
  ): AsyncGenerator<GenerationChunk> {
    const modelId = options.model || this.config.defaultModel!;
    const providerId =
      options.provider || this.config.defaultProvider || 'default';

    migrationDebug('stream called', {
      modelId,
      providerId,
      messageCount: messages.length,
    });

    // Emit start event
    this.emit('generation:start', { model: modelId });

    try {
      // Apply plugin message transforms if enabled
      let transformedMessages = messages;
      if (this.config.enablePluginHooks && this.pluginManager) {
        transformedMessages = await this.applyMessageTransforms(messages);
      }

      // Apply system prompt if provided
      if (options.systemPrompt) {
        transformedMessages = [
          { role: 'system' as const, content: options.systemPrompt },
          ...transformedMessages.filter((m) => m.role !== 'system'),
        ];
      }

      // Get language model from coordinator
      const model = this.getLanguageModel(modelId, providerId);

      // Stream using Vercel AI SDK
      const result = streamText({
        model,
        messages: transformedMessages,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        stopSequences: options.stopSequences,
        abortSignal: options.signal,
      });

      // Yield text deltas
      for await (const chunk of result.textStream) {
        yield {
          type: 'text-delta',
          textDelta: chunk,
        };
      }

      // Get final result for finish chunk
      const finalResult = await result;
      const finishReason = await finalResult.finishReason;
      const usage = await finalResult.usage;

      yield {
        type: 'finish',
        finishReason: this.mapFinishReason(finishReason),
        usage: usage
          ? {
              promptTokens: usage.inputTokens ?? 0,
              completionTokens: usage.outputTokens ?? 0,
              totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
            }
          : undefined,
      };
    } catch (error) {
      // Emit error event
      this.emit('generation:error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Count tokens for messages.
   *
   * Uses a simple estimation based on character count.
   * For more accurate counting, use tiktoken directly.
   */
  async countTokens(
    messages: ModelMessage[],
    _modelId?: string,
  ): Promise<number> {
    // Simple estimation: ~4 characters per token
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (typeof part === 'object' && 'text' in part && part.text) {
            totalChars += (part.text as string).length;
          }
        }
      }
    }

    return Math.ceil(totalChars / 4);
  }

  /**
   * Get the underlying language model.
   */
  getLanguageModel(modelId: string, providerId?: string): LanguageModel {
    if (providerId && providerId !== 'default') {
      const provider = this.coordinator.getProvider(providerId);
      if (provider) {
        return provider.languageModel(modelId);
      }
    }

    return this.coordinator.getActiveProvider().languageModel(modelId);
  }

  /**
   * Check if the service is ready.
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Shut down the service.
   */
  async shutdown(): Promise<void> {
    this.ready = false;
    this.removeAllListeners();
    migrationDebug('GenerationServiceImpl shutdown');
  }

  // ============================================================================
  // Plugin integration helpers
  // ============================================================================

  /**
   * Apply plugin message transform hooks.
   */
  private async applyMessageTransforms(
    messages: ModelMessage[],
  ): Promise<ModelMessage[]> {
    if (!this.pluginManager) {
      return messages;
    }

    try {
      const output = { messages };
      await this.pluginManager.trigger(
        'experimental.chat.messages.transform',
        { messages },
        output,
      );
      return output.messages ?? messages;
    } catch (error) {
      migrationDebug('Message transform hook failed', error);
      return messages;
    }
  }

  /**
   * Apply plugin post-generation hooks.
   */
  private async applyPostGenerationHooks(
    result: GenerationResult,
  ): Promise<void> {
    if (!this.pluginManager) {
      return;
    }

    try {
      await this.pluginManager.trigger(
        'chat.message',
        {
          content: result.content,
          toolCalls: result.toolCalls,
          usage: result.usage,
        },
        {},
      );
    } catch (error) {
      migrationDebug('Post-generation hook failed', error);
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  /**
   * Map Vercel AI SDK finish reason to our format.
   */
  private mapFinishReason(reason: string | undefined): FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool-calls':
        return 'tool-calls';
      case 'content-filter':
        return 'content-filter';
      case 'error':
        return 'error';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'other';
    }
  }
}

/**
 * Create a GenerationService instance.
 *
 * @param coordinator - ProviderCoordinator for provider management
 * @param pluginManager - Optional PluginManager for hook integration
 * @param config - Optional configuration
 * @returns GenerationService instance
 */
export function createGenerationService(
  coordinator: ProviderCoordinator,
  pluginManager?: PluginManager,
  config?: GenerationServiceConfig,
): GenerationService {
  return new GenerationServiceImpl(coordinator, pluginManager, config);
}
