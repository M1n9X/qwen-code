/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  LSPDiagnosticsTool} from './lsp-diagnostics.js';
import {
  FileDiagnosticsInputSchema,
  ProjectDiagnosticsInputSchema,
  createLSPDiagnosticsTool,
} from './lsp-diagnostics.js';
import type {
  LSPDefinitionsTool} from './lsp-definitions.js';
import {
  DefinitionInputSchema,
  createLSPDefinitionsTool,
} from './lsp-definitions.js';
import type {
  LSPReferencesTool} from './lsp-references.js';
import {
  ReferencesInputSchema,
  createLSPReferencesTool,
} from './lsp-references.js';
import type { LSPManager } from '../lsp/index.js';

/**
 * Create a mock LSP manager for testing.
 */
function createMockLSPManager(): LSPManager {
  return {
    touchFile: vi.fn().mockResolvedValue(undefined),
    diagnosticsForFile: vi.fn().mockResolvedValue([]),
    diagnostics: vi.fn().mockResolvedValue({}),
    definition: vi.fn().mockResolvedValue([]),
    references: vi.fn().mockResolvedValue([]),
  } as unknown as LSPManager;
}

describe('FileDiagnosticsInputSchema', () => {
  it('should validate valid input', () => {
    const input = { file: 'test.ts' };
    const result = FileDiagnosticsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject empty file path', () => {
    const input = { file: '' };
    const result = FileDiagnosticsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should default waitForDiagnostics to true', () => {
    const input = { file: 'test.ts' };
    const result = FileDiagnosticsInputSchema.parse(input);
    expect(result.waitForDiagnostics).toBe(true);
  });
});

describe('ProjectDiagnosticsInputSchema', () => {
  it('should validate empty input', () => {
    const result = ProjectDiagnosticsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate with files array', () => {
    const input = { files: ['a.ts', 'b.ts'] };
    const result = ProjectDiagnosticsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate minSeverity within range', () => {
    expect(
      ProjectDiagnosticsInputSchema.safeParse({ minSeverity: 1 }).success,
    ).toBe(true);
    expect(
      ProjectDiagnosticsInputSchema.safeParse({ minSeverity: 4 }).success,
    ).toBe(true);
    expect(
      ProjectDiagnosticsInputSchema.safeParse({ minSeverity: 0 }).success,
    ).toBe(false);
    expect(
      ProjectDiagnosticsInputSchema.safeParse({ minSeverity: 5 }).success,
    ).toBe(false);
  });
});

describe('LSPDiagnosticsTool', () => {
  let mockManager: LSPManager;
  let tool: LSPDiagnosticsTool;

  beforeEach(() => {
    mockManager = createMockLSPManager();
    tool = createLSPDiagnosticsTool(mockManager);
  });

  describe('getFileDiagnostics', () => {
    it('should return empty diagnostics for clean file', async () => {
      const result = await tool.getFileDiagnostics({ file: 'test.ts' });
      expect(result.file).toBe('test.ts');
      expect(result.diagnostics).toHaveLength(0);
      expect(result.errorCount).toBe(0);
    });

    it('should count diagnostics by severity', async () => {
      vi.mocked(mockManager.diagnosticsForFile).mockResolvedValue([
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          message: 'Error',
          severity: 1,
        },
        {
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 5 },
          },
          message: 'Warning',
          severity: 2,
        },
        {
          range: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 5 },
          },
          message: 'Info',
          severity: 3,
        },
      ]);

      const result = await tool.getFileDiagnostics({ file: 'test.ts' });
      expect(result.errorCount).toBe(1);
      expect(result.warningCount).toBe(1);
      expect(result.infoCount).toBe(1);
      expect(result.hintCount).toBe(0);
    });

    it('should touch file with waitForDiagnostics option', async () => {
      await tool.getFileDiagnostics({
        file: 'test.ts',
        waitForDiagnostics: false,
      });
      expect(mockManager.touchFile).toHaveBeenCalledWith('test.ts', {
        waitForDiagnostics: false,
      });
    });
  });

  describe('getProjectDiagnostics', () => {
    it('should return empty result for clean project', async () => {
      const result = await tool.getProjectDiagnostics();
      expect(result.totalErrors).toBe(0);
      expect(result.totalFiles).toBe(0);
    });

    it('should aggregate diagnostics from multiple files', async () => {
      vi.mocked(mockManager.diagnostics).mockResolvedValue({
        'a.ts': [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            message: 'Error',
            severity: 1,
          },
        ],
        'b.ts': [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            message: 'Warning',
            severity: 2,
          },
        ],
      });

      const result = await tool.getProjectDiagnostics();
      expect(result.totalFiles).toBe(2);
      expect(result.totalErrors).toBe(1);
      expect(result.totalWarnings).toBe(1);
      expect(result.filesWithErrors).toBe(1);
    });
  });

  describe('formatDiagnosticsOutput', () => {
    it('should format file diagnostics', () => {
      const result = tool.formatDiagnosticsOutput({
        file: 'test.ts',
        diagnostics: [
          {
            file: 'test.ts',
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 5,
            severity: 'error',
            message: 'Test error',
          },
        ],
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        hintCount: 0,
      });

      expect(result).toContain('test.ts:1:1: ERROR: Test error');
      expect(result).toContain('1 errors');
    });
  });
});

