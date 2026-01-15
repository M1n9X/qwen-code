/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import {
  type SupportedLanguage,
  type Symbol,
  SymbolKind,
  type ASTNode,
  type ParseResult,
  type CodeModification,
  type ASTServiceConfig,
  type Range,
  type Position,
  EXTENSION_TO_LANGUAGE,
} from './types.js';

/**
 * Simple regex-based symbol extraction for when Tree-sitter is not available
 * This provides basic functionality without WASM dependencies
 */
const SYMBOL_PATTERNS: Record<SupportedLanguage, RegExp[]> = {
  typescript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)/g,
    /(?:export\s+)?enum\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)/g,
    /(?:export\s+)?let\s+(\w+)/g,
  ],
  javascript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)/g,
    /(?:export\s+)?let\s+(\w+)/g,
  ],
  python: [/^def\s+(\w+)/gm, /^class\s+(\w+)/gm, /^(\w+)\s*=/gm],
  go: [
    /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm,
    /^type\s+(\w+)\s+struct/gm,
    /^type\s+(\w+)\s+interface/gm,
    /^var\s+(\w+)/gm,
    /^const\s+(\w+)/gm,
  ],
  rust: [
    /^(?:pub\s+)?fn\s+(\w+)/gm,
    /^(?:pub\s+)?struct\s+(\w+)/gm,
    /^(?:pub\s+)?enum\s+(\w+)/gm,
    /^(?:pub\s+)?trait\s+(\w+)/gm,
    /^(?:pub\s+)?const\s+(\w+)/gm,
  ],
  java: [
    /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/g,
    /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\(/g,
    /interface\s+(\w+)/g,
    /enum\s+(\w+)/g,
  ],
  c: [
    /^\w+\s+(\w+)\s*\([^)]*\)\s*\{/gm,
    /^struct\s+(\w+)/gm,
    /^typedef\s+.*\s+(\w+);/gm,
    /^#define\s+(\w+)/gm,
  ],
  cpp: [
    /^\w+\s+(\w+)\s*\([^)]*\)\s*\{/gm,
    /^class\s+(\w+)/gm,
    /^struct\s+(\w+)/gm,
    /^namespace\s+(\w+)/gm,
    /^template\s*<[^>]*>\s*class\s+(\w+)/gm,
  ],
  ruby: [/^def\s+(\w+)/gm, /^class\s+(\w+)/gm, /^module\s+(\w+)/gm],
  php: [
    /function\s+(\w+)/g,
    /class\s+(\w+)/g,
    /interface\s+(\w+)/g,
    /trait\s+(\w+)/g,
  ],
};

/**
 * Infer symbol kind from pattern match context
 */
function inferSymbolKind(
  pattern: RegExp,
  _language: SupportedLanguage,
): SymbolKind {
  const patternStr = pattern.source;

  if (
    patternStr.includes('function') ||
    patternStr.includes('def') ||
    patternStr.includes('fn')
  ) {
    return SymbolKind.Function;
  }
  if (patternStr.includes('class')) {
    return SymbolKind.Class;
  }
  if (patternStr.includes('interface') || patternStr.includes('trait')) {
    return SymbolKind.Interface;
  }
  if (patternStr.includes('type') || patternStr.includes('typedef')) {
    return SymbolKind.Type;
  }
  if (patternStr.includes('enum')) {
    return SymbolKind.Enum;
  }
  if (patternStr.includes('const') || patternStr.includes('define')) {
    return SymbolKind.Constant;
  }
  if (patternStr.includes('struct')) {
    return SymbolKind.Class;
  }

  return SymbolKind.Variable;
}

/**
 * Get position from offset in source code
 */
