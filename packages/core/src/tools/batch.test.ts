/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { BatchTool } from './batch.js';
import type { ToolResult } from './tools.js';

describe('BatchTool', () => {
  const createMockExecutor =
    (results: Map<string, ToolResult | Error>) =>
    async (
      toolName: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const key = `${toolName}:${JSON.stringify(params)}`;
      const result = results.get(key) ?? results.get(toolName);

      if (result instanceof Error) {
        throw result;
      }

      return (
        result ?? {
          llmContent: `Executed ${toolName}`,
          returnDisplay: `Executed ${toolName}`,
        }
      );
    };

  describe('sequential execution', () => {
    it('should execute operations in order', async () => {
      const executionOrder: string[] = [];
      const executor = async (toolName: string): Promise<ToolResult> => {
        executionOrder.push(toolName);
        return {
          llmContent: `Done ${toolName}`,
          returnDisplay: `Done ${toolName}`,
        };
      };

      const tool = new BatchTool(executor);
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {} },
          { tool: 'tool2', params: {} },
          { tool: 'tool3', params: {} },
        ],
      });

      await invocation.execute(new AbortController().signal);

      expect(executionOrder).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should track individual results in output', async () => {
      const results = new Map<string, ToolResult>([
        ['tool1', { llmContent: 'Result 1', returnDisplay: 'Result 1' }],
        ['tool2', { llmContent: 'Result 2', returnDisplay: 'Result 2' }],
      ]);

      const tool = new BatchTool(createMockExecutor(results));
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {}, id: 'op1' },
          { tool: 'tool2', params: {}, id: 'op2' },
        ],
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('op1');
      expect(result.llmContent).toContain('op2');
      expect(result.returnDisplay).toContain('2/2 succeeded');
    });
  });

  describe('failure handling', () => {
    it('should continue on failure by default', async () => {
      const results = new Map<string, ToolResult | Error>([
        ['tool1', { llmContent: 'Success', returnDisplay: 'Success' }],
        ['tool2', new Error('Tool 2 failed')],
        ['tool3', { llmContent: 'Success', returnDisplay: 'Success' }],
      ]);

      const tool = new BatchTool(createMockExecutor(results));
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {} },
          { tool: 'tool2', params: {} },
          { tool: 'tool3', params: {} },
        ],
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Succeeded: 2');
      expect(result.llmContent).toContain('Failed: 1');
      expect(result.llmContent).toContain('Tool 2 failed');
    });

    it('should stop on failure when continueOnFailure is false', async () => {
      const results = new Map<string, ToolResult | Error>([
        ['tool1', { llmContent: 'Success', returnDisplay: 'Success' }],
        ['tool2', new Error('Tool 2 failed')],
        ['tool3', { llmContent: 'Success', returnDisplay: 'Success' }],
      ]);

      const tool = new BatchTool(createMockExecutor(results));
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {} },
          { tool: 'tool2', params: {} },
          { tool: 'tool3', params: {} },
        ],
        continueOnFailure: false,
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Succeeded: 1');
      expect(result.llmContent).toContain('Failed: 2'); // tool2 failed, tool3 skipped
      expect(result.llmContent).toContain('Skipped');
    });

    it('should handle tool errors in result', async () => {
      const results = new Map<string, ToolResult>([
        [
          'tool1',
          {
            llmContent: 'Error occurred',
            returnDisplay: 'Error',
            error: { message: 'Something went wrong' },
          },
        ],
      ]);

      const tool = new BatchTool(createMockExecutor(results));
      const invocation = tool.build({
        operations: [{ tool: 'tool1', params: {} }],
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('Failed: 1');
    });
  });

  describe('metadata tracking', () => {
    it('should track total duration', async () => {
      const executor = async (): Promise<ToolResult> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { llmContent: 'Done', returnDisplay: 'Done' };
      };

      const tool = new BatchTool(executor);
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {} },
          { tool: 'tool2', params: {} },
        ],
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('duration');
    });

    it('should use default IDs when not provided', async () => {
      const executor = async (): Promise<ToolResult> => ({
        llmContent: 'Done',
        returnDisplay: 'Done',
      });

      const tool = new BatchTool(executor);
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {} },
          { tool: 'tool2', params: {} },
        ],
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('op-1');
      expect(result.llmContent).toContain('op-2');
    });
  });

  describe('abort handling', () => {
    it('should handle abort signal', async () => {
      const executor = async (): Promise<ToolResult> => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { llmContent: 'Done', returnDisplay: 'Done' };
      };

      const tool = new BatchTool(executor);
      const invocation = tool.build({
        operations: [
          { tool: 'tool1', params: {} },
          { tool: 'tool2', params: {} },
        ],
      });

      const controller = new AbortController();
      controller.abort();

      const result = await invocation.execute(controller.signal);

      expect(result.llmContent).toContain('aborted');
    });
  });
});
