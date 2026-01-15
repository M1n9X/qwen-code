/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ASTService } from './service.js';
import { SymbolKind } from './types.js';

describe('ASTService', () => {
  let service: ASTService;

  beforeEach(async () => {
    service = new ASTService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('detectLanguage', () => {
    it('should detect TypeScript', () => {
      expect(service.detectLanguage('file.ts')).toBe('typescript');
      expect(service.detectLanguage('file.tsx')).toBe('typescript');
    });

    it('should detect JavaScript', () => {
      expect(service.detectLanguage('file.js')).toBe('javascript');
      expect(service.detectLanguage('file.jsx')).toBe('javascript');
    });

    it('should detect Python', () => {
      expect(service.detectLanguage('file.py')).toBe('python');
    });

    it('should return null for unknown extensions', () => {
      expect(service.detectLanguage('file.unknown')).toBeNull();
    });
  });

  describe('extractSymbols', () => {
    it('should extract TypeScript functions', () => {
      const source = `
function hello() {}
async function asyncHello() {}
export function exportedHello() {}
`;
      const symbols = service.extractSymbols(source, 'typescript');

      expect(symbols.length).toBeGreaterThanOrEqual(3);
      expect(symbols.some((s) => s.name === 'hello')).toBe(true);
      expect(symbols.some((s) => s.name === 'asyncHello')).toBe(true);
      expect(
        symbols.some((s) => s.name === 'exportedHello' && s.exported),
      ).toBe(true);
    });

    it('should extract TypeScript classes', () => {
      const source = `
class MyClass {}
export class ExportedClass {}
`;
      const symbols = service.extractSymbols(source, 'typescript');

      expect(
        symbols.some(
          (s) => s.name === 'MyClass' && s.kind === SymbolKind.Class,
        ),
      ).toBe(true);
      expect(
        symbols.some((s) => s.name === 'ExportedClass' && s.exported),
      ).toBe(true);
    });

    it('should extract TypeScript interfaces', () => {
      const source = `
interface MyInterface {}
export interface ExportedInterface {}
`;
      const symbols = service.extractSymbols(source, 'typescript');

      expect(
        symbols.some(
          (s) => s.name === 'MyInterface' && s.kind === SymbolKind.Interface,
        ),
      ).toBe(true);
    });

    it('should extract Python functions and classes', () => {
      const source = `
def hello():
    pass

class MyClass:
    pass
`;
      const symbols = service.extractSymbols(source, 'python');

      expect(
        symbols.some(
          (s) => s.name === 'hello' && s.kind === SymbolKind.Function,
        ),
      ).toBe(true);
      expect(
        symbols.some(
          (s) => s.name === 'MyClass' && s.kind === SymbolKind.Class,
        ),
      ).toBe(true);
    });

    it('should extract Go functions and types', () => {
      const source = `
func hello() {}
type MyStruct struct {}
type MyInterface interface {}
`;
      const symbols = service.extractSymbols(source, 'go');

      expect(symbols.some((s) => s.name === 'hello')).toBe(true);
      expect(symbols.some((s) => s.name === 'MyStruct')).toBe(true);
      expect(symbols.some((s) => s.name === 'MyInterface')).toBe(true);
    });
  });

  describe('findSymbol', () => {
    it('should find symbol by name', async () => {
      const source = `
function targetFunction() {}
function otherFunction() {}
`;
      const symbol = await service.findSymbol(
        source,
        'typescript',
        'targetFunction',
      );

      expect(symbol).not.toBeNull();
      expect(symbol?.name).toBe('targetFunction');
    });

    it('should return null for non-existent symbol', async () => {
      const source = `function hello() {}`;
      const symbol = await service.findSymbol(
        source,
        'typescript',
        'nonexistent',
      );

      expect(symbol).toBeNull();
    });
  });

  describe('getSymbolsByKind', () => {
    it('should filter symbols by kind', async () => {
      const source = `
function myFunc() {}
class MyClass {}
interface MyInterface {}
`;
      const functions = await service.getSymbolsByKind(
        source,
        'typescript',
        SymbolKind.Function,
      );
      const classes = await service.getSymbolsByKind(
        source,
        'typescript',
        SymbolKind.Class,
      );

      expect(functions.every((s) => s.kind === SymbolKind.Function)).toBe(true);
      expect(classes.every((s) => s.kind === SymbolKind.Class)).toBe(true);
    });
  });

  describe('applyModifications', () => {
    it('should apply single modification', () => {
      const source = 'const x = 1;';
      const result = service.applyModifications(source, [
        {
          range: {
            start: { line: 1, column: 11 },
            end: { line: 1, column: 12 },
          },
          newText: '42',
        },
      ]);

      expect(result).toBe('const x = 42;');
    });

    it('should apply multiple modifications in reverse order', () => {
      const source = 'const a = 1;\nconst b = 2;';
      const result = service.applyModifications(source, [
        {
          range: {
            start: { line: 1, column: 11 },
            end: { line: 1, column: 12 },
          },
          newText: '10',
        },
        {
          range: {
            start: { line: 2, column: 11 },
            end: { line: 2, column: 12 },
          },
          newText: '20',
        },
      ]);

      expect(result).toBe('const a = 10;\nconst b = 20;');
    });
  });

  describe('validateSyntax', () => {
    it('should detect unbalanced brackets', async () => {
      const source = 'function test() { if (true) { }';
      const errors = await service.validateSyntax(source, 'typescript');

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should pass valid syntax', async () => {
      const source = 'function test() { if (true) { } }';
      const errors = await service.validateSyntax(source, 'typescript');

      expect(errors.length).toBe(0);
    });
  });

  describe('caching', () => {
    it('should cache parse results', async () => {
      const source = 'function hello() {}';

      const result1 = await service.parse(source, 'typescript');
      const result2 = await service.parse(source, 'typescript');

      // Results should be identical (from cache)
      expect(result1.symbols).toEqual(result2.symbols);
    });
  });
});
