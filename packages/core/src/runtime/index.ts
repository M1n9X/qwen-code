/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime compatibility layer for Bun APIs.
 *
 * This module re-exports the Bun-compatible APIs for use throughout the codebase.
 *
 * @module runtime
 */

export {
  file,
  write,
  spawn,
  readableStreamToText,
  Bun,
  type BunFile,
  type SpawnOptions,
  type SpawnResult,
} from './bun-adapter.js';
