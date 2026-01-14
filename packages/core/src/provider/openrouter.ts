/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Provider, Model } from './types.js';

export class OpenRouterProvider implements Provider {
  id = 'openrouter';
  name = 'OpenRouter';

  models: Record<string, Model> = {
    'anthropic/claude-3.5-sonnet': {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 200000,
    },
    'openai/gpt-4o': {
      id: 'openai/gpt-4o',
      name: 'GPT-4o (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 128000,
    },
    'meta-llama/llama-3.1-405b-instruct': {
      id: 'meta-llama/llama-3.1-405b-instruct',
      name: 'Llama 3.1 405B (OpenRouter)',
      providerID: 'openrouter',
      contextWindow: 128000,
    },
  };

  private client;

  constructor() {
    this.client = createOpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env['OPENROUTER_API_KEY'],
    });
  }

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    if (!process.env['OPENROUTER_API_KEY']) {
      return {
        isValid: false,
        message: 'OPENROUTER_API_KEY environment variable is missing',
      };
    }
    return { isValid: true };
  }
}
