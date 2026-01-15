/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generation Service Interface.
 *
 * Defines the unified interface for LLM generation operations.
 * This replaces the legacy ContentGenerator interface with a provider-agnostic
 * abstraction based on Vercel AI SDK types.
 *
 * @module generation/interface
 */

import type { LanguageModel, ModelMessage, Tool } from 'ai';

/**
 * Options for generation requests
 */
export interface GenerationOptions {
  /** Model ID to use for generation */
  model: string;
  /** Provider ID (optional, uses active provider if not specified) */
  provider?: string;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Temperature for response randomness (0-2) */
  temperature?: number;
  /** Stop sequences to end generation */
  stopSequences?: string[];
  /** Tools available for the model to call */
  tools?: Tool[];
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Additional provider-specific options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Tokens used in the prompt/input */
  promptTokens: number;
  /** Tokens generated in the completion/output */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Cached tokens read (if applicable) */
  cachedTokens?: number;
}

/**
 * Tool call representation
 */
export interface GenerationToolCall {
  /** Unique ID for this tool call */
  id: string;
  /** Name of the tool to call */
  name: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, unknown>;
}

/**
 * Finish reason for generation
 */
export type FinishReason =
  | 'stop' // Natural stop
  | 'length' // Max tokens reached
  | 'tool-calls' // Model wants to call tools
  | 'content-filter' // Content was filtered
  | 'error' // An error occurred
  | 'cancelled' // Request was cancelled
  | 'other'; // Unknown/other reason

/**
 * Result of a non-streaming generation
 */
export interface GenerationResult {
  /** Generated text content */
  content: string;
  /** Tool calls requested by the model */
  toolCalls?: GenerationToolCall[];
  /** Token usage statistics */
  usage: TokenUsage;
  /** Reason generation finished */
  finishReason: FinishReason;
  /** Provider that handled the request */
  providerId: string;
  /** Model used for generation */
  modelId: string;
  /** Raw response from provider (for debugging) */
  rawResponse?: unknown;
}

/**
 * A chunk in a streaming generation response
 */
export interface GenerationChunk {
  /** Type of chunk */
  type: 'text-delta' | 'tool-call-start' | 'tool-call-delta' | 'finish';
  /** Text delta (for text-delta type) */
  textDelta?: string;
  /** Tool call information (for tool-call types) */
  toolCall?: Partial<GenerationToolCall>;
  /** Finish reason (for finish type) */
  finishReason?: FinishReason;
  /** Usage information (may be present in finish chunk) */
  usage?: TokenUsage;
}

/**
 * Generation service interface.
 *
 * Provides a unified API for LLM generation operations, abstracting over
 * multiple providers. Implementations may use ProviderCoordinator for
 * automatic fallback and health checking.
 *
 * @example
 * ```typescript
 * const service = new GenerationServiceImpl(coordinator, pluginManager);
 *
 * // Non-streaming
 * const result = await service.generate(messages, { model: 'gpt-4o' });
 * console.log(result.content);
 *
 * // Streaming
 * for await (const chunk of service.stream(messages, { model: 'gpt-4o' })) {
 *   if (chunk.type === 'text-delta') {
 *     process.stdout.write(chunk.textDelta);
 *   }
 * }
 * ```
 */
export interface GenerationService {
  /**
   * Perform a non-streaming generation.
   *
   * @param messages - Conversation messages
   * @param options - Generation options
   * @returns Generation result with content, tool calls, and usage
   */
  generate(
    messages: ModelMessage[],
    options: GenerationOptions,
  ): Promise<GenerationResult>;

  /**
   * Perform a streaming generation.
   *
   * @param messages - Conversation messages
   * @param options - Generation options
   * @yields Generation chunks as they are received
   */
  stream(
    messages: ModelMessage[],
    options: GenerationOptions,
  ): AsyncGenerator<GenerationChunk>;

  /**
   * Count tokens for a set of messages.
   *
   * @param messages - Messages to count tokens for
   * @param modelId - Model to use for tokenization (optional)
   * @returns Approximate token count
   */
  countTokens(messages: ModelMessage[], modelId?: string): Promise<number>;

  /**
   * Get the underlying language model for direct access.
   *
   * @param modelId - Model ID
   * @param providerId - Provider ID (optional)
   * @returns Vercel AI SDK LanguageModel instance
   */
  getLanguageModel(modelId: string, providerId?: string): LanguageModel;

  /**
   * Check if the service is ready to handle requests.
   */
  isReady(): boolean;

  /**
   * Shut down the service and clean up resources.
   */
  shutdown(): Promise<void>;
}

/**
 * Events emitted by GenerationService
 */
export interface GenerationServiceEvents {
  /** Emitted when generation starts */
  'generation:start': { sessionId?: string; model: string };
  /** Emitted when generation completes */
  'generation:complete': { result: GenerationResult };
  /** Emitted when generation fails */
  'generation:error': { error: Error };
  /** Emitted when a tool is called */
  'generation:tool-call': { toolCall: GenerationToolCall };
}
