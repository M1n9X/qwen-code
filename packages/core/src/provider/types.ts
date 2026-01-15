/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LanguageModel, ModelMessage } from 'ai';

/**
 * Message type for chat requests (re-export for convenience)
 */
export type ChatMessage = ModelMessage;

/**
 * Supported provider types
 */
export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'azure'
  | 'bedrock'
  | 'google'
  | 'google-vertex'
  | 'openrouter'
  | 'local'
  | 'openai-compatible';

/**
 * Model capabilities
 */
export interface ModelCapabilities {
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
export interface ModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Model definition with metadata
 */
export interface Model {
  id: string;
  name: string;
  providerID: string;
  contextWindow?: number;
  maxOutput?: number;
  /** Model capabilities */
  capabilities?: ModelCapabilities;
  /** Cost per million tokens */
  cost?: ModelCost;
  /** Model status */
  status?: 'active' | 'beta' | 'deprecated';
  /** Model family (e.g., 'gpt-4', 'claude-3') */
  family?: string;
}

/**
 * Provider configuration options
 */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  /** Additional headers to send with requests */
  headers?: Record<string, string>;
  /** Provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Extended provider configuration for specific providers
 */
export interface AzureProviderConfig extends ProviderConfig {
  resourceName?: string;
  deploymentName?: string;
  apiVersion?: string;
}

export interface BedrockProviderConfig extends ProviderConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
}

export interface GoogleProviderConfig extends ProviderConfig {
  project?: string;
  location?: string;
}

export interface OpenRouterProviderConfig extends ProviderConfig {
  /** Site URL for attribution */
  siteUrl?: string;
  /** Site name for attribution */
  siteName?: string;
}

/**
 * Chat request options
 */
export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  tools?: unknown[];
  signal?: AbortSignal;
}

/**
 * Chat response structure
 */
export interface ChatResponse {
  content: string;
  finishReason:
    | 'stop'
    | 'length'
    | 'tool-calls'
    | 'content-filter'
    | 'error'
    | 'other';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

/**
 * Streaming chat chunk
 */
export interface ChatChunk {
  type: 'text-delta' | 'tool-call' | 'finish' | 'error';
  textDelta?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  finishReason?: ChatResponse['finishReason'];
  error?: Error;
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  healthy: boolean;
  latency?: number;
  lastChecked: Date;
  error?: string;
}

/**
 * Provider validation result
 */
export interface ProviderValidation {
  isValid: boolean;
  message?: string;
}

/**
 * Base provider interface
 */
export interface Provider {
  id: string;
  name: string;
  models: Record<string, Model>;

  /**
   * Returns a Vercel AI SDK compatible model instance
   */
  languageModel(modelId: string): LanguageModel;

  /**
   * Validates if the provider is configured correctly (e.g. API keys present)
   */
  validate(): Promise<ProviderValidation>;

  /**
   * Checks if the provider is healthy and responsive
   */
  isHealthy?(): Promise<boolean>;

  /**
   * Gets detailed health status
   */
  getHealth?(): Promise<ProviderHealth>;

  /**
   * Performs a chat completion request
   * @deprecated Use GenerationService.generate() instead. This method will be removed in a future version.
   */
  chat?(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Performs a streaming chat completion request
   * @deprecated Use GenerationService.stream() instead. This method will be removed in a future version.
   */
  chatStream?(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk>;

  /**
   * Initializes the provider with configuration
   */
  initialize?(config: ProviderConfig): Promise<void>;

  /**
   * Shuts down the provider and cleans up resources
   */
  shutdown?(): Promise<void>;
}

/**
 * Provider error types
 */
export type ProviderErrorType =
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'invalid_request'
  | 'server_error'
  | 'unknown';

/**
 * Provider error with additional context
 */
export class ProviderError extends Error {
  readonly type: ProviderErrorType;
  readonly providerId: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;

  constructor(
    message: string,
    type: ProviderErrorType,
    providerId: string,
    retryable: boolean = false,
    retryAfter?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.type = type;
    this.providerId = providerId;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  fallbackOrder?: string[];
  maxRetries?: number;
  retryDelay?: number;
  healthCheckInterval?: number;
  /** Enable automatic model switching on context overflow */
  autoModelSwitch?: boolean;
  /** Default provider options to merge with all requests */
  defaultOptions?: ChatOptions;
}

/**
 * Model selection result
 */
export interface ModelSelection {
  providerId: string;
  modelId: string;
  model: Model;
}

/**
 * Coordinator interface for managing multiple providers
 */
export interface Coordinator {
  /**
   * Registers a provider
   */
  registerProvider(provider: Provider): void;

  /**
   * Unregisters a provider
   */
  unregisterProvider(id: string): void;

  /**
   * Gets a provider by ID
   */
  getProvider(id: string): Provider | undefined;

  /**
   * Lists all registered providers
   */
  listProviders(): Provider[];

  /**
   * Sets the active provider
   */
  setActiveProvider(id: string): void;

  /**
   * Gets the active provider
   */
  getActiveProvider(): Provider;

  /**
   * Sets the fallback order for providers
   */
  setFallbackOrder(providerIds: string[]): void;

  /**
   * Gets the fallback order
   */
  getFallbackOrder(): string[];

  /**
   * Performs a chat request with automatic fallback
   * @deprecated Use GenerationService.generate() instead. This method will be removed in a future version.
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Performs a streaming chat request with automatic fallback
   * @deprecated Use GenerationService.stream() instead. This method will be removed in a future version.
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk>;

  /**
   * Switches to a different model (can be on same or different provider)
   */
  switchModel(providerId: string, modelId: string): void;

  /**
   * Gets the current model selection
   */
  getCurrentModel(): ModelSelection | null;

  /**
   * Lists all available models across all providers
   */
  listAllModels(): ModelSelection[];

  /**
   * Finds a model by ID across all providers
   */
  findModel(modelId: string): ModelSelection | null;
}

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  type: ProviderType;
  id?: string;
  name?: string;
  config?: ProviderConfig;
}

/**
 * Multi-provider configuration (for config file)
 */
export interface MultiProviderConfig {
  providers: Record<string, ProviderFactoryConfig>;
  defaultProvider?: string;
  fallbackOrder?: string[];
  coordinatorConfig?: CoordinatorConfig;
}
