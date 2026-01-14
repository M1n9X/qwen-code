/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAzure } from '@ai-sdk/azure';
import type { LanguageModel } from 'ai';
import type { Provider, Model } from './types.js';

export class AzureProvider implements Provider {
  id = 'azure';
  name = 'Azure OpenAI';

  // Azure models depend on deployments, here are placeholders
  models: Record<string, Model> = {
    'gpt-4o': {
      id: 'gpt-4o',
      name: 'GPT-4o (Azure)',
      providerID: 'azure',
      contextWindow: 128000,
    },
    'gpt-35-turbo': {
      id: 'gpt-35-turbo',
      name: 'GPT-3.5 Turbo (Azure)',
      providerID: 'azure',
      contextWindow: 16385,
    },
  };

  private client;

  constructor() {
    this.client = createAzure({
      resourceName: process.env['AZURE_RESOURCE_NAME'],
      apiKey: process.env['AZURE_API_KEY'],
    });
  }

  languageModel(modelId: string): LanguageModel {
    // In Azure, modelId is typically the deployment name
    return this.client(modelId);
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    if (!process.env['AZURE_API_KEY']) {
      return {
        isValid: false,
        message: 'AZURE_API_KEY environment variable is missing',
      };
    }
    if (!process.env['AZURE_RESOURCE_NAME']) {
      return {
        isValid: false,
        message: 'AZURE_RESOURCE_NAME environment variable is missing',
      };
    }
    return { isValid: true };
  }
}
