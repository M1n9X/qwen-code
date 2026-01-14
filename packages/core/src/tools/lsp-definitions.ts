/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Definitions Tool.
 *
 * Provides go-to-definition functionality using LSP servers.
 * Implements: Requirements 4.4, 4.7
 *
 * @module tools/lsp-definitions
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { LSPManager } from '../lsp/index.js';

/**
 * Input schema for definition lookup.
 */
export const DefinitionInputSchema = z.object({
  /** Path to the file containing the symbol */
  file: z.string().min(1, 'File path is required'),
  /** Line number (1-indexed) */
  line: z.number().int().min(1, 'Line must be at least 1'),
  /** Column number (1-indexed) */
  column: z.number().int().min(1, 'Column must be at least 1'),
});

export type DefinitionInput = z.infer<typeof DefinitionInputSchema>;

/**
 * A single definition location.
 */
export interface DefinitionLocation {
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line number (1-indexed) */
  endLine: number;
  /** End column number (1-indexed) */
  endColumn: number;
}

/**
 * Result of definition lookup.
 */
export interface DefinitionResult {
  /** The symbol being searched */
  symbol: {
    file: string;
    line: number;
    column: number;
  };
  /** Definition locations (may be multiple for overloaded functions, etc.) */
  definitions: DefinitionLocation[];
  /** Whether a definition was found */
  found: boolean;
}

/**
 * LSP Definitions Tool class.
 */
export class LSPDefinitionsTool {
  constructor(
    private lspManager: LSPManager,
    private workspaceRoot: string = process.cwd(),
  ) {}

  /**
   * Find the definition of a symbol at a given position.
   * Implements: Requirements 4.4, 4.7
   */
  async findDefinition(input: DefinitionInput): Promise<DefinitionResult> {
    const validated = DefinitionInputSchema.parse(input);

    // Resolve file path
    const filePath = path.isAbsolute(validated.file)
      ? validated.file
      : path.resolve(this.workspaceRoot, validated.file);

    // Touch the file first to ensure LSP is aware of it
    await this.lspManager.touchFile(filePath, { waitForDiagnostics: false });

    // Convert to 0-indexed for LSP
    const position = {
      line: validated.line - 1,
      character: validated.column - 1,
    };

    // Get definition from LSP
    const rawDefinitions = await this.lspManager.definition({
      file: filePath,
      line: position.line,
      character: position.character,
    });

    // Process definitions
    const definitions: DefinitionLocation[] = [];

    for (const def of rawDefinitions) {
      if (!def || typeof def !== 'object') continue;

      const defObj = def as {
        uri?: string;
        targetUri?: string;
        range?: {
          start?: { line?: number; character?: number };
          end?: { line?: number; character?: number };
        };
        targetRange?: {
          start?: { line?: number; character?: number };
          end?: { line?: number; character?: number };
        };
      };

      // Handle both Location and LocationLink formats
      const uri = defObj.uri ?? defObj.targetUri;
      const range = defObj.range ?? defObj.targetRange;

      if (!uri || !range) continue;

      let defFile: string;
      try {
        defFile = fileURLToPath(uri);
      } catch {
        continue;
      }

      // Make path relative to workspace if possible
      const relativePath = path.relative(this.workspaceRoot, defFile);
      const displayPath = relativePath.startsWith('..')
        ? defFile
        : relativePath;

      definitions.push({
        file: displayPath,
        line: (range.start?.line ?? 0) + 1,
        column: (range.start?.character ?? 0) + 1,
        endLine: (range.end?.line ?? 0) + 1,
        endColumn: (range.end?.character ?? 0) + 1,
      });
    }

    // Remove duplicates
    const uniqueDefinitions = definitions.filter(
      (def, index, self) =>
        index ===
        self.findIndex(
          (d) =>
            d.file === def.file &&
            d.line === def.line &&
            d.column === def.column,
        ),
    );

    return {
      symbol: {
        file: validated.file,
        line: validated.line,
        column: validated.column,
      },
      definitions: uniqueDefinitions,
      found: uniqueDefinitions.length > 0,
    };
  }

  /**
   * Format definition result as a human-readable string.
   */
  formatDefinitionOutput(result: DefinitionResult): string {
    const lines: string[] = [];

    lines.push(
      `Definition of symbol at ${result.symbol.file}:${result.symbol.line}:${result.symbol.column}`,
    );
    lines.push('');

    if (!result.found) {
      lines.push('No definition found.');
    } else if (result.definitions.length === 1) {
      const def = result.definitions[0];
      lines.push(`Defined at: ${def.file}:${def.line}:${def.column}`);
    } else {
      lines.push(`Found ${result.definitions.length} definitions:`);
      for (const def of result.definitions) {
        lines.push(`  ${def.file}:${def.line}:${def.column}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create an LSP definitions tool.
 */
export function createLSPDefinitionsTool(
  lspManager: LSPManager,
  workspaceRoot?: string,
): LSPDefinitionsTool {
  return new LSPDefinitionsTool(lspManager, workspaceRoot);
}
