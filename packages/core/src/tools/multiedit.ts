/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolResult, ToolResultDisplay, ToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import * as fs from 'fs/promises';

export interface MultiEditToolParams {
  path: string;
  edits: Array<{ old_code: string; new_code: string }>;
}

export class MultiEditTool extends BaseDeclarativeTool<
  MultiEditToolParams,
  ToolResult
> {
  static Name = ToolNames.MULTI_EDIT;

  constructor() {
    super(
      ToolNames.MULTI_EDIT,
      ToolDisplayNames.MULTI_EDIT,
      'Perform multiple search-and-replace edits in a single file.',
      Kind.Edit,
      {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING', description: 'Path to the file to edit' },
          edits: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                old_code: {
                  type: 'STRING',
                  description: 'Exact code block to replace',
                },
                new_code: {
                  type: 'STRING',
                  description: 'New code block to insert',
                },
              },
              required: ['old_code', 'new_code'],
            },
          },
        },
        required: ['path', 'edits'],
      },
    );
  }

  protected createInvocation(
    params: MultiEditToolParams,
  ): ToolInvocation<MultiEditToolParams, ToolResult> {
    return new (class extends BaseToolInvocation<typeof params, ToolResult> {
      getDescription(): string {
        return `Applying ${params.edits.length} edits to ${params.path}`;
      }

      async execute(
        _signal: AbortSignal,
        _updateOutput?: (output: ToolResultDisplay) => void,
      ): Promise<ToolResult> {
        try {
          const content = await fs.readFile(params.path, 'utf-8');
          let newContent = content;

          for (const edit of params.edits) {
            // Normalize line endings for matching
            const oldCode = edit.old_code.replace(/\r\n/g, '\n');
            const normalizedContent = newContent.replace(/\r\n/g, '\n');

            // Try exact match first
            if (normalizedContent.includes(oldCode)) {
              newContent = normalizedContent.replace(oldCode, edit.new_code);
              continue;
            }

            // Fallback to error
            const trimmedOld = oldCode.trim();
            if (
              trimmedOld.length > 20 &&
              normalizedContent.includes(trimmedOld)
            ) {
              throw new Error(
                `Could not find exact match for edit. Found similar trimmed content but exact match failed. whitespace mismatch?`,
              );
            }

            throw new Error(`Could not find code block for edit.`);
          }

          if (newContent !== content) {
            await fs.writeFile(params.path, newContent, 'utf-8');
          }

          const msg = `Successfully applied ${params.edits.length} edits to ${params.path}`;
          return {
            llmContent: msg,
            returnDisplay: msg,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            llmContent: `Error: ${msg}`,
            returnDisplay: `Error: ${msg}`,
            error: {
              message: msg,
            },
          };
        }
      }
    })(params);
  }
}
