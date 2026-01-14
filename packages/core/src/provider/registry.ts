/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { Provider, Model } from './types.js';

export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();

  constructor() {}

  public register(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`Provider ${provider.id} is already registered. Overwriting.`);
    }
    this.providers.set(provider.id, provider);
  }

  public get(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  public list(): Provider[] {
    return Array.from(this.providers.values());
  }

  public listModels(): Array<Model & { id: string }> {
    const models: Array<Model & { id: string }> = [];
    for (const provider of this.providers.values()) {
      for (const model of Object.values(provider.models)) {
        models.push({
          ...model,
          id: `${provider.id}/${model.id}`, // Globally unique ID
        });
      }
    }
    return models;
  }
}
