/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type {
  Provider,
  Model,
  ProviderConfig,
  ProviderValidation,
  ProviderHealth,
  GoogleProviderConfig,
} from './types.js';

/**
 * Google Gemini / Vertex AI provider implementation
 */
export class GoogleProvider implements Provider {
  id = 'google';
  name = 'Google Gemini';

  models: Record<string, Model> = {
    'gemini-2.5-pro-preview-06-05': {
      id: 'gemini-2.5-pro-preview-06-05',
      name: 'Gemini 2.5 Pro',
      providerID: 'google',
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
    'gemini-2.5-flash-preview-05-20': {
      id: 'gemini-2.5-flash-preview-05-20',
      name: 'Gemini 2.5 Flash',
      providerID: 'google',
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
    'gemini-2.0-flash': {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      providerID: 'google',
      contextWindow: 1000000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.1, output: 0.4 },
      status: 'active',
      family: 'gemini-2.0',
    },
    'gemini-2.0-flash-lite': {
      id: 'gemini-2.0-flash-lite',
      name: 'Gemini 2.0 Flash Lite',
      providerID: 'google',
      contextWindow: 1000000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.075, output: 0.3 },
      status: 'active',
      family: 'gemini-2.0',
    },
    'gemini-1.5-pro': {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      providerID: 'google',
      contextWindow: 2000000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 1.25, output: 5 },
      status: 'active',
      family: 'gemini-1.5',
    },
    'gemini-1.5-flash': {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      providerID: 'google',
      contextWindow: 1000000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.075, output: 0.3 },
      status: 'active',
      family: 'gemini-1.5',
    },
    'gemini-1.5-flash-8b': {
      id: 'gemini-1.5-flash-8b',
      name: 'Gemini 1.5 Flash 8B',
      providerID: 'google',
      contextWindow: 1000000,
      maxOutput: 8192,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolCall: true,
        imageInput: true,
        streaming: true,
      },
      cost: { input: 0.0375, output: 0.15 },
      status: 'active',
      family: 'gemini-1.5',
    },
  };

  private client;
  private config: GoogleProviderConfig = {};
  private lastHealth: ProviderHealth | null = null;

  constructor(config?: GoogleProviderConfig) {
    this.config = config ?? {};
    this.client = createGoogleGenerativeAI({
      apiKey: this.config.apiKey ?? process.env['GOOGLE_GENERATIVE_AI_API_KEY'],
      baseURL: this.config.baseUrl,
    });
  }

  /**
   * Initializes the provider with configuration
   */
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.client = createGoogleGenerativeAI({
      apiKey: this.config.apiKey ?? process.env['GOOGLE_GENERATIVE_AI_API_KEY'],
      baseURL: this.config.baseUrl,
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
    const apiKey =
      this.config.apiKey ?? process.env['GOOGLE_GENERATIVE_AI_API_KEY'];

    if (!apiKey) {
      return {
        isValid: false,
        message: 'GOOGLE_GENERATIVE_AI_API_KEY environment variable is missing',
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
