/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV1 } from 'ai';
import { Provider, Model } from './types.js';

export class OpenAIProvider implements Provider {
  public id = 'openai';
  public name = 'OpenAI';
  
  public models: Record<string, Model> = {
    'gpt-4o': {
      id: 'gpt-4o',
      name: 'GPT-4o',
      providerID: 'openai',
      contextWindow: 128000,
    },
    'gpt-4o-mini': {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      providerID: 'openai',
      contextWindow: 128000,
    }
  };

  private client;

  constructor(apiKey?: string) {
    this.client = createOpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  public languageModel(modelId: string): LanguageModelV1 {
    if (!this.models[modelId]) {
      throw new Error(`Model ${modelId} not found in OpenAI provider`);
    }
    return this.client(modelId);
  }

  public async validate(): Promise<{ isValid: boolean; message?: string }> {
    if (!process.env.OPENAI_API_KEY) {
      return { isValid: false, message: 'OPENAI_API_KEY environment variable is missing' };
    }
    return { isValid: true };
  }
}
