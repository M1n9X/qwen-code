/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { LanguageModel } from 'ai';
import type { Provider, Model } from './types.js';

export class BedrockProvider implements Provider {
  id = 'bedrock';
  name = 'Amazon Bedrock';

  models: Record<string, Model> = {
    'anthropic.claude-3-5-sonnet-20240620-v1:0': {
      id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      name: 'Claude 3.5 Sonnet',
      providerID: 'bedrock',
      contextWindow: 200000,
    },
    'anthropic.claude-3-opus-20240229-v1:0': {
      id: 'anthropic.claude-3-opus-20240229-v1:0',
      name: 'Claude 3 Opus',
      providerID: 'bedrock',
      contextWindow: 200000,
    },
    'anthropic.claude-3-haiku-20240307-v1:0': {
      id: 'anthropic.claude-3-haiku-20240307-v1:0',
      name: 'Claude 3 Haiku',
      providerID: 'bedrock',
      contextWindow: 200000,
    },
  };

  private client;

  constructor() {
    this.client = createAmazonBedrock({
      region: process.env['AWS_REGION'] ?? 'us-east-1',
      accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    });
  }

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    if (
      !process.env['AWS_ACCESS_KEY_ID'] ||
      !process.env['AWS_SECRET_ACCESS_KEY']
    ) {
      return {
        isValid: false,
        message: 'AWS credentials environment variables are missing',
      };
    }
    return { isValid: true };
  }
}
