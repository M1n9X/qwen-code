/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Feature flags for gradual migration to unified provider architecture.
 *
 * These flags allow incremental rollout of the new architecture while
 * maintaining backward compatibility with the legacy ContentGenerator system.
 *
 * @module config/featureFlags
 */

/**
 * Feature flags for the unified provider migration.
 *
 * Set via environment variables:
 * - QWEN_UNIFIED_PROVIDERS: Use new GenerationService instead of ContentGenerator
 * - QWEN_LEGACY_CG: Keep legacy ContentGenerator (default: true during migration)
 * - QWEN_PROVIDER_FALLBACK: Enable automatic provider fallback
 *
 * @example
 * ```bash
 * # Enable new unified providers
 * QWEN_UNIFIED_PROVIDERS=true npm start
 *
 * # Disable legacy ContentGenerator (after migration complete)
 * QWEN_LEGACY_CG=false npm start
 * ```
 */
export const FeatureFlags = {
  /**
   * Use the new unified GenerationService instead of legacy ContentGenerator.
   * When true, all LLM calls go through ProviderCoordinator.
   * Default: false (use legacy system)
   */
  USE_UNIFIED_PROVIDERS:
    process.env['QWEN_UNIFIED_PROVIDERS']?.toLowerCase() === 'true',

  /**
   * Keep legacy ContentGenerator available.
   * Set to false only after migration is complete and tested.
   * Default: true (legacy is available)
   */
  LEGACY_CONTENT_GENERATOR:
    process.env['QWEN_LEGACY_CG']?.toLowerCase() !== 'false',

  /**
   * Enable automatic provider fallback in ProviderCoordinator.
   * When true, failed requests automatically try the next provider in fallback order.
   * Default: false
   */
  ENABLE_PROVIDER_FALLBACK:
    process.env['QWEN_PROVIDER_FALLBACK']?.toLowerCase() === 'true',

  /**
   * Enable verbose logging for migration debugging.
   * Default: false
   */
  MIGRATION_DEBUG:
    process.env['QWEN_MIGRATION_DEBUG']?.toLowerCase() === 'true',
} as const;

/**
 * Type for feature flag keys
 */
export type FeatureFlagKey = keyof typeof FeatureFlags;

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FeatureFlags[flag];
}

/**
 * Log migration debug information if MIGRATION_DEBUG is enabled
 */
export function migrationDebug(message: string, data?: unknown): void {
  if (FeatureFlags.MIGRATION_DEBUG) {
    console.log(`[MIGRATION] ${message}`, data ?? '');
  }
}
