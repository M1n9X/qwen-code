/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
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
  BedrockProviderConfig,
} from './types.js';

/**
 * AWS Bedrock provider implementation
 */
export class BedrockProvider implements Provider {
  id = 'bedrock';
  name = 'Amazon Bedrock';

  models: Record<string, Model> = {
    'anthropic.claude-sonnet-4-20250514-v1:0': {
      id: 'anthropic.claude-sonnet-4-20250514-v1:0',
      name: 'Claude Sonnet 4 (Bedrock)',
      providerID: 'bedrock',
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
    'anthropic.claude-3-7-sonnet-20250219-v1:0': {
      id: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
      name: 'Claude 3.7 Sonnet (Bedrock)',
      providerID: 'bedrock',
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
    'anthropic.claude-3-5-sonnet-20241022-v2:0': {
      id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      name: 'Claude 3.5 Sonnet v2 (Bedrock)',
      providerID: 'bedrock',
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
    'anthropic.claude-3-5-sonnet-20240620-v1:0': {
      id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      name: 'Claude 3.5 Sonnet (Bedrock)',
      providerID: 'bedrock',
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
    'anthropic.claude-3-5-haiku-20241022-v1:0': {
      id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
      name: 'Claude 3.5 Haiku (Bedrock)',
      providerID: 'bedrock',
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
    'anthropic.claude-3-opus-20240229-v1:0': {
      id: 'anthropic.claude-3-opus-20240229-v1:0',
      name: 'Claude 3 Opus (Bedrock)',
      providerID: 'bedrock',
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
    'anthropic.claude-3-haiku-20240307-v1:0': {
      id: 'anthropic.claude-3-haiku-20240307-v1:0',
      name: 'Claude 3 Haiku (Bedrock)',
      providerID: 'bedrock',
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
    'amazon.nova-pro-v1:0': {
      id: 'amazon.nova-pro-v1:0',
      name: 'Amazon Nova Pro',
      providerID: 'bedrock',
      contextWindow: 300000,
      maxOutput: 5000,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.8, output: 3.2 },
      status: 'active',
      family: 'nova',
    },
    'amazon.nova-lite-v1:0': {
      id: 'amazon.nova-lite-v1:0',
      name: 'Amazon Nova Lite',
      providerID: 'bedrock',
      contextWindow: 300000,
      maxOutput: 5000,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.06, output: 0.24 },
      status: 'active',
      family: 'nova',
    },
    'amazon.nova-micro-v1:0': {
      id: 'amazon.nova-micro-v1:0',
      name: 'Amazon Nova Micro',
      providerID: 'bedrock',
      contextWindow: 128000,
      maxOutput: 5000,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 0.035, output: 0.14 },
      status: 'active',
      family: 'nova',
    },
  };

  private client;
  private config: BedrockProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(config?: BedrockProviderConfig) {
    this.config = config ?? {};
    this.client = createAmazonBedrock({
      region: this.config.region ?? process.env['AWS_REGION'] ?? 'us-east-1',
      accessKeyId:
        this.config.accessKeyId ??
        this.config.apiKey ??
        process.env['AWS_ACCESS_KEY_ID'],
      secretAccessKey:
        this.config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'],
      sessionToken:
        this.config.sessionToken ?? process.env['AWS_SESSION_TOKEN'],
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    const bedrockConfig = this.config as BedrockProviderConfig;
    this.client = createAmazonBedrock({
      region: bedrockConfig.region ?? process.env['AWS_REGION'] ?? 'us-east-1',
      accessKeyId:
        bedrockConfig.accessKeyId ??
        this.config.apiKey ??
        process.env['AWS_ACCESS_KEY_ID'],
      secretAccessKey:
        bedrockConfig.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'],
      sessionToken:
        bedrockConfig.sessionToken ?? process.env['AWS_SESSION_TOKEN'],
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
    const accessKeyId = this.config.apiKey ?? process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];

    if (!accessKeyId || !secretAccessKey) {
      return {
        isValid: false,
        message: 'AWS credentials environment variables are missing',
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
      options?.model ??
      this.config.model ??
      'anthropic.claude-3-5-sonnet-20241022-v2:0';
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
      options?.model ??
      this.config.model ??
      'anthropic.claude-3-5-sonnet-20241022-v2:0';
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