describe('DefinitionInputSchema', () => {
  it('should validate valid input', () => {
    const input = { file: 'test.ts', line: 1, column: 1 };
    const result = DefinitionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject line less than 1', () => {
    const input = { file: 'test.ts', line: 0, column: 1 };
    const result = DefinitionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject column less than 1', () => {
    const input = { file: 'test.ts', line: 1, column: 0 };
    const result = DefinitionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('LSPDefinitionsTool', () => {
  let mockManager: LSPManager;
  let tool: LSPDefinitionsTool;

  beforeEach(() => {
    mockManager = createMockLSPManager();
    tool = createLSPDefinitionsTool(mockManager, '/workspace');
  });

  describe('findDefinition', () => {
    it('should return not found for no definitions', async () => {
      const result = await tool.findDefinition({
        file: 'test.ts',
        line: 1,
        column: 1,
      });
      expect(result.found).toBe(false);
      expect(result.definitions).toHaveLength(0);
    });

    it('should return definition locations', async () => {
      vi.mocked(mockManager.definition).mockResolvedValue([
        {
          uri: 'file:///workspace/other.ts',
          range: {
            start: { line: 10, character: 5 },
            end: { line: 10, character: 15 },
          },
        },
      ]);

      const result = await tool.findDefinition({
        file: 'test.ts',
        line: 1,
        column: 1,
      });
      expect(result.found).toBe(true);
      expect(result.definitions).toHaveLength(1);
      expect(result.definitions[0].line).toBe(11); // 1-indexed
      expect(result.definitions[0].column).toBe(6); // 1-indexed
    });

    it('should convert to 0-indexed for LSP call', async () => {
      await tool.findDefinition({ file: 'test.ts', line: 5, column: 10 });
      expect(mockManager.definition).toHaveBeenCalledWith(
        expect.objectContaining({ line: 4, character: 9 }),
      );
    });
  });

  describe('formatDefinitionOutput', () => {
    it('should format no definition found', () => {
      const result = tool.formatDefinitionOutput({
        symbol: { file: 'test.ts', line: 1, column: 1 },
        definitions: [],
        found: false,
      });
      expect(result).toContain('No definition found');
    });

    it('should format single definition', () => {
      const result = tool.formatDefinitionOutput({
        symbol: { file: 'test.ts', line: 1, column: 1 },
        definitions: [
          { file: 'other.ts', line: 10, column: 5, endLine: 10, endColumn: 15 },
        ],
        found: true,
      });
      expect(result).toContain('Defined at: other.ts:10:5');
    });
  });
});

describe('ReferencesInputSchema', () => {
  it('should validate valid input', () => {
    const input = { file: 'test.ts', line: 1, column: 1 };
    const result = ReferencesInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should default includeDeclaration to true', () => {
    const input = { file: 'test.ts', line: 1, column: 1 };
    const result = ReferencesInputSchema.parse(input);
    expect(result.includeDeclaration).toBe(true);
  });
});

describe('LSPReferencesTool', () => {
  let mockManager: LSPManager;
  let tool: LSPReferencesTool;

  beforeEach(() => {
    mockManager = createMockLSPManager();
    tool = createLSPReferencesTool(mockManager, '/workspace');
  });

  describe('findReferences', () => {
    it('should return empty for no references', async () => {
      const result = await tool.findReferences({
        file: 'test.ts',
        line: 1,
        column: 1,
      });
      expect(result.totalReferences).toBe(0);
      expect(result.uniqueFiles).toBe(0);
    });

    it('should return reference locations', async () => {
      vi.mocked(mockManager.references).mockResolvedValue([
        {
          uri: 'file:///workspace/a.ts',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 10 },
          },
        },
        {
          uri: 'file:///workspace/b.ts',
          range: {
            start: { line: 10, character: 0 },
            end: { line: 10, character: 10 },
          },
        },
      ]);

      const result = await tool.findReferences({
        file: 'test.ts',
        line: 1,
        column: 1,
      });
      expect(result.totalReferences).toBe(2);
      expect(result.uniqueFiles).toBe(2);
    });

    it('should sort references by file, line, column', async () => {
      vi.mocked(mockManager.references).mockResolvedValue([
        {
          uri: 'file:///workspace/b.ts',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 10 },
          },
        },
        {
          uri: 'file:///workspace/a.ts',
          range: {
            start: { line: 10, character: 0 },
            end: { line: 10, character: 10 },
          },
        },
      ]);

      const result = await tool.findReferences({
        file: 'test.ts',
        line: 1,
        column: 1,
      });
      expect(result.references[0].file).toBe('a.ts');
      expect(result.references[1].file).toBe('b.ts');
    });
  });

  describe('formatReferencesOutput', () => {
    it('should format no references found', () => {
      const result = tool.formatReferencesOutput({
        symbol: { file: 'test.ts', line: 1, column: 1 },
        references: [],
        totalReferences: 0,
        uniqueFiles: 0,
      });
      expect(result).toContain('No references found');
    });

    it('should format multiple references', () => {
      const result = tool.formatReferencesOutput({
        symbol: { file: 'test.ts', line: 1, column: 1 },
        references: [
          { file: 'a.ts', line: 5, column: 1, endLine: 5, endColumn: 10 },
          { file: 'b.ts', line: 10, column: 1, endLine: 10, endColumn: 10 },
        ],
        totalReferences: 2,
        uniqueFiles: 2,
      });
      expect(result).toContain('a.ts:5:1');
      expect(result).toContain('b.ts:10:1');
      expect(result).toContain('2 references in 2 files');
    });
  });
});
