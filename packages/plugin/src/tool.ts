/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Plugin Tool Helper.
 *
 * This module provides utilities for defining plugin tools with Zod schemas.
 *
 * @module plugin/tool
 */

import { z } from 'zod';

/**
 * Context provided to plugin tools during execution.
 */
export interface ToolContext {
  /** Current session ID */
  sessionID: string;
  /** Current message ID */
  messageID: string;
  /** Agent name */
  agent: string;
  /** Abort signal for cancellation */
  abort: AbortSignal;
  /** Update tool metadata (title, custom data) */
  metadata(input: { title?: string; metadata?: Record<string, unknown> }): void;
  /** Request permission from user */
  ask(input: AskInput): Promise<void>;
}

/**
 * Permission request input.
 */
export interface AskInput {
  /** Permission type (e.g., 'file_read', 'shell_exec') */
  permission: string;
  /** Glob patterns for affected resources */
  patterns: string[];
  /** Patterns to always allow in future */
  always: string[];
  /** Additional metadata for the permission request */
  metadata: Record<string, unknown>;
}

/**
 * Tool definition input for the tool() helper.
 */
export interface ToolInput<Args extends z.ZodRawShape> {
  /** Tool description for the LLM */
  description: string;
  /** Zod schema for tool arguments */
  args: Args;
  /** Tool execution function */
  execute(
    args: z.infer<z.ZodObject<Args>>,
    context: ToolContext,
  ): Promise<string>;
}

/**
 * Define a plugin tool with Zod schema validation.
 *
 * @example
 * ```typescript
 * const myTool = tool({
 *   description: 'Fetches weather data',
 *   args: {
 *     city: z.string().describe('City name'),
 *   },
 *   async execute(args, ctx) {
 *     return `Weather in ${args.city}: Sunny`;
 *   }
 * });
 * ```
 */
export function tool<Args extends z.ZodRawShape>(
  input: ToolInput<Args>,
): ToolInput<Args> {
  return input;
}

// Attach z to tool for convenience (tool.schema.string(), etc.)
tool.schema = z;

/**
 * Type for a tool definition created by tool().
 */
export type ToolDefinition = ReturnType<typeof tool>;
