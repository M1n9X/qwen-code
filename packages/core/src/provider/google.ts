/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { Provider, Model } from './types.js';

export class GoogleProvider implements Provider {
  id = 'google';
  name = 'Google Gemini';

  models: Record<string, Model> = {
    'gemini-1.5-pro-latest': {
      id: 'gemini-1.5-pro-latest',
      name: 'Gemini 1.5 Pro',
      providerID: 'google',
      contextWindow: 1000000,
    },
    'gemini-1.5-flash-latest': {
      id: 'gemini-1.5-flash-latest',
      name: 'Gemini 1.5 Flash',
      providerID: 'google',
      contextWindow: 1000000,
    },
  };

  private client;

  constructor() {
    this.client = createGoogleGenerativeAI({
      apiKey: process.env['GOOGLE_GENERATIVE_AI_API_KEY'],
    });
  }

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    if (!process.env['GOOGLE_GENERATIVE_AI_API_KEY']) {
      return {
        isValid: false,
        message: 'GOOGLE_GENERATIVE_AI_API_KEY environment variable is missing',
      };
    }
    return { isValid: true };
  }
}
