/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV1 } from 'ai';
import { Provider, Model } from './types.js';

export class LocalProvider implements Provider {
  public id = 'local';
  public name = 'Local (OpenAI Compatible)';
  
  public models: Record<string, Model> = {}; // Populated dynamically or via config

  private client;
  private baseURL: string;

  constructor(baseURL: string = 'http://localhost:11434/v1', apiKey: string = 'ollama') {
    this.baseURL = baseURL;
    this.client = createOpenAI({
      baseURL,
      apiKey,
    });
  }

  public registerModel(model: Model) {
    this.models[model.id] = model;
  }

  public languageModel(modelId: string): LanguageModelV1 {
    // For local, we accept any model ID as it might be ephemeral
    return this.client(modelId);
  }

  public async validate(): Promise<{ isValid: boolean; message?: string }> {
    try {
        // Simple connectivity check
        const res = await fetch(`${this.baseURL}/models`);
        if (res.ok) return { isValid: true };
        return { isValid: false, message: `Failed to connect to ${this.baseURL}: status ${res.status}` };
    } catch (e: any) {
        return { isValid: false, message: `Failed to connect to ${this.baseURL}: ${e.message}` };
    }
  }
}
