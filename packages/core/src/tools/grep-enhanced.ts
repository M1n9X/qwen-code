/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { ToolResult, ToolResultDisplay, ToolInvocation } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';

/**
 * Grep match result
 */
export interface GrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  modTime?: Date;
}

/**
 * Grep response metadata
 */
export interface GrepResponseMetadata {
  numberOfMatches: number;
  truncated: boolean;
}

/**
 * Enhanced grep tool parameters
 */
export interface EnhancedGrepToolParams {
  /** Regex pattern to search for */
  pattern: string;
  /** Directory or file path to search */
  path?: string;
  /** Glob pattern to include files (e.g., "*.ts", "*.{js,jsx}") */
  include?: string;
  /** If true, treat pattern as literal text (escape regex chars) */
  literalText?: boolean;
  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Default configuration
 */
const DEFAULT_LIMIT = 100;
const MAX_CONTENT_WIDTH = 500;

/**
 * Escapes special regex characters for literal text search
 */
function escapeRegexPattern(pattern: string): string {
  return pattern.replace(/[\\.*+?^${}()|[\]]/g, '\\$&');
}

/**
 * Converts glob pattern to regex
 */
function globToRegex(glob: string): RegExp {
  let regexPattern = glob
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  // Handle brace expansion: {ts,tsx} -> (ts|tsx)
  regexPattern = regexPattern.replace(
    /\{([^}]+)\}/g,
    (_, inner) => '(' + inner.replace(/,/g, '|') + ')',
  );

  return new RegExp(regexPattern);
}

/**
 * Ripgrep JSON match structure
 */
interface RipgrepJsonMatch {
  type: string;
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
    submatches: Array<{ start: number }>;
  };
}

/**
 * Enhanced Grep Tool with crush optimizations
 * - Optimized ripgrep argument handling
 * - Smart context matching
 * - Result truncation with metadata
 * - Literal text search option
 * - Sorted by modification time
 */
export class EnhancedGrepTool extends BaseDeclarativeTool<
  EnhancedGrepToolParams,
  ToolResult
