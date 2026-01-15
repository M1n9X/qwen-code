/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolResult, ToolResultDisplay, ToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';

/**
 * Single edit operation
 */
export interface EditOperation {
  /** The text to replace */
  oldString: string;
  /** The text to replace it with */
  newString: string;
  /** Replace all occurrences (default: false) */
  replaceAll?: boolean;
}

/**
 * Failed edit information
 */
export interface FailedEdit {
  index: number;
  error: string;
  edit: EditOperation;
}

/**
 * MultiEdit response metadata
 */
export interface MultiEditResponseMetadata {
  additions: number;
  removals: number;
  oldContent?: string;
  newContent?: string;
  editsApplied: number;
  editsFailed: FailedEdit[];
}

/**
 * Enhanced MultiEdit tool parameters
 */
export interface EnhancedMultiEditToolParams {
  /** Path to the file to modify */
  filePath: string;
  /** Array of edit operations to perform sequentially */
  edits: EditOperation[];
}

/**
 * Converts content to Unix line endings, returns original format flag
 */
function toUnixLineEndings(content: string): {
  content: string;
  isCrlf: boolean;
} {
  const isCrlf = content.includes('\r\n');
  return {
    content: content.replace(/\r\n/g, '\n'),
    isCrlf,
  };
}

/**
 * Converts content back to Windows line endings
 */
function toWindowsLineEndings(content: string): string {
  return content.replace(/\n/g, '\r\n');
}

/**
 * Applies a single edit operation to content
 */
function applyEditToContent(
  content: string,
  edit: EditOperation,
): { content: string; error?: string } {
  if (edit.oldString === '' && edit.newString === '') {
    return { content };
  }

  if (edit.oldString === '') {
    return {
      content,
      error: 'old_string cannot be empty for content replacement',
    };
  }

  if (edit.replaceAll) {
    const count = content.split(edit.oldString).length - 1;
    if (count === 0) {
      return {
        content,
        error:
          'old_string not found in content. Make sure it matches exactly, including whitespace and line breaks',
      };
    }
    return { content: content.split(edit.oldString).join(edit.newString) };
  }

  const index = content.indexOf(edit.oldString);
  if (index === -1) {
    return {
      content,
      error:
        'old_string not found in content. Make sure it matches exactly, including whitespace and line breaks',
    };
  }

  const lastIndex = content.lastIndexOf(edit.oldString);
  if (index !== lastIndex) {
    return {
      content,
      error:
        'old_string appears multiple times in the content. Please provide more context to ensure a unique match, or set replaceAll to true',
    };
  }

  const newContent =
    content.slice(0, index) +
    edit.newString +
    content.slice(index + edit.oldString.length);
  return { content: newContent };
}

/**
 * Detects and preserves indentation from old code to new code
 */
function preserveIndentation(oldString: string, newString: string): string {
  // Get the indentation of the first line of oldString
  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  if (oldLines.length === 0 || newLines.length === 0) {
    return newString;
  }

  // Detect indentation from first non-empty line of old string
  let baseIndent = '';
  for (const line of oldLines) {
    const match = line.match(/^(\s*)/);
    if (match && line.trim().length > 0) {
      baseIndent = match[1];
      break;
    }
  }

  // Detect indentation from first non-empty line of new string
  let newBaseIndent = '';
  for (const line of newLines) {
    const match = line.match(/^(\s*)/);
    if (match && line.trim().length > 0) {
      newBaseIndent = match[1];
      break;
    }
  }

  // If indentations match or new string has no indentation, return as-is
  if (baseIndent === newBaseIndent || newBaseIndent === '') {
    return newString;
  }

  // Adjust indentation of new string to match old string
  const indentDiff = baseIndent.length - newBaseIndent.length;
  if (indentDiff === 0) {
    return newString;
  }

  return newLines
    .map((line, i) => {
      if (i === 0 || line.trim() === '') return line;

      if (indentDiff > 0) {
        // Add indentation
        return ' '.repeat(indentDiff) + line;
      } else {
        // Remove indentation (carefully)
        const currentIndent = line.match(/^(\s*)/)?.[1] ?? '';
        const removeAmount = Math.min(-indentDiff, currentIndent.length);
        return line.slice(removeAmount);
      }
    })
    .join('\n');
}

