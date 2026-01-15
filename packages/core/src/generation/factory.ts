/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generation Service Factory.
 *
 * Creates the appropriate GenerationService based on feature flags and configuration.
 * This serves as the central point for obtaining a GenerationService instance.
 *
 * @module generation/factory
 */

import type { Config } from '../config/config.js';
import type { ProviderCoordinator } from '../provider/coordinator.js';
import type { PluginManager } from '../plugin/plugin-manager.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { FeatureFlags, migrationDebug } from '../config/featureFlags.js';
import type { GenerationService } from './interface.js';
import {
  GenerationServiceImpl,
  type GenerationServiceConfig,
} from './service.js';
import { LegacyGenerationAdapter } from './legacy-adapter.js';

/**
 * Options for creating a GenerationService
 */
export interface GenerationServiceFactoryOptions {
  /** Provider coordinator (required for unified mode) */
  coordinator?: ProviderCoordinator;
  /** Plugin manager for hook integration */
  pluginManager?: PluginManager;
  /** Legacy content generator (required for legacy mode) */
  contentGenerator?: ContentGenerator;
  /** Configuration object */
  config?: Config;
  /** Override feature flag (for testing) */
  forceUnified?: boolean;
  /** Service configuration */
  serviceConfig?: GenerationServiceConfig;
}

/**
 * Create a GenerationService based on feature flags.
 *
 * When `USE_UNIFIED_PROVIDERS` is enabled (or `forceUnified` is true),
 * creates a GenerationServiceImpl using the ProviderCoordinator.
 *
 * Otherwise, creates a LegacyGenerationAdapter wrapping the ContentGenerator.
 *
 * @param options - Factory options
 * @returns GenerationService instance
 * @throws Error if required dependencies are missing
 *
 * @example
 * ```typescript
 * // Auto-detect mode based on feature flags
 * const service = createGenerationServiceFromConfig({
 *   coordinator: myCoordinator,
 *   contentGenerator: myContentGenerator,
 *   pluginManager: myPluginManager,
 * });
 *
 * // Force unified mode (for testing)
 * const unifiedService = createGenerationServiceFromConfig({
 *   coordinator: myCoordinator,
 *   forceUnified: true,
 * });
 * ```
 */
export function createGenerationServiceFromConfig(
  options: GenerationServiceFactoryOptions,
): GenerationService {
  const useUnified = options.forceUnified ?? FeatureFlags.USE_UNIFIED_PROVIDERS;

  migrationDebug('createGenerationServiceFromConfig', {
    useUnified,
    hasCoordinator: !!options.coordinator,
    hasContentGenerator: !!options.contentGenerator,
    hasPluginManager: !!options.pluginManager,
  });

  if (useUnified) {
    // Use new unified GenerationService
    if (!options.coordinator) {
      throw new Error(
        'ProviderCoordinator is required when USE_UNIFIED_PROVIDERS is enabled. ' +
          'Either provide a coordinator or disable the feature flag.',
      );
    }

    return new GenerationServiceImpl(
      options.coordinator,
      options.pluginManager,
      options.serviceConfig,
    );
  } else {
    // Use legacy adapter
    if (!options.contentGenerator) {
      throw new Error(
        'ContentGenerator is required when USE_UNIFIED_PROVIDERS is disabled. ' +
          'Either provide a contentGenerator or enable the feature flag.',
      );
    }

    return new LegacyGenerationAdapter(
      options.contentGenerator,
      options.serviceConfig?.defaultModel,
    );
  }
}

/**
 * Check if the unified provider system is enabled
 */
export function isUnifiedProvidersEnabled(): boolean {
  return FeatureFlags.USE_UNIFIED_PROVIDERS;
}
