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
  OpenRouterProviderConfig,
} from './types.js';

/**
 * OpenRouter provider implementation
 * Provides access to multiple models through a unified API
 */
export class OpenRouterProvider implements Provider {
  id = 'openrouter';
  name = 'OpenRouter';

  models: Record<string, Model> = {
    'anthropic/claude-sonnet-4': {
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4 (OpenRouter)',
      providerID: 'openrouter',
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
    'anthropic/claude-3.7-sonnet': {
      id: 'anthropic/claude-3.7-sonnet',
      name: 'Claude 3.7 Sonnet (OpenRouter)',
      providerID: 'openrouter',
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
    'anthropic/claude-3.5-sonnet': {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet (OpenRouter)',
      providerID: 'openrouter',
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
    'anthropic/claude-3-opus': {
      id: 'anthropic/claude-3-opus',
      name: 'Claude 3 Opus (OpenRouter)',
      providerID: 'openrouter',
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
    'openai/gpt-4o': {
      id: 'openai/gpt-4o',
      name: 'GPT-4o (OpenRouter)',
      providerID: 'openrouter',
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
    'openai/gpt-4o-mini': {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o Mini (OpenRouter)',
      providerID: 'openrouter',
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
    'openai/o1': {
      id: 'openai/o1',
      name: 'o1 (OpenRouter)',
      providerID: 'openrouter',
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
    'google/gemini-2.5-pro': {
      id: 'google/gemini-2.5-pro',
      name: 'Gemini 2.5 Pro (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 1000000,
      maxOutput: 65536,
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 1.25, output: 10 },
      status: 'active',
      family: 'gemini-2.5',
    },
    'google/gemini-2.5-flash': {
      id: 'google/gemini-2.5-flash',
      name: 'Gemini 2.5 Flash (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 1000000,
      maxOutput: 65536,
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.15, output: 0.6 },
      status: 'active',
      family: 'gemini-2.5',
    },
    'meta-llama/llama-3.3-70b-instruct': {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Llama 3.3 70B (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 128000,
      maxOutput: 4096,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 0.12, output: 0.3 },
      status: 'active',
      family: 'llama-3.3',
    },
    'deepseek/deepseek-chat': {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek V3 (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 64000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 0.14, output: 0.28 },
      status: 'active',
      family: 'deepseek',
    },
    'deepseek/deepseek-r1': {
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1 (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 64000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: true,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 0.55, output: 2.19 },
      status: 'active',
      family: 'deepseek',
    },
    'qwen/qwen-2.5-coder-32b-instruct': {
      id: 'qwen/qwen-2.5-coder-32b-instruct',
      name: 'Qwen 2.5 Coder 32B (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 32768,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolCall: true,
        imageInput: false,
        streaming: true,
      },
      cost: { input: 0.07, output: 0.16 },
      status: 'active',
      family: 'qwen',
    },
  };

  private client;
  private config: OpenRouterProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(config?: OpenRouterProviderConfig) {
    this.config = config ?? {};
    this.client = createOpenAI({
      baseURL: this.config.baseUrl ?? 'https://openrouter.ai/api/v1',
      apiKey: this.config.apiKey ?? process.env['OPENROUTER_API_KEY'],
      headers: {
        'HTTP-Referer': this.config.siteUrl ?? 'https://qwen-code.ai/',
        'X-Title': this.config.siteName ?? 'qwen-code',
      },
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    const orConfig = this.config as OpenRouterProviderConfig;
    this.client = createOpenAI({
      baseURL: this.config.baseUrl ?? 'https://openrouter.ai/api/v1',
      apiKey: this.config.apiKey ?? process.env['OPENROUTER_API_KEY'],
      headers: {
        'HTTP-Referer': orConfig.siteUrl ?? 'https://qwen-code.ai/',
        'X-Title': orConfig.siteName ?? 'qwen-code',
      },
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
