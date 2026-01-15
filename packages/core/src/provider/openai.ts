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

export class OpenAIProvider implements Provider {
  id = 'openai';
  name = 'OpenAI';

  models: Record<string, Model> = {
    'gpt-4o': {
      id: 'gpt-4o',
      name: 'GPT-4o',
      providerID: 'openai',
      contextWindow: 128000,
      maxOutput: 16384,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 2.5, output: 10 },
      status: 'active',
      family: 'gpt-4o',
    },
    'gpt-4o-mini': {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      providerID: 'openai',
      contextWindow: 128000,
      maxOutput: 16384,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.15, output: 0.6 },
      status: 'active',
      family: 'gpt-4o',
    },
    o1: {
      id: 'o1',
      name: 'o1',
      providerID: 'openai',
      contextWindow: 200000,
      maxOutput: 100000,
      capabilities: {
        temperature: false,
        reasoning: true,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 15, output: 60 },
      status: 'active',
      family: 'o1',
    },
    'o1-mini': {
      id: 'o1-mini',
      name: 'o1 Mini',
      providerID: 'openai',
      contextWindow: 128000,
      maxOutput: 65536,
      capabilities: {
        temperature: false,
        reasoning: true,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 1.1, output: 4.4 },
      status: 'active',
      family: 'o1',
    },
    'o3-mini': {
      id: 'o3-mini',
      name: 'o3 Mini',
      providerID: 'openai',
      contextWindow: 200000,
      maxOutput: 100000,
      capabilities: {
        temperature: false,
        reasoning: true,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 1.1, output: 4.4 },
      status: 'active',
      family: 'o3',
    },
  };

  private client;
  private config: ProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(apiKey?: string, config?: ProviderConfig) {
    this.config = config ?? {};
    this.client = createOpenAI({
      apiKey: apiKey ?? this.config.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: this.config.baseUrl,
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.client = createOpenAI({
      apiKey: this.config.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: this.config.baseUrl,
    });
  }

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  async validate(): Promise<ProviderValidation> {
    const apiKey = this.config.apiKey ?? process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      return {
        isValid: false,
        message: 'OPENAI_API_KEY environment variable is missing',
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
    const modelId = options?.model ?? this.config.model ?? 'gpt-4o';
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
    const modelId = options?.model ?? this.config.model ?? 'gpt-4o';
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
