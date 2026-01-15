/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAnthropic } from '@ai-sdk/anthropic';
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

export class AnthropicProvider implements Provider {
  id = 'anthropic';
  name = 'Anthropic';

  models: Record<string, Model> = {
    'claude-sonnet-4-20250514': {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 16000,
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 3, output: 15 },
      status: 'active',
      family: 'claude-4',
    },
    'claude-3-7-sonnet-20250219': {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 16000,
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 3, output: 15 },
      status: 'active',
      family: 'claude-3.7',
    },
    'claude-3-5-sonnet-20241022': {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet v2',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 3, output: 15 },
      status: 'active',
      family: 'claude-3.5',
    },
    'claude-3-5-sonnet-20240620': {
      id: 'claude-3-5-sonnet-20240620',
      name: 'Claude 3.5 Sonnet',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 3, output: 15 },
      status: 'active',
      family: 'claude-3.5',
    },
    'claude-3-5-haiku-20241022': {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.8, output: 4 },
      status: 'active',
      family: 'claude-3.5',
    },
    'claude-3-opus-20240229': {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 4096,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 15, output: 75 },
      status: 'active',
      family: 'claude-3',
    },
    'claude-3-haiku-20240307': {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      providerID: 'anthropic',
      contextWindow: 200000,
      maxOutput: 4096,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.25, output: 1.25 },
      status: 'active',
      family: 'claude-3',
    },
  };

  private client;
  private config: ProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(apiKey?: string, config?: ProviderConfig) {
    this.config = config ?? {};
    this.client = createAnthropic({
      apiKey: apiKey ?? this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'],
      baseURL: this.config.baseUrl,
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.client = createAnthropic({
      apiKey: this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'],
      baseURL: this.config.baseUrl,
    });
  }

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  async validate(): Promise<ProviderValidation> {
    const apiKey = this.config.apiKey ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      return {
        isValid: false,
        message: 'ANTHROPIC_API_KEY environment variable is missing',
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
      options?.model ?? this.config.model ?? 'claude-3-5-sonnet-20241022';
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
      options?.model ?? this.config.model ?? 'claude-3-5-sonnet-20241022';
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
