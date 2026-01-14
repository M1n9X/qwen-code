/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Provider, Model } from './types.js';

export class LocalProvider implements Provider {
  id = 'local';
  name = 'Local (OpenAI Compatible)';

  models: Record<string, Model> = {}; // Populated dynamically or via config

  private client;
  private baseURL: string;

  constructor(
    baseURL: string = 'http://localhost:11434/v1',
    apiKey: string = 'ollama',
  ) {
    this.baseURL = baseURL;
    this.client = createOpenAI({
      baseURL,
      apiKey,
    });
  }

  registerModel(model: Model) {
    this.models[model.id] = model;
  }

  languageModel(modelId: string): LanguageModel {
    // For local, we accept any model ID as it might be ephemeral
    return this.client(modelId);
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    try {
      // Simple connectivity check
      const res = await fetch(`${this.baseURL}/models`);
      if (res.ok) return { isValid: true };
      return {
        isValid: false,
        message: `Failed to connect to ${this.baseURL}: status ${res.status}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        isValid: false,
        message: `Failed to connect to ${this.baseURL}: ${msg}`,
      };
    }
  }
}
