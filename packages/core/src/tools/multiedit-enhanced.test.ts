/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EnhancedMultiEditTool } from './multiedit-enhanced.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('EnhancedMultiEditTool', () => {
  let tool: EnhancedMultiEditTool;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'multiedit-test-'));
    tool = new EnhancedMultiEditTool(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('basic editing', () => {
    it('should apply single edit', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      await fs.writeFile(filePath, 'const hello = "world";');

      const invocation = tool.build({
        filePath: 'test.ts',
        edits: [{ oldString: 'world', newString: 'universe' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('const hello = "universe";');
    });

    it('should apply multiple edits sequentially', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      await fs.writeFile(filePath, 'const a = 1;\nconst b = 2;');

      const invocation = tool.build({
        filePath: 'test.ts',
        edits: [
          { oldString: 'const a = 1;', newString: 'const a = 10;' },
          { oldString: 'const b = 2;', newString: 'const b = 20;' },
        ],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('const a = 10;\nconst b = 20;');
      expect(result.llmContent).toContain('2 edits');
    });
  });

  describe('replaceAll option', () => {
    it('should replace all occurrences when replaceAll is true', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      await fs.writeFile(filePath, 'foo bar foo baz foo');

      const invocation = tool.build({
        filePath: 'test.ts',
        edits: [{ oldString: 'foo', newString: 'qux', replaceAll: true }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('qux bar qux baz qux');
    });

    it('should fail when multiple occurrences and replaceAll is false', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      await fs.writeFile(filePath, 'foo bar foo');

      const invocation = tool.build({
        filePath: 'test.ts',
        edits: [{ oldString: 'foo', newString: 'qux' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toContain('multiple times');
    });
  });

  describe('file creation', () => {
    it('should create new file when first edit has empty oldString', async () => {
      const invocation = tool.build({
        filePath: 'new-file.ts',
        edits: [{ oldString: '', newString: 'const x = 1;' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      const content = await fs.readFile(
        path.join(tempDir, 'new-file.ts'),
        'utf-8',
      );
      expect(content).toBe('const x = 1;');
    });

    it('should fail if file already exists', async () => {
      const filePath = path.join(tempDir, 'existing.ts');
      await fs.writeFile(filePath, 'existing content');

      const invocation = tool.build({
        filePath: 'existing.ts',
        edits: [{ oldString: '', newString: 'new content' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('already exists');
    });
  });

  describe('partial success', () => {
    it('should continue on individual edit failures', async () => {
      const filePath = path.join(tempDir, 'test.ts');
      await fs.writeFile(filePath, 'const a = 1;\nconst b = 2;');

      const invocation = tool.build({
        filePath: 'test.ts',
        edits: [
          { oldString: 'const a = 1;', newString: 'const a = 10;' },
          { oldString: 'nonexistent', newString: 'replacement' },
          { oldString: 'const b = 2;', newString: 'const b = 20;' },
        ],
      });
      const result = await invocation.execute(new AbortController().signal);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('const a = 10;\nconst b = 20;');
      expect(result.llmContent).toContain('2 of 3');
      expect(result.llmContent).toContain('failed');
    });
  });

  describe('line ending preservation', () => {
    it('should preserve CRLF line endings', async () => {
      const filePath = path.join(tempDir, 'crlf.ts');
      await fs.writeFile(filePath, 'line1\r\nline2\r\nline3');

      const invocation = tool.build({
        filePath: 'crlf.ts',
        edits: [{ oldString: 'line2', newString: 'modified' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('line1\r\nmodified\r\nline3');
    });
  });

  describe('error handling', () => {
    it('should handle non-existent file', async () => {
      const invocation = tool.build({
        filePath: 'nonexistent.ts',
        edits: [{ oldString: 'foo', newString: 'bar' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('not found');
    });

    it('should handle directory path', async () => {
      await fs.mkdir(path.join(tempDir, 'subdir'));

      const invocation = tool.build({
        filePath: 'subdir',
        edits: [{ oldString: 'foo', newString: 'bar' }],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('directory');
    });

    it('should reject empty edits array', async () => {
      const invocation = tool.build({
        filePath: 'test.ts',
        edits: [],
      });
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
    });
  });
});