> {
  static Name = ToolNames.GREP;

  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    super(
      ToolNames.GREP,
      ToolDisplayNames.GREP,
      `A powerful search tool built on ripgrep

Usage:
- ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command.
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with include parameter (e.g., "*.js", "*.{ts,tsx}")
- Use literal_text=true for exact string matching
- Results are sorted by file modification time (newest first)
- Results are truncated at ${DEFAULT_LIMIT} matches by default`,
      Kind.Search,
      {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regex pattern to search for in file contents',
          },
          path: {
            type: 'string',
            description:
              'Directory or file to search in. Defaults to current working directory.',
          },
          include: {
            type: 'string',
            description:
              'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
          },
          literalText: {
            type: 'boolean',
            description:
              'If true, treat pattern as literal text with special regex characters escaped',
          },
          limit: {
            type: 'number',
            description: `Maximum number of results to return. Default is ${DEFAULT_LIMIT}.`,
          },
        },
        required: ['pattern'],
      },
    );
    this.workingDir = workingDir;
  }

  protected createInvocation(
    params: EnhancedGrepToolParams,
  ): ToolInvocation<EnhancedGrepToolParams, ToolResult> {
    const workingDir = this.workingDir;

    return new (class extends BaseToolInvocation<typeof params, ToolResult> {
      getDescription(): string {
        let desc = `Searching for "${params.pattern}"`;
        if (params.path) desc += ` in ${params.path}`;
        if (params.include) desc += ` (filter: ${params.include})`;
        return desc;
      }

      async execute(
        signal: AbortSignal,
        _updateOutput?: (output: ToolResultDisplay) => void,
      ): Promise<ToolResult> {
        try {
          // Prepare search pattern
          const searchPattern = params.literalText
            ? escapeRegexPattern(params.pattern)
            : params.pattern;

          // Resolve search path
          const searchPath = params.path
            ? path.resolve(workingDir, params.path)
            : workingDir;

          const limit = params.limit ?? DEFAULT_LIMIT;

          // Try ripgrep first, fallback to regex search
          let matches: GrepMatch[];
          let truncated: boolean;

          try {
            const result = await this.searchWithRipgrep(
              searchPattern,
              searchPath,
              params.include,
              limit,
              signal,
            );
            matches = result.matches;
            truncated = result.truncated;
          } catch {
            // Fallback to regex search if ripgrep fails
            const result = await this.searchWithRegex(
              searchPattern,
              searchPath,
              params.include,
              limit,
            );
            matches = result.matches;
            truncated = result.truncated;
          }

          // Sort by modification time (newest first)
          matches.sort((a, b) => {
            if (!a.modTime || !b.modTime) return 0;
            return b.modTime.getTime() - a.modTime.getTime();
          });

          // Format output
          const output = this.formatOutput(matches, truncated);

          return {
            llmContent: output,
            returnDisplay:
              matches.length > 0
                ? `Found ${matches.length} matches${truncated ? ' (truncated)' : ''}`
                : 'No matches found',
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            llmContent: `Error: ${msg}`,
            returnDisplay: `Error: ${msg}`,
            error: { message: msg },
          };
        }
      }

      private async searchWithRipgrep(
        pattern: string,
        searchPath: string,
        include: string | undefined,
        limit: number,
        signal: AbortSignal,
      ): Promise<{ matches: GrepMatch[]; truncated: boolean }> {
        const args = ['--json', '-H', '-n', '--ignore-case', pattern];

        if (include) {
          args.push('--glob', include);
        }

        // Add ignore files if they exist
        const ignoreFiles = ['.gitignore', '.qwenignore'];
        for (const ignoreFile of ignoreFiles) {
          const ignorePath = path.join(searchPath, ignoreFile);
          try {
            await fs.access(ignorePath);
            args.push('--ignore-file', ignorePath);
          } catch {
            // Ignore file doesn't exist, skip
          }
        }

        args.push(searchPath);

        return new Promise((resolve, reject) => {
          const rg = spawn('rg', args, { signal });
          let output = '';
          let error = '';

          rg.stdout.on('data', (data) => {
            output += data.toString();
          });

          rg.stderr.on('data', (data) => {
            error += data.toString();
          });

          rg.on('close', async (code) => {
            if (code !== 0 && code !== 1) {
              reject(new Error(`ripgrep failed with code ${code}: ${error}`));
              return;
            }

            const matches: GrepMatch[] = [];
            const lines = output.split('\n');

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const match: RipgrepJsonMatch = JSON.parse(line);
                if (match.type !== 'match') continue;

                // Get file modification time
                let modTime: Date | undefined;
                try {
                  const stat = await fs.stat(match.data.path.text);
                  modTime = stat.mtime;
                } catch {
                  // Skip if can't stat file
                }

                // Only get first submatch per line
                const submatch = match.data.submatches[0];
                if (submatch) {
                  matches.push({
                    file: match.data.path.text,
                    line: match.data.line_number,
                    column: submatch.start + 1,
                    content: match.data.lines.text.trim(),
                    modTime,
                  });
                }

                // Check limit
                if (matches.length >= limit * 2) break;
              } catch {
                // Skip malformed JSON lines
              }
            }

            const truncated = matches.length > limit;
            resolve({
              matches: truncated ? matches.slice(0, limit) : matches,
              truncated,
            });
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

      private async searchWithRegex(
        pattern: string,
        searchPath: string,
        include: string | undefined,
        limit: number,
      ): Promise<{ matches: GrepMatch[]; truncated: boolean }> {
        const matches: GrepMatch[] = [];
        const regex = new RegExp(pattern, 'i');
        const includeRegex = include ? globToRegex(include) : null;

        const walkDir = async (dir: string): Promise<void> => {
          if (matches.length >= limit * 2) return;

          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            if (matches.length >= limit * 2) break;

            const fullPath = path.join(dir, entry.name);

            // Skip hidden files/directories
            if (entry.name.startsWith('.')) continue;

            if (entry.isDirectory()) {
              // Skip common non-code directories
              if (
                ['node_modules', 'dist', 'build', '.git'].includes(entry.name)
              ) {
                continue;
              }
              await walkDir(fullPath);
            } else if (entry.isFile()) {
              // Check include pattern
              if (includeRegex && !includeRegex.test(fullPath)) continue;

              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                const lines = content.split('\n');
                const stat = await fs.stat(fullPath);

                for (let i = 0; i < lines.length; i++) {
                  const match = regex.exec(lines[i]);
                  if (match) {
                    matches.push({
                      file: fullPath,
                      line: i + 1,
                      column: match.index + 1,
                      content: lines[i].trim(),
                      modTime: stat.mtime,
                    });

                    if (matches.length >= limit * 2) break;
                  }
                }
              } catch {
                // Skip files that can't be read
              }
            }
          }
        };

        // Check if searchPath is a file or directory
        const stat = await fs.stat(searchPath);
        if (stat.isFile()) {
          const content = await fs.readFile(searchPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const match = regex.exec(lines[i]);
            if (match) {
              matches.push({
                file: searchPath,
                line: i + 1,
                column: match.index + 1,
                content: lines[i].trim(),
                modTime: stat.mtime,
              });
            }
          }
        } else {
          await walkDir(searchPath);
        }

        const truncated = matches.length > limit;
        return {
          matches: truncated ? matches.slice(0, limit) : matches,
          truncated,
        };
      }

      private formatOutput(matches: GrepMatch[], truncated: boolean): string {
        if (matches.length === 0) {
          return 'No files found';
        }

        const lines: string[] = [];
        lines.push(`Found ${matches.length} matches`);

        let currentFile = '';
        for (const match of matches) {
          if (currentFile !== match.file) {
            if (currentFile !== '') lines.push('');
            currentFile = match.file;
            lines.push(`${match.file}:`);
          }

          let content = match.content;
          if (content.length > MAX_CONTENT_WIDTH) {
            content = content.slice(0, MAX_CONTENT_WIDTH) + '...';
          }

          if (match.column > 0) {
            lines.push(
              `  Line ${match.line}, Char ${match.column}: ${content}`,
            );
          } else {
            lines.push(`  Line ${match.line}: ${content}`);
          }
        }

        if (truncated) {
          lines.push('');
          lines.push(
            '(Results are truncated. Consider using a more specific path or pattern.)',
          );
        }

        return lines.join('\n');
      }
    })(params);
  }
}
