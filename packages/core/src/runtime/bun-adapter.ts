/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Runtime compatibility layer for Bun APIs.
 *
 * This module provides Node.js-compatible implementations of Bun-specific APIs
 * used by code ported from opencode. This enables running opencode-derived code
 * in Node.js environments.
 *
 * @module runtime/bun-adapter
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {
  spawn as nodeSpawn,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import type { Readable } from 'node:stream';

/**
 * Options for spawn operations.
 */
export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: 'pipe' | 'inherit' | 'ignore';
  stdout?: 'pipe' | 'inherit' | 'ignore';
  stderr?: 'pipe' | 'inherit' | 'ignore';
}

/**
 * Result of a spawn operation, mimicking Bun.spawn result.
 */
export interface SpawnResult {
  /** Promise that resolves to the exit code when the process exits */
  exited: Promise<number>;
  /** Exit code of the process (available after process exits) */
  exitCode: number;
  /** Stdout stream if stdout was set to 'pipe' */
  stdout: ReadableStream<Uint8Array> | null;
  /** Stderr stream if stderr was set to 'pipe' */
  stderr: ReadableStream<Uint8Array> | null;
  /** Process ID */
  pid: number;
  /** Kill the process */
  kill(signal?: NodeJS.Signals): void;
}

/**
 * Interface representing a Bun-compatible file handle.
 */
export interface BunFile {
  /** The file path */
  readonly name: string;

  /** Read file content as text */
  text(): Promise<string>;

  /** Read file content as JSON */
  json<T = unknown>(): Promise<T>;

  /** Check if file exists */
  exists(): Promise<boolean>;

  /** Get file statistics */
  stat(): Promise<{ size: number; mtime: Date }>;

  /** Write content to the file */
  write(content: string | Uint8Array): Promise<void>;

  /** Get file size (synchronously checks if it exists, returns 0 if not) */
  readonly size: number;
}

/**
 * Creates a BunFile-compatible wrapper for a file path.
 *
 * @param path - The file path
 * @returns A BunFile object with methods to interact with the file
 *
 * @example
 * ```typescript
 * const f = file('/path/to/file.json');
 * const data = await f.json();
 * console.log(await f.exists());
 * ```
 */
export function file(path: string): BunFile {
  let cachedSize: number | null = null;

  return {
    get name() {
      return path;
    },

    async text(): Promise<string> {
      return fsPromises.readFile(path, 'utf-8');
    },

    async json<T = unknown>(): Promise<T> {
      const content = await fsPromises.readFile(path, 'utf-8');
      return JSON.parse(content) as T;
    },

    async exists(): Promise<boolean> {
      try {
        await fsPromises.access(path, fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },

    async stat(): Promise<{ size: number; mtime: Date }> {
      const stats = await fsPromises.stat(path);
      return {
        size: stats.size,
        mtime: stats.mtime,
      };
    },

    async write(content: string | Uint8Array): Promise<void> {
      await fsPromises.writeFile(path, content);
    },

    get size(): number {
      if (cachedSize !== null) {
        return cachedSize;
      }
      try {
        const stats = fs.statSync(path);
        cachedSize = stats.size;
        return cachedSize;
      } catch {
        return 0;
      }
    },
  };
}

/**
 * Writes content to a file, compatible with Bun.write().
 *
 * @param target - File path or BunFile object
 * @param content - Content to write (string or Uint8Array)
 *
 * @example
 * ```typescript
 * await write('/path/to/file.txt', 'Hello, World!');
 * await write(file('/path/to/file.json'), JSON.stringify({ key: 'value' }));
 * ```
 */
export async function write(
  target: string | BunFile,
  content: string | Uint8Array,
): Promise<void> {
  const filePath = typeof target === 'string' ? target : target.name;
  await fsPromises.writeFile(filePath, content);
}

/**
 * Converts a Node.js Readable stream to a Web ReadableStream.
 */
function nodeStreamToWebStream(
  nodeStream: Readable,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

/**
 * Spawns a child process, compatible with Bun.spawn().
 *
 * @param cmd - Command and arguments as an array
 * @param options - Spawn options
 * @returns SpawnResult object with process information
 *
 * @example
 * ```typescript
 * const proc = spawn(['echo', 'hello'], { stdout: 'pipe' });
 * const exitCode = await proc.exited;
 * const output = await readableStreamToText(proc.stdout!);
 * ```
 */
export function spawn(cmd: string[], options?: SpawnOptions): SpawnResult {
  const [command, ...args] = cmd;

  const nodeOptions: NodeSpawnOptions = {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: [
      options?.stdin ?? 'ignore',
      options?.stdout ?? 'pipe',
      options?.stderr ?? 'pipe',
    ],
  };

  const child = nodeSpawn(command, args, nodeOptions);

  let exitCode = -1;
  const exitedPromise = new Promise<number>((resolve) => {
    child.on('exit', (code) => {
      exitCode = code ?? 0;
      resolve(exitCode);
    });
    child.on('error', () => {
      exitCode = 1;
      resolve(1);
    });
  });

  return {
    exited: exitedPromise,
    get exitCode() {
      return exitCode;
    },
    stdout: child.stdout ? nodeStreamToWebStream(child.stdout) : null,
    stderr: child.stderr ? nodeStreamToWebStream(child.stderr) : null,
    pid: child.pid ?? 0,
    kill(signal?: NodeJS.Signals) {
      child.kill(signal);
    },
  };
}

/**
 * Converts a ReadableStream to text.
 *
 * @param stream - Web ReadableStream of Uint8Array
 * @returns Promise resolving to the complete text content
 *
 * @example
 * ```typescript
 * const proc = spawn(['cat', 'file.txt'], { stdout: 'pipe' });
 * const text = await readableStreamToText(proc.stdout!);
 * ```
 */
export async function readableStreamToText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate all chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(result);
}

/**
 * Namespace export for Bun-compatible APIs.
 * Use this when you need a drop-in replacement: `import { Bun } from './bun-adapter'`
 */
export const Bun = {
  file,
  write,
  spawn,
};

export default Bun;
