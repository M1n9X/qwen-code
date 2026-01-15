/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAzure } from '@ai-sdk/azure';
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
  AzureProviderConfig,
} from './types.js';

/**
 * Azure OpenAI provider implementation
 */
export class AzureProvider implements Provider {
  id = 'azure';
  name = 'Azure OpenAI';

  models: Record<string, Model> = {
    'gpt-4o': {
      id: 'gpt-4o',
      name: 'GPT-4o (Azure)',
      providerID: 'azure',
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
      name: 'GPT-4o Mini (Azure)',
      providerID: 'azure',
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
    'gpt-4-turbo': {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo (Azure)',
      providerID: 'azure',
      contextWindow: 128000,
      maxOutput: 4096,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 10, output: 30 },
      status: 'active',
      family: 'gpt-4',
    },
    'gpt-35-turbo': {
      id: 'gpt-35-turbo',
      name: 'GPT-3.5 Turbo (Azure)',
      providerID: 'azure',
      contextWindow: 16385,
      maxOutput: 4096,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 0.5, output: 1.5 },
      status: 'active',
      family: 'gpt-3.5',
    },
    o1: {
      id: 'o1',
      name: 'o1 (Azure)',
      providerID: 'azure',
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
      name: 'o1 Mini (Azure)',
      providerID: 'azure',
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
  };

  private client;
  private config: AzureProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(config?: AzureProviderConfig) {
    this.config = config ?? {};
    this.client = createAzure({
      resourceName:
        this.config.resourceName ??
        this.config.baseUrl ??
        process.env['AZURE_RESOURCE_NAME'],
      apiKey: this.config.apiKey ?? process.env['AZURE_API_KEY'],
      apiVersion: this.config.apiVersion,
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    const azureConfig = this.config as AzureProviderConfig;
    this.client = createAzure({
      resourceName:
        azureConfig.resourceName ??
        this.config.baseUrl ??
        process.env['AZURE_RESOURCE_NAME'],
      apiKey: this.config.apiKey ?? process.env['AZURE_API_KEY'],
      apiVersion: azureConfig.apiVersion,
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
    const apiKey = this.config.apiKey ?? process.env['AZURE_API_KEY'];
    const resourceName =
      this.config.baseUrl ?? process.env['AZURE_RESOURCE_NAME'];

    if (!apiKey) {
      return {
        isValid: false,
        message: 'AZURE_API_KEY environment variable is missing',
      };
    }
    if (!resourceName) {
      return {
        isValid: false,
        message: 'AZURE_RESOURCE_NAME environment variable is missing',
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
