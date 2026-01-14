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
 * Model definition with metadata
 */
export interface Model {
  id: string;
  name: string;
  providerID: string;
  contextWindow?: number;
  maxOutput?: number;
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
   */
  chat?(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Performs a streaming chat completion request
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
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Performs a streaming chat request with automatic fallback
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<ChatChunk>;
}
