/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { Provider, Model } from './types.js';

export class AnthropicProvider implements Provider {
  id = 'anthropic';
  name = 'Anthropic';

  models: Record<string, Model> = {
    'claude-3-5-sonnet-20240620': {
      id: 'claude-3-5-sonnet-20240620',
      name: 'Claude 3.5 Sonnet',
      providerID: 'anthropic',
      contextWindow: 200000,
    },
    'claude-3-opus-20240229': {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      providerID: 'anthropic',
      contextWindow: 200000,
    },
  };

  private client;

  constructor(apiKey?: string) {
    this.client = createAnthropic({
      apiKey: apiKey ?? process.env['ANTHROPIC_API_KEY'],
    });
  }

  languageModel(modelId: string): LanguageModel {
    if (!this.models[modelId]) {
      throw new Error(`Model ${modelId} not found in Anthropic provider`);
    }
    return this.client(modelId);
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    if (!process.env['ANTHROPIC_API_KEY']) {
      return {
        isValid: false,
        message: 'ANTHROPIC_API_KEY environment variable is missing',
      };
    }
    return { isValid: true };
  }
}
