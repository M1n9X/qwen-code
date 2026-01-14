/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { file, write, spawn, readableStreamToText } from './bun-adapter.js';

describe('bun-adapter', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'bun-adapter-test-'),
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fsPromises.rm(testDir, { recursive: true, force: true });
  });

  describe('file()', () => {
    describe('text()', () => {
      it('should read file content as text', async () => {
        const filePath = path.join(testDir, 'test.txt');
        await fsPromises.writeFile(filePath, 'Hello, World!');

        const f = file(filePath);
        const content = await f.text();

        expect(content).toBe('Hello, World!');
      });

      it('should throw error for non-existent file', async () => {
        const filePath = path.join(testDir, 'non-existent.txt');
        const f = file(filePath);

        await expect(f.text()).rejects.toThrow();
      });

      it('should handle UTF-8 content correctly', async () => {
        const filePath = path.join(testDir, 'utf8.txt');
        const unicodeContent = '你好世界 🌍 مرحبا';
        await fsPromises.writeFile(filePath, unicodeContent);

        const f = file(filePath);
        const content = await f.text();

        expect(content).toBe(unicodeContent);
      });
    });

    describe('json()', () => {
      it('should parse JSON file correctly', async () => {
        const filePath = path.join(testDir, 'test.json');
        const jsonData = { name: 'test', value: 42, nested: { key: 'value' } };
        await fsPromises.writeFile(filePath, JSON.stringify(jsonData));

        const f = file(filePath);
        const content = await f.json();

        expect(content).toEqual(jsonData);
      });

      it('should throw error for invalid JSON', async () => {
        const filePath = path.join(testDir, 'invalid.json');
        await fsPromises.writeFile(filePath, 'not valid json');

        const f = file(filePath);

        await expect(f.json()).rejects.toThrow();
      });

      it('should handle JSON arrays', async () => {
        const filePath = path.join(testDir, 'array.json');
        const jsonArray = [1, 2, 3, 'four', { five: 5 }];
        await fsPromises.writeFile(filePath, JSON.stringify(jsonArray));

        const f = file(filePath);
        const content = await f.json();

        expect(content).toEqual(jsonArray);
      });
    });

    describe('exists()', () => {
      it('should return true for existing file', async () => {
        const filePath = path.join(testDir, 'exists.txt');
        await fsPromises.writeFile(filePath, 'content');

        const f = file(filePath);
        const exists = await f.exists();

        expect(exists).toBe(true);
      });

      it('should return false for non-existent file', async () => {
        const filePath = path.join(testDir, 'does-not-exist.txt');

        const f = file(filePath);
        const exists = await f.exists();

        expect(exists).toBe(false);
      });

      it('should return true for existing directory', async () => {
        const f = file(testDir);
        const exists = await f.exists();

        expect(exists).toBe(true);
      });
    });

    describe('stat()', () => {
      it('should return file size and mtime', async () => {
        const filePath = path.join(testDir, 'stat-test.txt');
        const content = 'Test content for stat';
        await fsPromises.writeFile(filePath, content);

        const f = file(filePath);
        const stats = await f.stat();

        expect(stats.size).toBe(content.length);
        expect(stats.mtime).toBeInstanceOf(Date);
        expect(stats.mtime.getTime()).toBeLessThanOrEqual(Date.now());
      });

      it('should throw error for non-existent file', async () => {
        const filePath = path.join(testDir, 'non-existent-stat.txt');
        const f = file(filePath);

        await expect(f.stat()).rejects.toThrow();
      });
    });

    describe('write()', () => {
      it('should write string content via BunFile', async () => {
        const filePath = path.join(testDir, 'write-test.txt');
        const content = 'Written via BunFile';

        const f = file(filePath);
        await f.write(content);

        const readContent = await fsPromises.readFile(filePath, 'utf-8');
        expect(readContent).toBe(content);
      });

      it('should write Uint8Array content', async () => {
        const filePath = path.join(testDir, 'binary-test.bin');
        const content = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

        const f = file(filePath);
        await f.write(content);

        const readContent = await fsPromises.readFile(filePath);
        expect(new Uint8Array(readContent)).toEqual(content);
      });
    });

    describe('name property', () => {
      it('should return the file path', () => {
        const filePath = '/path/to/file.txt';
        const f = file(filePath);

        expect(f.name).toBe(filePath);
      });
    });

    describe('size property', () => {
      it('should return file size for existing file', async () => {
        const filePath = path.join(testDir, 'size-test.txt');
        const content = 'Size test content';
        await fsPromises.writeFile(filePath, content);

        const f = file(filePath);

        expect(f.size).toBe(content.length);
      });

      it('should return 0 for non-existent file', () => {
        const filePath = path.join(testDir, 'non-existent-size.txt');
        const f = file(filePath);

        expect(f.size).toBe(0);
      });
    });
  });

  describe('write()', () => {
    it('should write string content to file path', async () => {
      const filePath = path.join(testDir, 'write-string.txt');
      const content = 'Direct write content';

      await write(filePath, content);

      const readContent = await fsPromises.readFile(filePath, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should write to BunFile object', async () => {
      const filePath = path.join(testDir, 'write-bunfile.txt');
      const content = 'Write via BunFile';
      const f = file(filePath);

      await write(f, content);

      const readContent = await fsPromises.readFile(filePath, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should create parent directories if needed', async () => {
      const filePath = path.join(testDir, 'nested', 'dir', 'file.txt');
      const content = 'Nested content';

      // Create parent directories first (Node.js doesn't auto-create)
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      await write(filePath, content);

      const readContent = await fsPromises.readFile(filePath, 'utf-8');
      expect(readContent).toBe(content);
    });
  });

  describe('spawn()', () => {
    it('should spawn a process and capture stdout', async () => {
      const proc = spawn(['echo', 'hello'], { stdout: 'pipe' });

      const exitCode = await proc.exited;
      expect(exitCode).toBe(0);

      const output = await readableStreamToText(proc.stdout!);
      expect(output.trim()).toBe('hello');
    });

    it('should capture non-zero exit code', async () => {
      const proc = spawn(['node', '-e', 'process.exit(42)']);

      const exitCode = await proc.exited;
      expect(exitCode).toBe(42);
    });

    it('should capture stderr', async () => {
      const proc = spawn(['node', '-e', 'console.error("error message")'], {
        stderr: 'pipe',
      });

      await proc.exited;
      const stderr = await readableStreamToText(proc.stderr!);
      expect(stderr.trim()).toBe('error message');
    });

    it('should respect cwd option', async () => {
      // Use realpath to resolve symlinks (macOS /var -> /private/var)
      const realTestDir = await fsPromises.realpath(testDir);
      const proc = spawn(['node', '-e', 'console.log(process.cwd())'], {
        cwd: testDir,
        stdout: 'pipe',
      });

      await proc.exited;
      const output = await readableStreamToText(proc.stdout!);
      expect(output.trim()).toBe(realTestDir);
    });

    it('should respect env option', async () => {
      const proc = spawn(['node', '-e', 'console.log(process.env.TEST_VAR)'], {
        env: { ...process.env, TEST_VAR: 'test_value' },
        stdout: 'pipe',
      });

      await proc.exited;
      const output = await readableStreamToText(proc.stdout!);
      expect(output.trim()).toBe('test_value');
    });

    it('should have a valid pid', async () => {
      const proc = spawn(['echo', 'test']);
      expect(proc.pid).toBeGreaterThan(0);
      await proc.exited;
    });
  });

  describe('readableStreamToText()', () => {
    it('should convert stream to text', async () => {
      const proc = spawn(['echo', 'stream test'], { stdout: 'pipe' });
      await proc.exited;

      const text = await readableStreamToText(proc.stdout!);
      expect(text.trim()).toBe('stream test');
    });

    it('should handle empty stream', async () => {
      const proc = spawn(['node', '-e', ''], { stdout: 'pipe' });
      await proc.exited;

      const text = await readableStreamToText(proc.stdout!);
      expect(text).toBe('');
    });

    it('should handle multi-line output', async () => {
      const proc = spawn(
        [
          'node',
          '-e',
          'console.log("line1"); console.log("line2"); console.log("line3")',
        ],
        { stdout: 'pipe' },
      );
      await proc.exited;

      const text = await readableStreamToText(proc.stdout!);
      const lines = text.trim().split('\n');
      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });
  });
});
