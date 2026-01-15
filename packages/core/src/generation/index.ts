/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generation Module.
 *
 * Provides unified LLM generation services that abstract over multiple providers.
 * This module replaces the legacy ContentGenerator system with a provider-agnostic
 * implementation based on Vercel AI SDK.
 *
 * @module generation
 *
 * @example
 * ```typescript
 * // Create a generation service with the new system
 * import { createGenerationService } from '@qwen-code/core/generation';
 * import { ProviderCoordinator } from '@qwen-code/core/provider';
 *
 * const coordinator = new ProviderCoordinator();
 * coordinator.registerProvider(new OpenAIProvider());
 * coordinator.setActiveProvider('openai');
 *
 * const generationService = createGenerationService(coordinator);
 *
 * // Non-streaming generation
 * const result = await generationService.generate(
 *   [{ role: 'user', content: 'Hello!' }],
 *   { model: 'gpt-4o' }
 * );
 *
 * // Streaming generation
 * for await (const chunk of generationService.stream(messages, options)) {
 *   if (chunk.type === 'text-delta') {
 *     process.stdout.write(chunk.textDelta);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use legacy adapter for backward compatibility
 * import { createLegacyGenerationAdapter } from '@qwen-code/core/generation';
 *
 * const legacyService = createLegacyGenerationAdapter(contentGenerator);
 * // Use the same GenerationService interface
 * const result = await legacyService.generate(messages, options);
 * ```
 */

// Interface exports
export type {
  GenerationService,
  GenerationOptions,
  GenerationResult,
  GenerationChunk,
  GenerationToolCall,
  TokenUsage,
  FinishReason,
  GenerationServiceEvents,
} from './interface.js';

// Implementation exports
export {
  GenerationServiceImpl,
  type GenerationServiceConfig,
  createGenerationService,
} from './service.js';

// Legacy adapter exports (deprecated)
export {
  LegacyGenerationAdapter,
  createLegacyGenerationAdapter,
} from './legacy-adapter.js';

// Factory exports (recommended entry point)
export {
  createGenerationServiceFromConfig,
  isUnifiedProvidersEnabled,
  type GenerationServiceFactoryOptions,
} from './factory.js';
