/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Provider,
  ProviderType,
  ProviderConfig,
  ProviderFactoryConfig,
  MultiProviderConfig,
  AzureProviderConfig,
  BedrockProviderConfig,
  GoogleProviderConfig,
  OpenRouterProviderConfig,
} from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { AzureProvider } from './azure.js';
import { BedrockProvider } from './bedrock.js';
import { GoogleProvider } from './google.js';
import { OpenRouterProvider } from './openrouter.js';
import { LocalProvider } from './local.js';
import { ProviderCoordinator } from './coordinator.js';

/**
 * Factory for creating provider instances
 */
export class ProviderFactory {
  /**
   * Creates a provider instance based on type
   */
  static create(type: ProviderType, config?: ProviderConfig): Provider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider(config?.apiKey);

      case 'anthropic':
        return new AnthropicProvider(config?.apiKey);

      case 'azure':
        return new AzureProvider(config as AzureProviderConfig);

      case 'bedrock':
        return new BedrockProvider(config as BedrockProviderConfig);

      case 'google':
      case 'google-vertex':
        return new GoogleProvider(config as GoogleProviderConfig);

      case 'openrouter':
        return new OpenRouterProvider(config as OpenRouterProviderConfig);

      case 'local':
      case 'openai-compatible':
        return new LocalProvider(config?.baseUrl, config?.apiKey);

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Creates a provider from factory config
   */
  static createFromConfig(factoryConfig: ProviderFactoryConfig): Provider {
    const provider = this.create(factoryConfig.type, factoryConfig.config);

    // Override id and name if provided
    if (factoryConfig.id) {
      (provider as { id: string }).id = factoryConfig.id;
    }
    if (factoryConfig.name) {
      (provider as { name: string }).name = factoryConfig.name;
    }

    return provider;
  }

  /**
   * Creates a coordinator with multiple providers from config
   */
  static createCoordinator(config: MultiProviderConfig): ProviderCoordinator {
    const coordinator = new ProviderCoordinator(config.coordinatorConfig);

    // Create and register all providers
    for (const [id, providerConfig] of Object.entries(config.providers)) {
      const provider = this.createFromConfig({
        ...providerConfig,
        id: providerConfig.id ?? id,
      });
      coordinator.registerProvider(provider);
    }

    // Set default provider if specified
    if (config.defaultProvider) {
      coordinator.setActiveProvider(config.defaultProvider);
    }

    // Set fallback order if specified
    if (config.fallbackOrder && config.fallbackOrder.length > 0) {
      coordinator.setFallbackOrder(config.fallbackOrder);
    }

    return coordinator;
  }

  /**
   * Creates providers from environment variables
   * Automatically detects which providers have API keys configured
   */
  static createFromEnvironment(): Provider[] {
    const providers: Provider[] = [];

    // Check for OpenAI
    if (process.env['OPENAI_API_KEY']) {
      providers.push(new OpenAIProvider());
    }

    // Check for Anthropic
    if (process.env['ANTHROPIC_API_KEY']) {
      providers.push(new AnthropicProvider());
    }

    // Check for Azure
    if (process.env['AZURE_API_KEY'] && process.env['AZURE_RESOURCE_NAME']) {
      providers.push(new AzureProvider());
    }

    // Check for AWS Bedrock
    if (
      process.env['AWS_ACCESS_KEY_ID'] &&
      process.env['AWS_SECRET_ACCESS_KEY']
    ) {
      providers.push(new BedrockProvider());
    }

    // Check for Google
    if (process.env['GOOGLE_GENERATIVE_AI_API_KEY']) {
      providers.push(new GoogleProvider());
    }

    // Check for OpenRouter
    if (process.env['OPENROUTER_API_KEY']) {
      providers.push(new OpenRouterProvider());
    }

    return providers;
  }

  /**
   * Creates a coordinator with all available providers from environment
   */
  static createCoordinatorFromEnvironment(): ProviderCoordinator {
    const coordinator = new ProviderCoordinator();
    const providers = this.createFromEnvironment();

    for (const provider of providers) {
      coordinator.registerProvider(provider);
    }

    return coordinator;
  }

  /**
   * Gets the default provider type based on available environment variables
   */
  static getDefaultProviderType(): ProviderType | null {
    if (process.env['ANTHROPIC_API_KEY']) return 'anthropic';
    if (process.env['OPENAI_API_KEY']) return 'openai';
    if (process.env['AZURE_API_KEY']) return 'azure';
    if (process.env['GOOGLE_GENERATIVE_AI_API_KEY']) return 'google';
    if (process.env['OPENROUTER_API_KEY']) return 'openrouter';
    if (process.env['AWS_ACCESS_KEY_ID']) return 'bedrock';
    return null;
  }
}
