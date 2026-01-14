/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, type LanguageModel } from 'ai';
import type {
  Provider,
  Model,
  ProviderConfig,
  ProviderValidation,
  ProviderHealth,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ChatMessage,
} from './types.js';

/**
 * OpenRouter provider implementation
 * Provides access to multiple models through a unified API
 */
export class OpenRouterProvider implements Provider {
  id = 'openrouter';
  name = 'OpenRouter';

  models: Record<string, Model> = {
    'anthropic/claude-3.5-sonnet': {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 200000,
      maxOutput: 8192,
    },
    'anthropic/claude-3-opus': {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 200000,
      maxOutput: 4096,
    },
    'openai/gpt-4o': {
      id: 'openai/gpt-4o',
      name: 'GPT-4o (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 128000,
      maxOutput: 4096,
    },
    'openai/gpt-4o-mini': {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 128000,
      maxOutput: 16384,
    },
    'meta-llama/llama-3.1-405b-instruct': {
      id: 'meta-llama/llama-3.1-405b-instruct',
      name: 'Llama 3.1 405B (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 128000,
      maxOutput: 4096,
    },
    'google/gemini-pro-1.5': {
      id: 'google/gemini-pro-1.5',
      name: 'Gemini Pro 1.5 (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 2000000,
      maxOutput: 8192,
    },
    'deepseek/deepseek-chat': {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek Chat (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 64000,
      maxOutput: 8192,
    },
  };

  private client;
  private config: ProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(config?: ProviderConfig) {
    this.config = config ?? {};
    this.client = createOpenAI({
      baseURL: this.config.baseUrl ?? 'https://openrouter.ai/api/v1',
      apiKey: this.config.apiKey ?? process.env['OPENROUTER_API_KEY'],
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.client = createOpenAI({
      baseURL: this.config.baseUrl ?? 'https://openrouter.ai/api/v1',
      apiKey: this.config.apiKey ?? process.env['OPENROUTER_API_KEY'],
    });
  }

  /**
   * Returns a Vercel AI SDK compatible model instance
   */
  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  /**
   * Validates if the provider is configured correctly
   */
  async validate(): Promise<ProviderValidation> {
    const apiKey = this.config.apiKey ?? process.env['OPENROUTER_API_KEY'];

    if (!apiKey) {
      return {
        isValid: false,
        message: 'OPENROUTER_API_KEY environment variable is missing',
      };
    }
    return { isValid: true };
  }

  /**
   * Checks if the provider is healthy
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.getHealth();
    return health.healthy;
  }

  /**
   * Gets detailed health status
   */
  async getHealth(): Promise<ProviderHealth> {
    const startTime = Date.now();
    try {
      const validation = await this.validate();
      if (!validation.isValid) {
        this.lastHealth = {
          healthy: false,
          lastChecked: new Date(),
          error: validation.message,
        };
        return this.lastHealth;
      }

      this.lastHealth = {
        healthy: true,
        latency: Date.now() - startTime,
        lastChecked: new Date(),
      };
      return this.lastHealth;
    } catch (error) {
      this.lastHealth = {
        healthy: false,
        latency: Date.now() - startTime,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return this.lastHealth;
    }
  }

  /**
   * Performs a chat completion request
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const modelId =
      options?.model ?? this.config.model ?? 'anthropic/claude-3.5-sonnet';
    const model = this.languageModel(modelId);

    const result = await generateText({
      model,
      messages,
      maxOutputTokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
      stopSequences: options?.stopSequences,
      abortSignal: options?.signal,
    });

    return {
      content: result.text,
      finishReason: this.mapFinishReason(result.finishReason),
      usage: result.usage
        ? {
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens ?? 0,
            totalTokens:
              (result.usage.inputTokens ?? 0) +
              (result.usage.outputTokens ?? 0),
          }
        : undefined,
      toolCalls: result.toolCalls?.map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: tc.input as Record<string, unknown>,
      })),
    };
  }

  /**
   * Performs a streaming chat completion request
   */
  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk> {
    const modelId =
      options?.model ?? this.config.model ?? 'anthropic/claude-3.5-sonnet';
    const model = this.languageModel(modelId);

    const result = streamText({
      model,
      messages,
      maxOutputTokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
      stopSequences: options?.stopSequences,
      abortSignal: options?.signal,
    });

    try {
      for await (const chunk of result.textStream) {
        yield {
          type: 'text-delta',
          textDelta: chunk,
        };
      }

      const finalResult = await result;
      const finishReason = await finalResult.finishReason;
      yield {
        type: 'finish',
        finishReason: this.mapFinishReason(finishReason),
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error('Unknown error'),
      };
    }
  }

  /**
   * Shuts down the provider
   */
  async shutdown(): Promise<void> {
    this.lastHealth = null;
  }

  /**
   * Maps AI SDK finish reason to our format
   */
  private mapFinishReason(reason: string): ChatResponse['finishReason'] {
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
      default:
        return 'other';
    }
  }
}
