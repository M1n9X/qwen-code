/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type {
  Provider,
  Model,
  ProviderConfig,
  ProviderValidation,
  ProviderHealth,
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
   * Shuts down the provider
   */
  async shutdown(): Promise<void> {
    this.lastHealth = null;
  }
}
