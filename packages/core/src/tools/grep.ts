/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolResult, ToolResultDisplay, ToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export type GrepToolParams = {
  pattern: string;
  path: string;
  includes?: string[];
  excludes?: string[];
  caseInsensitive?: boolean;
};

export class GrepTool extends BaseDeclarativeTool<GrepToolParams, ToolResult> {
  static Name = ToolNames.GREP;

  constructor() {
    super(
      ToolNames.GREP,
      ToolDisplayNames.GREP,
      'Search for patterns in files using ripgrep logic.',
      Kind.Search,
      {
        type: 'OBJECT',
        properties: {
          pattern: {
            type: 'STRING',
            description: 'Regex pattern to search for',
          },
          path: {
            type: 'STRING',
            description: 'File or directory path to search',
          },
          includes: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Glob patterns to include',
          },
          excludes: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Glob patterns to exclude',
          },
          caseInsensitive: {
            type: 'BOOLEAN',
            description: 'Case insensitive search',
          },
        },
        required: ['pattern', 'path'],
      },
    );
  }

  protected createInvocation(
    params: GrepToolParams,
  ): ToolInvocation<GrepToolParams, ToolResult> {
    return new (class extends BaseToolInvocation<typeof params, ToolResult> {
      getDescription(): string {
        return `Searching for "${params.pattern}" in ${params.path}`;
      }

      async execute(
        _signal: AbortSignal,
        _updateOutput?: (output: ToolResultDisplay) => void,
      ): Promise<ToolResult> {
        try {
          const matches = await this.runGrep(params);
          const resultStr = matches
            .map((m) => `${m.file}:${m.line}: ${m.content}`)
            .join('\n');
          return {
            llmContent: resultStr || 'No matches found.',
            returnDisplay: resultStr || 'No matches found.',
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

      private async runGrep(options: typeof params): Promise<GrepMatch[]> {
        const args = ['--line-number', '--no-heading', '--color=never'];

        if (options.caseInsensitive) {
          args.push('--ignore-case');
        }

        if (options.includes) {
          options.includes.forEach((inc) => args.push('-g', inc));
        }

        if (options.excludes) {
          options.excludes.forEach((exc) => args.push('-g', `!${exc}`));
        }

        args.push(options.pattern);
        args.push(options.path);

        return new Promise((resolve, reject) => {
          const rg = spawn('rg', args);
          let output = '';
          let error = '';

          rg.stdout.on('data', (data) => {
            output += data.toString();
          });

          rg.stderr.on('data', (data) => {
            error += data.toString();
          });

          rg.on('close', (code) => {
            if (code !== 0 && code !== 1) {
              // 1 means no matches found, which is fine
              reject(new Error(`ripgrep failed with code ${code}: ${error}`));
              return;
            }

            const matches: GrepMatch[] = [];
            const lines = output.split('\n');

            for (const line of lines) {
              if (!line) continue;
              const parts = line.split(':');
              if (parts.length >= 3) {
                const file = parts[0];
                const lineNumber = parseInt(parts[1], 10);
                const content = parts.slice(2).join(':');
                if (!isNaN(lineNumber)) {
                  matches.push({ file, line: lineNumber, content });
                }
              }
            }

            resolve(matches);
          });

          rg.on('error', (err) => {
            reject(
              new Error(
                `Failed to start ripgrep: ${err.message}. Is 'rg' installed?`,
              ),
            );
          });
        });
      }
    })(params);
  }
}
