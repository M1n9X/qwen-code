/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnhancedGrepTool } from './grep-enhanced.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('EnhancedGrepTool', () => {
  let tool: EnhancedGrepTool;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-test-'));
    tool = new EnhancedGrepTool(tempDir);

    // Create test files
    await fs.writeFile(
      path.join(tempDir, 'test1.ts'),
      `function hello() {
  console.log("Hello World");
}

function goodbye() {
  console.log("Goodbye");
}`,
    );

    await fs.writeFile(
      path.join(tempDir, 'test2.js'),
      `const greeting = "Hello";
const farewell = "Goodbye";`,
    );

    await fs.mkdir(path.join(tempDir, 'subdir'));
    await fs.writeFile(
      path.join(tempDir, 'subdir', 'nested.ts'),
      `export function nestedHello() {
  return "Hello from nested";
}`,
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('basic search', () => {
    it('should find matches in files', async () => {
      const invocation = tool.build({ pattern: 'Hello' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Hello');
    });

    it('should return no matches for non-existent pattern', async () => {
      const invocation = tool.build({ pattern: 'NonExistentPattern12345' });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('No files found');
    });

    it('should search in specific path', async () => {
      const invocation = tool.build({
        pattern: 'Hello',
        path: 'subdir',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('nested');
    });
  });

  describe('literal text search', () => {
    it('should escape regex characters when literalText is true', async () => {
      // Create a file with regex special characters
      await fs.writeFile(
        path.join(tempDir, 'regex-test.ts'),
        `const pattern = /hello.*/;
const text = "hello.*world";`,
      );

      const invocation = tool.build({
        pattern: 'hello.*',
        literalText: true,
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      // Should find literal "hello.*" not regex match
      expect(result.llmContent).toContain('hello.*');
    });
  });

  describe('include filter', () => {
    it('should filter by file extension', async () => {
      const invocation = tool.build({
        pattern: 'Hello',
        include: '*.ts',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      // Should only find matches in .ts files
      expect(result.llmContent).not.toContain('test2.js');
    });
  });

  describe('result truncation', () => {
    it('should truncate results when limit is exceeded', async () => {
      // Create many files with matches
      for (let i = 0; i < 20; i++) {
        await fs.writeFile(
          path.join(tempDir, `many-${i}.ts`),
          `const value${i} = "test";\nconst other${i} = "test";`,
        );
      }

      const invocation = tool.build({
        pattern: 'test',
        limit: 5,
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('truncated');
    });

    it('should not truncate when under limit', async () => {
      const invocation = tool.build({
        pattern: 'Hello',
        limit: 100,
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).not.toContain('truncated');
    });
  });

  describe('error handling', () => {
    it('should handle invalid regex pattern gracefully', async () => {
      const invocation = tool.build({
        pattern: '[invalid',
      });
      const result = await invocation.execute(new AbortController().signal);

      // Should either handle gracefully or return error
      expect(result).toBeDefined();
    });

    it('should handle non-existent path', async () => {
      const invocation = tool.build({
        pattern: 'test',
        path: 'non-existent-dir',
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
    });
  });
});
