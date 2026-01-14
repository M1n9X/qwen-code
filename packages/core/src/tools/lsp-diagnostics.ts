/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Diagnostics Tool.
 *
 * Provides file and project-level diagnostics using LSP servers.
 * Implements: Requirements 4.1, 4.2, 4.5
 *
 * @module tools/lsp-diagnostics
 */

import { z } from 'zod';
import type { LSPManager, Diagnostic } from '../lsp/index.js';

/**
 * Input schema for file diagnostics.
 */
export const FileDiagnosticsInputSchema = z.object({
  /** Path to the file to get diagnostics for */
  file: z.string().min(1, 'File path is required'),
  /** Whether to wait for diagnostics to be published */
  waitForDiagnostics: z.boolean().optional().default(true),
});

export type FileDiagnosticsInput = z.infer<typeof FileDiagnosticsInputSchema>;

/**
 * Input schema for project diagnostics.
 */
export const ProjectDiagnosticsInputSchema = z.object({
  /** Files to get diagnostics for (optional, gets all if not specified) */
  files: z.array(z.string()).optional(),
  /** Filter by severity (1=Error, 2=Warning, 3=Info, 4=Hint) */
  minSeverity: z.number().int().min(1).max(4).optional(),
});

export type ProjectDiagnosticsInput = z.infer<
  typeof ProjectDiagnosticsInputSchema
>;

/**
 * Formatted diagnostic with file path.
 */
export interface FormattedDiagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
  code?: string | number;
}

/**
 * Result of file diagnostics.
 */
export interface FileDiagnosticsResult {
  file: string;
  diagnostics: FormattedDiagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
}

/**
 * Result of project diagnostics.
 */
export interface ProjectDiagnosticsResult {
  files: FileDiagnosticsResult[];
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  totalHints: number;
  totalFiles: number;
  filesWithErrors: number;
}

/**
 * Map severity number to string.
 */
function severityToString(
  severity?: number,
): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'info';
    case 4:
      return 'hint';
    default:
      return 'error';
  }
}

/**
 * Format a diagnostic for output.
 */
function formatDiagnostic(
  file: string,
  diagnostic: Diagnostic,
): FormattedDiagnostic {
  return {
    file,
    line: diagnostic.range.start.line + 1,
    column: diagnostic.range.start.character + 1,
    endLine: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
    severity: severityToString(diagnostic.severity),
    message: diagnostic.message,
    source: diagnostic.source,
    code: diagnostic.code,
  };
}

/**
 * Count diagnostics by severity.
 */
function countBySeverity(diagnostics: FormattedDiagnostic[]): {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
} {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let hintCount = 0;

  for (const d of diagnostics) {
    switch (d.severity) {
      case 'error':
        errorCount++;
        break;
      case 'warning':
        warningCount++;
        break;
      case 'info':
        infoCount++;
        break;
      case 'hint':
        hintCount++;
        break;
      default:
        // Unknown severity, count as error
        errorCount++;
        break;
    }
  }

  return { errorCount, warningCount, infoCount, hintCount };
}

/**
 * LSP Diagnostics Tool class.
 */
export class LSPDiagnosticsTool {
  constructor(private lspManager: LSPManager) {}

  /**
   * Get diagnostics for a single file.
   * Implements: Requirements 4.1
   */
  async getFileDiagnostics(
    input: FileDiagnosticsInput,
  ): Promise<FileDiagnosticsResult> {
    const validated = FileDiagnosticsInputSchema.parse(input);

    // Touch the file to trigger diagnostics
    await this.lspManager.touchFile(validated.file, {
      waitForDiagnostics: validated.waitForDiagnostics,
    });

    // Get diagnostics
    const rawDiagnostics = await this.lspManager.diagnosticsForFile(
      validated.file,
    );
    const diagnostics = rawDiagnostics.map((d) =>
      formatDiagnostic(validated.file, d),
    );
    const counts = countBySeverity(diagnostics);

    return {
      file: validated.file,
      diagnostics,
      ...counts,
    };
  }

  /**
   * Get diagnostics for the entire project.
   * Implements: Requirements 4.2
   */
  async getProjectDiagnostics(
    input?: ProjectDiagnosticsInput,
  ): Promise<ProjectDiagnosticsResult> {
    const validated = input ? ProjectDiagnosticsInputSchema.parse(input) : {};

    // If specific files are provided, touch them first
    if (validated.files?.length) {
      await Promise.all(
        validated.files.map((file) =>
          this.lspManager.touchFile(file, { waitForDiagnostics: true }),
        ),
      );
    }

    // Get all diagnostics
    const allDiagnostics = await this.lspManager.diagnostics();

    const files: FileDiagnosticsResult[] = [];
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalInfos = 0;
    let totalHints = 0;
    let filesWithErrors = 0;

    for (const [filePath, rawDiagnostics] of Object.entries(allDiagnostics)) {
      // Filter by files if specified
      if (validated.files?.length && !validated.files.includes(filePath)) {
        continue;
      }

      let diagnostics = rawDiagnostics.map((d) =>
        formatDiagnostic(filePath, d),
      );

      // Filter by minimum severity if specified
      if (validated.minSeverity !== undefined) {
        const severityOrder = { error: 1, warning: 2, info: 3, hint: 4 };
        diagnostics = diagnostics.filter(
          (d) => severityOrder[d.severity] <= validated.minSeverity!,
        );
      }

      if (diagnostics.length === 0) continue;

      const counts = countBySeverity(diagnostics);

      files.push({
        file: filePath,
        diagnostics,
        ...counts,
      });

      totalErrors += counts.errorCount;
      totalWarnings += counts.warningCount;
      totalInfos += counts.infoCount;
      totalHints += counts.hintCount;

      if (counts.errorCount > 0) {
        filesWithErrors++;
      }
    }

    return {
      files,
      totalErrors,
      totalWarnings,
      totalInfos,
      totalHints,
      totalFiles: files.length,
      filesWithErrors,
    };
  }

  /**
   * Format diagnostics as a human-readable string.
   * Implements: Requirements 4.5
   */
  formatDiagnosticsOutput(
    result: FileDiagnosticsResult | ProjectDiagnosticsResult,
  ): string {
    const lines: string[] = [];

    if ('files' in result) {
      // Project diagnostics
      for (const fileResult of result.files) {
        for (const d of fileResult.diagnostics) {
          lines.push(
            `${d.file}:${d.line}:${d.column}: ${d.severity.toUpperCase()}: ${d.message}`,
          );
        }
      }

      lines.push('');
      lines.push(
        `Summary: ${result.totalErrors} errors, ${result.totalWarnings} warnings, ` +
          `${result.totalInfos} infos, ${result.totalHints} hints in ${result.totalFiles} files`,
      );
    } else {
      // File diagnostics
      for (const d of result.diagnostics) {
        lines.push(
          `${d.file}:${d.line}:${d.column}: ${d.severity.toUpperCase()}: ${d.message}`,
        );
      }

      lines.push('');
      lines.push(
        `Summary: ${result.errorCount} errors, ${result.warningCount} warnings, ` +
          `${result.infoCount} infos, ${result.hintCount} hints`,
      );
    }

    return lines.join('\n');
  }
}

/**
 * Create an LSP diagnostics tool.
 */
export function createLSPDiagnosticsTool(
  lspManager: LSPManager,
): LSPDiagnosticsTool {
  return new LSPDiagnosticsTool(lspManager);
}
