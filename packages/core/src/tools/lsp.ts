/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Tool for Language Server Protocol operations.
 *
 * This tool provides access to LSP features like go-to-definition,
 * find-references, hover, and diagnostics.
 *
 * @module tools/lsp
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { file as bunFile } from '../runtime/bun-adapter.js';
import { LSPManager, formatDiagnostic } from '../lsp/index.js';

/**
 * Supported LSP operations.
 */
const LSP_OPERATIONS = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'diagnostics',
] as const;

type LspOperation = (typeof LSP_OPERATIONS)[number];

/**
 * Parameters for LSP tool invocation.
 */
interface LspToolParams {
  /** The LSP operation to perform */
  operation: LspOperation;
  /** The absolute or relative path to the file */
  filePath: string;
  /** The line number (1-based, as shown in editors). Required for position-based operations. */
  line?: number;
  /** The character offset (1-based, as shown in editors). Required for position-based operations. */
  character?: number;
  /** Query string for workspaceSymbol operation */
  query?: string;
}

/**
 * JSON schema for LSP tool parameters.
 */
const LSP_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: LSP_OPERATIONS,
      description: 'The LSP operation to perform',
    },
    filePath: {
      type: 'string',
      description: 'The absolute or relative path to the file',
    },
    line: {
      type: 'integer',
      minimum: 1,
      description:
        'The line number (1-based). Required for goToDefinition, findReferences, hover.',
    },
    character: {
      type: 'integer',
      minimum: 1,
      description:
        'The character offset (1-based). Required for goToDefinition, findReferences, hover.',
    },
    query: {
      type: 'string',
      description: 'Query string for workspaceSymbol operation',
    },
  },
  required: ['operation', 'filePath'],
  additionalProperties: false,
};

/**
 * LSP Tool description for the LLM.
 */
const LSP_TOOL_DESCRIPTION = `Perform Language Server Protocol operations on source files.

**Available operations:**
- \`goToDefinition\`: Find the definition of a symbol at the cursor position
- \`findReferences\`: Find all references to a symbol at the cursor position
- \`hover\`: Get hover information (type info, documentation) for a symbol
- \`documentSymbol\`: List all symbols in a document (classes, functions, etc.)
- \`workspaceSymbol\`: Search for symbols across the workspace
- \`diagnostics\`: Get compilation errors and warnings for a file

**Position-based operations** (goToDefinition, findReferences, hover) require \`line\` and \`character\` parameters (1-based).

**Usage examples:**
- Go to definition: \`{"operation": "goToDefinition", "filePath": "src/index.ts", "line": 10, "character": 15}\`
- Find references: \`{"operation": "findReferences", "filePath": "src/utils.ts", "line": 25, "character": 8}\`
- Get diagnostics: \`{"operation": "diagnostics", "filePath": "src/app.ts"}\`
- List symbols: \`{"operation": "documentSymbol", "filePath": "src/types.ts"}\`

Note: LSP servers must be available for the file type. The tool will spawn servers as needed.`;

/**
 * LSP Tool invocation.
 */
class LspToolInvocation extends BaseToolInvocation<LspToolParams, ToolResult> {
  private lspManager: LSPManager;
  private workingDirectory: string;

  constructor(params: LspToolParams, workingDirectory: string = process.cwd()) {
    super(params);
    this.workingDirectory = workingDirectory;
    this.lspManager = new LSPManager(workingDirectory);
  }

  getDescription(): string {
    const { operation, filePath, line, character } = this.params;
    const relPath = path.relative(this.workingDirectory, filePath);

    if (line && character) {
      return `${operation} at ${relPath}:${line}:${character}`;
    }
    return `${operation} on ${relPath}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { operation, filePath, line, character, query } = this.params;

    // Resolve file path
    const file = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.workingDirectory, filePath);

    // Check if file exists
    const exists = await bunFile(file).exists();
    if (!exists) {
      return {
        llmContent: `Error: File not found: ${file}`,
        returnDisplay: `File not found: ${file}`,
        error: { message: `File not found: ${file}` },
      };
    }

    // Initialize LSP manager
    await this.lspManager.initialize();

    // Check if LSP is available for this file
    const available = await this.lspManager.hasClients(file);
    if (!available) {
      return {
        llmContent: 'Error: No LSP server available for this file type.',
        returnDisplay: 'No LSP server available for this file type.',
        error: { message: 'No LSP server available for this file type.' },
      };
    }

    // Touch file to ensure diagnostics are up-to-date
    await this.lspManager.touchFile(file, { waitForDiagnostics: true });

    const uri = pathToFileURL(file).href;
    const position = {
      file,
      line: (line ?? 1) - 1, // Convert to 0-based
      character: (character ?? 1) - 1, // Convert to 0-based
    };

    let result: unknown;

    try {
      switch (operation) {
        case 'goToDefinition':
          result = await this.lspManager.definition(position);
          break;
        case 'findReferences':
          result = await this.lspManager.references(position);
          break;
        case 'hover':
          result = await this.lspManager.hover(position);
          break;
        case 'documentSymbol':
          result = await this.lspManager.documentSymbol(uri);
          break;
        case 'workspaceSymbol':
          result = await this.lspManager.workspaceSymbol(query ?? '');
          break;
        case 'diagnostics':
          result = await this.lspManager.diagnosticsForFile(file);
          break;
        default:
          // This should never happen due to type checking
          result = null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: LSP operation failed: ${errorMsg}`,
        returnDisplay: `LSP operation failed: ${errorMsg}`,
        error: { message: errorMsg },
      };
    }

    // Format output
    const output = this.formatResult(operation, result);

    return {
      llmContent: output,
      returnDisplay: output,
    };
  }

  private formatResult(operation: LspOperation, result: unknown): string {
    if (!result || (Array.isArray(result) && result.length === 0)) {
      return `No results found for ${operation}`;
    }

    if (operation === 'diagnostics' && Array.isArray(result)) {
      return result.map((d) => formatDiagnostic(d)).join('\n');
    }

    return JSON.stringify(result, null, 2);
  }
}

/**
 * LSP Tool definition.
 */
export class LspTool extends BaseDeclarativeTool<LspToolParams, ToolResult> {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    super(
      'lsp',
      'LSP',
      LSP_TOOL_DESCRIPTION,
      Kind.Read,
      LSP_TOOL_SCHEMA,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
    this.workingDirectory = workingDirectory;
  }

  protected override validateToolParamValues(
    params: LspToolParams,
  ): string | null {
    const positionOperations = ['goToDefinition', 'findReferences', 'hover'];

    if (positionOperations.includes(params.operation)) {
      if (params.line === undefined || params.character === undefined) {
        return `Operation '${params.operation}' requires 'line' and 'character' parameters`;
      }
    }

    return null;
  }

  protected createInvocation(params: LspToolParams): LspToolInvocation {
    return new LspToolInvocation(params, this.workingDirectory);
  }
}

/**
 * Create an LSP tool instance.
 */
export function createLspTool(workingDirectory?: string): LspTool {
  return new LspTool(workingDirectory);
}
