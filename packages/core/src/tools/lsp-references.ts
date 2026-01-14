/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP References Tool.
 *
 * Provides symbol reference lookup using LSP servers.
 * Implements: Requirements 4.3, 4.6
 *
 * @module tools/lsp-references
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { LSPManager } from '../lsp/index.js';

/**
 * Input schema for references lookup.
 */
export const ReferencesInputSchema = z.object({
  /** Path to the file containing the symbol */
  file: z.string().min(1, 'File path is required'),
  /** Line number (1-indexed) */
  line: z.number().int().min(1, 'Line must be at least 1'),
  /** Column number (1-indexed) */
  column: z.number().int().min(1, 'Column must be at least 1'),
  /** Whether to include the declaration in results */
  includeDeclaration: z.boolean().default(true),
});

export type ReferencesInput = z.input<typeof ReferencesInputSchema>;

/**
 * A single reference location.
 */
export interface ReferenceLocation {
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
 * Result of references lookup.
 */
export interface ReferencesResult {
  /** The symbol being searched */
  symbol: {
    file: string;
    line: number;
    column: number;
  };
  /** All reference locations */
  references: ReferenceLocation[];
  /** Total number of references found */
  totalReferences: number;
  /** Number of unique files containing references */
  uniqueFiles: number;
}

/**
 * LSP References Tool class.
 */
export class LSPReferencesTool {
  constructor(
    private lspManager: LSPManager,
    private workspaceRoot: string = process.cwd(),
  ) {}

  /**
   * Find all references to a symbol at a given position.
   * Implements: Requirements 4.3, 4.6
   */
  async findReferences(input: ReferencesInput): Promise<ReferencesResult> {
    const validated = ReferencesInputSchema.parse(input);

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

    // Get references from LSP
    const rawReferences = await this.lspManager.references({
      file: filePath,
      line: position.line,
      character: position.character,
    });

    // Process references
    const references: ReferenceLocation[] = [];
    const uniqueFilesSet = new Set<string>();

    for (const ref of rawReferences) {
      if (!ref || typeof ref !== 'object') continue;

      const refObj = ref as {
        uri?: string;
        range?: {
          start?: { line?: number; character?: number };
          end?: { line?: number; character?: number };
        };
      };

      if (!refObj.uri || !refObj.range) continue;

      let refFile: string;
      try {
        refFile = fileURLToPath(refObj.uri);
      } catch {
        continue;
      }

      // Make path relative to workspace if possible
      const relativePath = path.relative(this.workspaceRoot, refFile);
      const displayPath = relativePath.startsWith('..')
        ? refFile
        : relativePath;

      uniqueFilesSet.add(displayPath);

      references.push({
        file: displayPath,
        line: (refObj.range.start?.line ?? 0) + 1,
        column: (refObj.range.start?.character ?? 0) + 1,
        endLine: (refObj.range.end?.line ?? 0) + 1,
        endColumn: (refObj.range.end?.character ?? 0) + 1,
      });
    }

    // Sort references by file, then line, then column
    references.sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.line !== b.line) return a.line - b.line;
      return a.column - b.column;
    });

    return {
      symbol: {
        file: validated.file,
        line: validated.line,
        column: validated.column,
      },
      references,
      totalReferences: references.length,
      uniqueFiles: uniqueFilesSet.size,
    };
  }

  /**
   * Format references result as a human-readable string.
   */
  formatReferencesOutput(result: ReferencesResult): string {
    const lines: string[] = [];

    lines.push(
      `References to symbol at ${result.symbol.file}:${result.symbol.line}:${result.symbol.column}`,
    );
    lines.push('');

    if (result.references.length === 0) {
      lines.push('No references found.');
    } else {
      for (const ref of result.references) {
        lines.push(`  ${ref.file}:${ref.line}:${ref.column}`);
      }

      lines.push('');
      lines.push(
        `Found ${result.totalReferences} references in ${result.uniqueFiles} files.`,
      );
    }

    return lines.join('\n');
  }
}

/**
 * Create an LSP references tool.
 */
export function createLSPReferencesTool(
  lspManager: LSPManager,
  workspaceRoot?: string,
): LSPReferencesTool {
  return new LSPReferencesTool(lspManager, workspaceRoot);
}
