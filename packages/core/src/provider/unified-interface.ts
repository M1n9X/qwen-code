/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Provider Interface.
 *
 * Defines a simplified, standardized interface for LLM providers.
 * This interface focuses on the core `languageModel()` method and removes
 * the duplicate `chat()` / `chatStream()` methods that are now handled
 * by GenerationService.
 *
 * @module provider/unified-interface
 */

import type { LanguageModel } from 'ai';

/**
 * Model definition with capabilities and metadata
 */
export interface ModelDefinition {
  /** Unique model identifier */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Provider that hosts this model */
  providerId: string;
  /** Context window size in tokens */
  contextWindow?: number;
  /** Maximum output tokens */
  maxOutput?: number;
  /** Model capabilities */
  capabilities?: UnifiedModelCapabilities;
  /** Cost per million tokens */
  cost?: UnifiedModelCost;
  /** Model availability status */
  status?: 'active' | 'beta' | 'deprecated';
  /** Model family (e.g., 'gpt-4', 'claude-3') */
  family?: string;
}

/**
 * Model capabilities
 */
export interface UnifiedModelCapabilities {
  /** Supports temperature parameter */
  temperature?: boolean;
  /** Supports reasoning/thinking mode */
  reasoning?: boolean;
  /** Supports file attachments */
  attachment?: boolean;
  /** Supports tool/function calling */
  toolCall?: boolean;
  /** Supports image input */
  imageInput?: boolean;
  /** Supports streaming */
  streaming?: boolean;
}

/**
 * Model cost information (per million tokens)
 */
export interface UnifiedModelCost {
  /** Input token cost */
  input: number;
  /** Output token cost */
  output: number;
  /** Cache read cost */
  cacheRead?: number;
  /** Cache write cost */
  cacheWrite?: number;
}

/**
 * Provider validation result
 */
export interface ProviderValidationResult {
  /** Whether the provider is valid */
  isValid: boolean;
  /** Validation message (usually for errors) */
  message?: string;
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  /** Whether the provider is healthy */
  healthy: boolean;
  /** Response latency in milliseconds */
  latencyMs?: number;
  /** Last health check timestamp */
  lastChecked: Date;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Unified Provider Interface.
 *
 * This is the simplified provider interface that all providers should implement.
 * The core method is `languageModel()` which returns a Vercel AI SDK LanguageModel.
 *
 * Unlike the legacy Provider interface, this does NOT include `chat()` or
 * `chatStream()` methods - those are handled by GenerationService.
 *
 * @example
 * ```typescript
 * class MyProvider implements UnifiedProvider {
 *   id = 'my-provider';
 *   name = 'My Provider';
 *
 *   models = [
 *     { id: 'model-1', name: 'Model 1', providerId: 'my-provider' }
 *   ];
 *
 *   languageModel(modelId: string): LanguageModel {
 *     return myClient(modelId);
 *   }
 *
 *   async validate() {
 *     return { isValid: !!process.env.MY_API_KEY };
 *   }
 * }
 * ```
 */
export interface UnifiedProvider {
  /** Unique provider identifier */
  readonly id: string;

  /** Human-readable provider name */
  readonly name: string;

  /** Available models */
  readonly models: ModelDefinition[];

  /**
   * Get a Vercel AI SDK LanguageModel instance for the given model ID.
   * This is the CORE method that all providers must implement.
   *
   * @param modelId - The model ID to get
   * @returns A LanguageModel instance compatible with Vercel AI SDK
   */
  languageModel(modelId: string): LanguageModel;

  /**
   * Validate provider configuration.
   * Should check for things like API keys, endpoints, etc.
   *
   * @returns Validation result
   */
  validate(): Promise<ProviderValidationResult>;

  /**
   * Check provider health (optional).
   * Implementations may perform a lightweight API call to verify connectivity.
   *
   * @returns Whether the provider is healthy
   */
  isHealthy?(): Promise<boolean>;

  /**
   * Get detailed health status (optional).
   *
   * @returns Detailed health information
   */
  getHealthStatus?(): Promise<ProviderHealthStatus>;

  /**
   * Initialize the provider with configuration (optional).
   * Called once when the provider is registered.
   *
   * @param config - Provider-specific configuration
   */
  initialize?(config: Record<string, unknown>): Promise<void>;

  /**
   * Shutdown the provider and release resources (optional).
   * Called when the provider is unregistered or the application shuts down.
   */
  shutdown?(): Promise<void>;

  /**
   * List available models (optional).
   * Default implementation returns the `models` property.
   *
   * @returns List of available models
   */
  listModels?(): ModelDefinition[];
}

/**
 * Type guard to check if a provider is a UnifiedProvider
 */
export function isUnifiedProvider(obj: unknown): obj is UnifiedProvider {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'languageModel' in obj &&
    typeof (obj as UnifiedProvider).languageModel === 'function'
  );
}

/**
 * Create a model definition
 */
export function createModelDefinition(
  id: string,
  name: string,
  providerId: string,
  options?: Partial<Omit<ModelDefinition, 'id' | 'name' | 'providerId'>>,
): ModelDefinition {
  return {
    id,
    name,
    providerId,
    status: 'active',
    ...options,
  };
}