function offsetToPosition(source: string, offset: number): Position {
  const lines = source.slice(0, offset).split('\n');
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

/**
 * AST Service for code analysis and modification
 * Uses regex-based extraction with optional Tree-sitter WASM support
 */
export class ASTService {
  private config: Required<ASTServiceConfig>;
  private cache: Map<string, ParseResult> = new Map();
  private initialized = false;

  constructor(config: ASTServiceConfig = {}) {
    this.config = {
      wasmPath: config.wasmPath ?? './tree-sitter-wasm',
      preloadLanguages: config.preloadLanguages ?? [],
      enableCache: config.enableCache ?? true,
      maxCacheSize: config.maxCacheSize ?? 100,
    };
  }

  /**
   * Initialize the AST service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // For now, we use regex-based extraction
    // Tree-sitter WASM integration can be added later
    this.initialized = true;
  }

  /**
   * Detect language from file extension
   */
  detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] ?? null;
  }

  /**
   * Parse source code and extract symbols
   */
  async parse(
    source: string,
    language: SupportedLanguage,
  ): Promise<ParseResult> {
    // Check cache
    const cacheKey = `${language}:${this.hashSource(source)}`;
    if (this.config.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const symbols = this.extractSymbols(source, language);
    const root = this.buildSimpleAST(source);

    const result: ParseResult = {
      root,
      symbols,
      errors: [],
      language,
    };

    // Update cache
    if (this.config.enableCache) {
      this.updateCache(cacheKey, result);
    }

    return result;
  }

  /**
   * Extract symbols from source code using regex patterns
   */
  extractSymbols(source: string, language: SupportedLanguage): Symbol[] {
    const patterns = SYMBOL_PATTERNS[language];
    if (!patterns) return [];

    const symbols: Symbol[] = [];

    for (const pattern of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(source)) !== null) {
        const name = match[1];
        if (!name) continue;

        const startPos = offsetToPosition(source, match.index);
        const endPos = offsetToPosition(source, match.index + match[0].length);

        symbols.push({
          name,
          kind: inferSymbolKind(pattern, language),
          range: {
            start: startPos,
            end: endPos,
          },
          exported: match[0].includes('export') || match[0].includes('pub'),
        });
      }
    }

    // Sort by position
    symbols.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      return a.range.start.column - b.range.start.column;
    });

    return symbols;
  }

  /**
   * Find symbol by name
   */
  async findSymbol(
    source: string,
    language: SupportedLanguage,
    symbolName: string,
  ): Promise<Symbol | null> {
    const result = await this.parse(source, language);
    return result.symbols.find((s) => s.name === symbolName) ?? null;
  }

  /**
   * Get symbols of a specific kind
   */
  async getSymbolsByKind(
    source: string,
    language: SupportedLanguage,
    kind: SymbolKind,
  ): Promise<Symbol[]> {
    const result = await this.parse(source, language);
    return result.symbols.filter((s) => s.kind === kind);
  }

  /**
   * Apply code modifications
   */
  applyModifications(
    source: string,
    modifications: CodeModification[],
  ): string {
    // Sort modifications by position (reverse order to preserve offsets)
    const sorted = [...modifications].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.column - a.range.start.column;
    });

    const lines = source.split('\n');
    let result = source;

    for (const mod of sorted) {
      const startOffset = this.positionToOffset(lines, mod.range.start);
      const endOffset = this.positionToOffset(lines, mod.range.end);

      result =
        result.slice(0, startOffset) + mod.newText + result.slice(endOffset);
    }

    return result;
  }

  /**
   * Validate syntax after modification
   */
  async validateSyntax(
    source: string,
    _language: SupportedLanguage,
  ): Promise<string[]> {
    // Basic validation - check for common syntax errors
    const errors: string[] = [];

    // Check balanced brackets
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char in brackets) {
        stack.push(brackets[char]);
      } else if (Object.values(brackets).includes(char)) {
        if (stack.length === 0 || stack.pop() !== char) {
          const pos = offsetToPosition(source, i);
          errors.push(
            `Unbalanced bracket '${char}' at line ${pos.line}, column ${pos.column}`,
          );
        }
      }
    }

    if (stack.length > 0) {
      errors.push(`Unclosed brackets: expected ${stack.join(', ')}`);
    }

    return errors;
  }

  /**
   * Get code at range
   */
  getCodeAtRange(source: string, range: Range): string {
    const lines = source.split('\n');
    const startOffset = this.positionToOffset(lines, range.start);
    const endOffset = this.positionToOffset(lines, range.end);
    return source.slice(startOffset, endOffset);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.cache.clear();
    this.initialized = false;
  }

  // Private helper methods

  private buildSimpleAST(source: string): ASTNode {
    const lines = source.split('\n');
    return {
      type: 'root',
      text: source,
      range: {
        start: { line: 1, column: 1 },
        end: {
          line: lines.length,
          column: (lines[lines.length - 1]?.length ?? 0) + 1,
        },
      },
      children: [],
    };
  }

  private positionToOffset(lines: string[], position: Position): number {
    let offset = 0;
    for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += Math.min(
      position.column - 1,
      lines[position.line - 1]?.length ?? 0,
    );
    return offset;
  }

  private hashSource(source: string): string {
    // Simple hash for caching
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
      const char = source.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private updateCache(key: string, result: ParseResult): void {
    if (this.cache.size >= this.config.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
  }
}
