/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolResult, ToolResultDisplay, ToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';

/**
 * Single batch operation
 */
export interface BatchOperation {
  /** Tool name to execute */
  tool: string;
  /** Tool parameters */
  params: Record<string, unknown>;
  /** Optional operation ID for tracking */
  id?: string;
}

/**
 * Result of a single batch operation
 */
export interface BatchOperationResult {
  /** Operation ID or index */
  id: string;
  /** Whether operation succeeded */
  success: boolean;
  /** Result if successful */
  result?: ToolResult;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  duration: number;
}

/**
 * Batch response metadata
 */
export interface BatchResponseMetadata {
  totalOperations: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  results: BatchOperationResult[];
}

/**
 * Batch tool parameters
 */
export interface BatchToolParams {
  /** Array of operations to execute */
  operations: BatchOperation[];
  /** Continue on failure (default: true) */
  continueOnFailure?: boolean;
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<ToolResult>;

/**
 * Batch Tool for executing multiple operations sequentially
 * - Sequential execution with order preservation
 * - Partial success reporting
 * - Continue on failure option
 * - Detailed result tracking
 */
export class BatchTool extends BaseDeclarativeTool<
  BatchToolParams,
  ToolResult
> {
  static Name = ToolNames.BATCH ?? 'batch';

  private executor: ToolExecutor;

  constructor(executor: ToolExecutor) {
    super(
      ToolNames.BATCH ?? 'batch',
      ToolDisplayNames.BATCH ?? 'Batch',
      `Execute multiple tool operations in sequence.

Features:
- Sequential execution with order preservation
- Partial success reporting (continues on individual failures by default)
- Detailed result tracking with timing
- Optional fail-fast mode

Usage:
- Provide an array of operations with tool name and params
- Each operation can have an optional ID for tracking
- Set continueOnFailure=false to stop on first failure`,
      Kind.Edit,
      {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  description: 'Tool name to execute',
                },
                params: {
                  type: 'object',
                  description: 'Tool parameters',
                },
                id: {
                  type: 'string',
                  description: 'Optional operation ID for tracking',
                },
              },
              required: ['tool', 'params'],
            },
            description: 'Array of operations to execute sequentially',
          },
          continueOnFailure: {
            type: 'boolean',
            description:
              'Continue executing remaining operations on failure (default: true)',
          },
        },
        required: ['operations'],
      },
    );
    this.executor = executor;
  }

  protected createInvocation(
    params: BatchToolParams,
  ): ToolInvocation<BatchToolParams, ToolResult> {
    const executor = this.executor;

    return new (class extends BaseToolInvocation<typeof params, ToolResult> {
      getDescription(): string {
        return `Executing ${params.operations.length} batch operations`;
      }

      async execute(
        signal: AbortSignal,
        updateOutput?: (output: ToolResultDisplay) => void,
      ): Promise<ToolResult> {
        const continueOnFailure = params.continueOnFailure ?? true;
        const results: BatchOperationResult[] = [];
        const startTime = Date.now();

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < params.operations.length; i++) {
          // Check for abort
          if (signal.aborted) {
            results.push({
              id: params.operations[i].id ?? `op-${i + 1}`,
              success: false,
              error: 'Operation aborted',
              duration: 0,
            });
            failureCount++;
            continue;
          }

          const operation = params.operations[i];
          const opId = operation.id ?? `op-${i + 1}`;
          const opStartTime = Date.now();

          // Update progress
          if (updateOutput) {
            updateOutput(
              `Executing operation ${i + 1}/${params.operations.length}: ${operation.tool}`,
            );
          }

          try {
            const result = await executor(
              operation.tool,
              operation.params,
              signal,
            );

            if (result.error) {
              results.push({
                id: opId,
                success: false,
                error: result.error.message,
                duration: Date.now() - opStartTime,
              });
              failureCount++;

              if (!continueOnFailure) {
                // Add remaining operations as skipped
                for (let j = i + 1; j < params.operations.length; j++) {
                  results.push({
                    id: params.operations[j].id ?? `op-${j + 1}`,
                    success: false,
                    error: 'Skipped due to previous failure',
                    duration: 0,
                  });
                  failureCount++;
                }
                break;
              }
            } else {
              results.push({
                id: opId,
                success: true,
                result,
                duration: Date.now() - opStartTime,
              });
              successCount++;
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            results.push({
              id: opId,
              success: false,
              error: errorMsg,
              duration: Date.now() - opStartTime,
            });
            failureCount++;

            if (!continueOnFailure) {
              // Add remaining operations as skipped
              for (let j = i + 1; j < params.operations.length; j++) {
                results.push({
                  id: params.operations[j].id ?? `op-${j + 1}`,
                  success: false,
                  error: 'Skipped due to previous failure',
                  duration: 0,
                });
                failureCount++;
              }
              break;
            }
          }
        }

        const totalDuration = Date.now() - startTime;

        // Format output
        const output = this.formatOutput({
          totalOperations: params.operations.length,
          successCount,
          failureCount,
          totalDuration,
          results,
        });
        const displayMessage = `Batch complete: ${successCount}/${params.operations.length} succeeded`;

        return {
          llmContent: output,
          returnDisplay: displayMessage,
          error:
            failureCount > 0
              ? { message: `${failureCount} operation(s) failed` }
              : undefined,
        };
      }

      private formatOutput(metadata: BatchResponseMetadata): string {
        const lines: string[] = [];

        lines.push(`Batch Execution Summary`);
        lines.push(`=======================`);
        lines.push(`Total operations: ${metadata.totalOperations}`);
        lines.push(`Succeeded: ${metadata.successCount}`);
        lines.push(`Failed: ${metadata.failureCount}`);
        lines.push(`Total duration: ${metadata.totalDuration}ms`);
        lines.push('');
        lines.push('Results:');

        for (const result of metadata.results) {
          const status = result.success ? '✓' : '✗';
          const duration = result.duration > 0 ? ` (${result.duration}ms)` : '';

          if (result.success) {
            lines.push(`  ${status} ${result.id}${duration}`);
          } else {
            lines.push(`  ${status} ${result.id}: ${result.error}${duration}`);
          }
        }

        return lines.join('\n');
      }
    })(params);
  }
}