/**
 * Enhanced MultiEdit Tool with crush optimizations
 * - Robust find-and-replace with exact matching
 * - Multiple occurrence handling with replaceAll option
 * - Indentation preservation
 * - Detailed error recovery with partial success reporting
 * - Line ending preservation (CRLF/LF)
 */
export class EnhancedMultiEditTool extends BaseDeclarativeTool<
  EnhancedMultiEditToolParams,
  ToolResult
> {
  static Name = ToolNames.MULTI_EDIT;

  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    super(
      ToolNames.MULTI_EDIT,
      ToolDisplayNames.MULTI_EDIT,
      `Perform multiple search-and-replace edits in a single file.

Features:
- Exact string matching (whitespace-sensitive)
- Sequential edit application
- Partial success reporting (continues on individual failures)
- Indentation preservation
- Line ending preservation (CRLF/LF)
- File creation support (first edit with empty old_string)

Usage:
- Each edit requires old_string and new_string
- Set replaceAll=true to replace all occurrences
- First edit can have empty old_string to create a new file`,
      Kind.Edit,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the file to modify',
          },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                oldString: {
                  type: 'string',
                  description: 'The text to replace',
                },
                newString: {
                  type: 'string',
                  description: 'The text to replace it with',
                },
                replaceAll: {
                  type: 'boolean',
                  description: 'Replace all occurrences (default: false)',
                },
              },
              required: ['oldString', 'newString'],
            },
            description: 'Array of edit operations to perform sequentially',
          },
        },
        required: ['filePath', 'edits'],
      },
    );
    this.workingDir = workingDir;
  }

  protected createInvocation(
    params: EnhancedMultiEditToolParams,
  ): ToolInvocation<EnhancedMultiEditToolParams, ToolResult> {
    const workingDir = this.workingDir;

    return new (class extends BaseToolInvocation<typeof params, ToolResult> {
      getDescription(): string {
        return `Applying ${params.edits.length} edits to ${params.filePath}`;
      }

      async execute(
        _signal: AbortSignal,
        _updateOutput?: (output: ToolResultDisplay) => void,
      ): Promise<ToolResult> {
        try {
          // Validate parameters
          if (!params.filePath) {
            return this.errorResult('file_path is required');
          }

          if (!params.edits || params.edits.length === 0) {
            return this.errorResult('at least one edit operation is required');
          }

          // Validate edits
          for (let i = 1; i < params.edits.length; i++) {
            if (params.edits[i].oldString === '') {
              return this.errorResult(
                `edit ${i + 1}: only the first edit can have empty old_string (for file creation)`,
              );
            }
          }

          const filePath = path.resolve(workingDir, params.filePath);

          // Check if this is a file creation case
          if (params.edits[0].oldString === '') {
            return this.processFileCreation(filePath, params.edits);
          }

          return this.processExistingFile(filePath, params.edits);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return this.errorResult(msg);
        }
      }

      private errorResult(message: string): ToolResult {
        return {
          llmContent: `Error: ${message}`,
          returnDisplay: `Error: ${message}`,
          error: { message },
        };
      }

      private async processFileCreation(
        filePath: string,
        edits: EditOperation[],
      ): Promise<ToolResult> {
        // Check if file already exists
        try {
          await fs.access(filePath);
          return this.errorResult(`file already exists: ${filePath}`);
        } catch {
          // File doesn't exist, good to create
        }

        // Create parent directories
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        // Start with content from first edit
        let currentContent = edits[0].newString;
        const failedEdits: FailedEdit[] = [];

        // Apply remaining edits
        for (let i = 1; i < edits.length; i++) {
          const edit = edits[i];
          const adjustedNewString = preserveIndentation(
            edit.oldString,
            edit.newString,
          );
          const result = applyEditToContent(currentContent, {
            ...edit,
            newString: adjustedNewString,
          });

          if (result.error) {
            failedEdits.push({
              index: i + 1,
              error: result.error,
              edit,
            });
          } else {
            currentContent = result.content;
          }
        }

        // Write the file
        await fs.writeFile(filePath, currentContent, 'utf-8');

        const editsApplied = edits.length - failedEdits.length;

        let message: string;
        if (failedEdits.length > 0) {
          message = `File created with ${editsApplied} of ${edits.length} edits: ${filePath} (${failedEdits.length} edit(s) failed)`;
        } else {
          message = `File created with ${edits.length} edits: ${filePath}`;
        }

        return {
          llmContent: this.formatResponse(message, failedEdits),
          returnDisplay: message,
        };
      }

      private async processExistingFile(
        filePath: string,
        edits: EditOperation[],
      ): Promise<ToolResult> {
        // Check file exists
        let stat;
        try {
          stat = await fs.stat(filePath);
        } catch {
          return this.errorResult(`file not found: ${filePath}`);
        }

        if (stat.isDirectory()) {
          return this.errorResult(
            `path is a directory, not a file: ${filePath}`,
          );
        }

        // Read current content
        const rawContent = await fs.readFile(filePath, 'utf-8');
        const { content: oldContent, isCrlf } = toUnixLineEndings(rawContent);
        let currentContent = oldContent;
        const failedEdits: FailedEdit[] = [];

        // Apply all edits sequentially
        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i];
          const adjustedNewString = preserveIndentation(
            edit.oldString,
            edit.newString,
          );
          const result = applyEditToContent(currentContent, {
            ...edit,
            newString: adjustedNewString,
          });

          if (result.error) {
            failedEdits.push({
              index: i + 1,
              error: result.error,
              edit,
            });
          } else {
            currentContent = result.content;
          }
        }

        // Check if content changed
        if (oldContent === currentContent) {
          if (failedEdits.length > 0) {
            return {
              llmContent: this.formatResponse(
                `no changes made - all ${failedEdits.length} edit(s) failed`,
                failedEdits,
              ),
              returnDisplay: `no changes made - all ${failedEdits.length} edit(s) failed`,
              error: { message: 'All edits failed' },
            };
          }
          return this.errorResult(
            'no changes made - all edits resulted in identical content',
          );
        }

        // Restore line endings if needed
        const finalContent = isCrlf
          ? toWindowsLineEndings(currentContent)
          : currentContent;

        // Write the file
        await fs.writeFile(filePath, finalContent, 'utf-8');

        const editsApplied = edits.length - failedEdits.length;

        let message: string;
        if (failedEdits.length > 0) {
          message = `Applied ${editsApplied} of ${edits.length} edits to file: ${filePath} (${failedEdits.length} edit(s) failed)`;
        } else {
          message = `Applied ${edits.length} edits to file: ${filePath}`;
        }

        return {
          llmContent: this.formatResponse(message, failedEdits),
          returnDisplay: message,
        };
      }

      private formatResponse(
        message: string,
        failedEdits: FailedEdit[],
      ): string {
        const lines = [message];

        if (failedEdits.length > 0) {
          lines.push('');
          lines.push('Failed edits:');
          for (const failed of failedEdits) {
            lines.push(`  Edit ${failed.index}: ${failed.error}`);
            if (failed.edit.oldString.length <= 50) {
              lines.push(`    old_string: "${failed.edit.oldString}"`);
            } else {
              lines.push(
                `    old_string: "${failed.edit.oldString.slice(0, 50)}..."`,
              );
            }
          }
        }

        return lines.join('\n');
      }
    })(params);
  }
}
