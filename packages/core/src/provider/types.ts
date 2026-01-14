/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageModelV1 } from 'ai';

export interface Model {
  id: string;
  name: string;
  providerID: string;
  contextWindow?: number;
  maxOutput?: number;
}

export interface Provider {
  id: string;
  name: string;
  models: Record<string, Model>;
  
  /**
   * Returns a Vercel AI SDK compatible model instance
   */
  languageModel(modelId: string): LanguageModelV1;
  
  /**
   * Validates if the provider is configured correctly (e.g. API keys present)
   */
  validate(): Promise<{ isValid: boolean; message?: string }>;
}
