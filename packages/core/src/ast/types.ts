/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported programming languages for AST parsing
 */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'c'
  | 'cpp'
  | 'ruby'
  | 'php';

/**
 * Symbol kind enumeration
 */
export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Method = 'method',
  Variable = 'variable',
  Constant = 'constant',
  Interface = 'interface',
  Type = 'type',
  Enum = 'enum',
  Property = 'property',
  Import = 'import',
  Export = 'export',
}

/**
 * Position in source code
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Range in source code
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Extracted symbol from AST
 */
export interface Symbol {
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** Source range */
  range: Range;
  /** Parent symbol name (for nested symbols) */
  parent?: string;
  /** Symbol documentation/comment */
  documentation?: string;
  /** Symbol signature (for functions/methods) */
  signature?: string;
  /** Whether symbol is exported */
  exported?: boolean;
}

/**
 * AST node representation
 */
export interface ASTNode {
  /** Node type */
  type: string;
  /** Node text content */
  text: string;
  /** Source range */
  range: Range;
  /** Child nodes */
  children: ASTNode[];
}

/**
 * Code modification operation
 */
export interface CodeModification {
  /** Range to replace */
  range: Range;
  /** New text to insert */
  newText: string;
}

/**
 * AST parse result
 */
export interface ParseResult {
  /** Root AST node */
  root: ASTNode;
  /** Extracted symbols */
  symbols: Symbol[];
  /** Parse errors */
  errors: string[];
  /** Source language */
  language: SupportedLanguage;
}

/**
 * AST service configuration
 */
export interface ASTServiceConfig {
  /** Path to WASM files */
  wasmPath?: string;
  /** Languages to preload */
  preloadLanguages?: SupportedLanguage[];
  /** Enable caching */
  enableCache?: boolean;
  /** Maximum cache size */
  maxCacheSize?: number;
}

/**
 * File extension to language mapping
 */
export const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
};
