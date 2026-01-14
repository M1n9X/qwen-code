/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Server Definitions.
 *
 * This module provides server configurations for various language servers,
 * including root detection, spawn logic, and initialization options.
 *
 * @module lsp/server
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

/**
 * Result of spawning an LSP server.
 */
export interface LSPServerHandle {
  /** The spawned child process */
  process: ChildProcess;
  /** Initialization options to pass to the server */
  initialization?: Record<string, unknown>;
}

/**
 * Function type for determining project root from a file path.
 */
export type RootFunction = (file: string) => Promise<string | undefined>;

/**
 * Server information interface.
 */
export interface LSPServerInfo {
  /** Unique identifier for this server */
  id: string;
  /** File extensions this server handles */
  extensions: string[];
  /** Whether this is a global server (not file-specific) */
  global?: boolean;
  /** Function to determine project root for a given file */
  root: RootFunction;
  /** Spawn the server for a given project root */
  spawn(root: string): Promise<LSPServerHandle | undefined>;
}

/**
 * Walk up directory tree looking for specific files.
 */
async function* walkUp(options: {
  targets: string[];
  start: string;
  stop?: string;
}): AsyncGenerator<string> {
  let current = options.start;
  const stopPath = options.stop ? path.resolve(options.stop) : undefined;

  while (true) {
    for (const target of options.targets) {
      // Handle glob patterns like *.cabal
      if (target.includes('*')) {
        try {
          const entries = await fs.readdir(current);
          const pattern = target.replace('*', '');
          for (const entry of entries) {
            if (entry.endsWith(pattern)) {
              yield path.join(current, entry);
            }
          }
        } catch {
          // Directory doesn't exist or isn't readable
        }
      } else {
        const fullPath = path.join(current, target);
        try {
          await fs.access(fullPath);
          yield fullPath;
        } catch {
          // File doesn't exist
        }
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    if (stopPath && current === stopPath) break;
    current = parent;
  }
}

/**
 * Creates a root function that finds the nearest directory containing any of the target files.
 */
export function NearestRoot(
  includePatterns: string[],
  excludePatterns?: string[],
): RootFunction {
  return async (file: string, instanceDirectory?: string) => {
    const stopDir = instanceDirectory ?? process.cwd();

    // Check for exclusions first
    if (excludePatterns) {
      const excludedFiles = walkUp({
        targets: excludePatterns,
        start: path.dirname(file),
        stop: stopDir,
      });
      const excluded = await excludedFiles.next();
      await excludedFiles.return(undefined);
      if (excluded.value) return undefined;
    }

    // Find included files
    const files = walkUp({
      targets: includePatterns,
      start: path.dirname(file),
      stop: stopDir,
    });
    const first = await files.next();
    await files.return(undefined);

    if (!first.value) return stopDir;
    return path.dirname(first.value);
  };
}

/**
 * Find an executable in PATH.
 */
async function which(cmd: string): Promise<string | undefined> {
  const envPath = process.env['PATH'] ?? '';
  const pathDirs = envPath.split(path.delimiter);
  const ext = process.platform === 'win32' ? '.exe' : '';

  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd + ext);
    try {
      await fs.access(fullPath, fs.constants.X_OK);
      return fullPath;
    } catch {
      // Not found in this directory
    }
  }

  // Try without extension on Windows for scripts
  if (process.platform === 'win32') {
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, cmd);
      try {
        await fs.access(fullPath);
        return fullPath;
      } catch {
        // Not found
      }
    }
  }

  return undefined;
}

/**
 * Check if a path exists.
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a module path similar to require.resolve.
 */
async function resolveModule(
  pkg: string,
  cwd: string,
): Promise<string | undefined> {
  const nodeModulesPath = path.join(cwd, 'node_modules', pkg);
  if (await pathExists(nodeModulesPath)) {
    return nodeModulesPath;
  }
  return undefined;
}

// ============================================================================
// Server Definitions
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LSPServer {
  /**
   * TypeScript/JavaScript Language Server.
   */
  export const Typescript: LSPServerInfo = {
    id: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
    root: NearestRoot(
      [
        'package-lock.json',
        'bun.lockb',
        'bun.lock',
        'pnpm-lock.yaml',
        'yarn.lock',
      ],
      ['deno.json', 'deno.jsonc'],
    ),
    async spawn(root) {
      // Check if typescript is available in the project
      const tsserver = await resolveModule('typescript/lib/tsserver.js', root);

      // Try to find typescript-language-server
      let binary = await which('typescript-language-server');

      if (!binary) {
        // Fallback: try using npx
        binary = await which('npx');
        if (!binary) return undefined;

        const proc = spawn(binary, ['typescript-language-server', '--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });

        return {
          process: proc,
          initialization: tsserver ? { tsserver: { path: tsserver } } : {},
        };
      }

      const proc = spawn(binary, ['--stdio'], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      return {
        process: proc,
        initialization: tsserver ? { tsserver: { path: tsserver } } : {},
      };
    },
  };

  /**
   * Deno Language Server.
   */
  export const Deno: LSPServerInfo = {
    id: 'deno',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    root: async (file) => {
      const files = walkUp({
        targets: ['deno.json', 'deno.jsonc'],
        start: path.dirname(file),
      });
      const first = await files.next();
      await files.return(undefined);
      if (!first.value) return undefined;
      return path.dirname(first.value);
    },
    async spawn(root) {
      const deno = await which('deno');
      if (!deno) return undefined;

      return {
        process: spawn(deno, ['lsp'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Python Language Server (Pyright).
   */
  export const Pyright: LSPServerInfo = {
    id: 'pyright',
    extensions: ['.py', '.pyi'],
    root: NearestRoot([
      'pyproject.toml',
      'setup.py',
      'setup.cfg',
      'requirements.txt',
      'Pipfile',
      'pyrightconfig.json',
    ]),
    async spawn(root) {
      const binary = await which('pyright-langserver');

      if (!binary) {
        // Fallback: try npx
        const npx = await which('npx');
        if (!npx) return undefined;

        const proc = spawn(npx, ['pyright-langserver', '--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });

        return {
          process: proc,
          initialization: await getPythonInitialization(root),
        };
      }

      const proc = spawn(binary, ['--stdio'], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      return {
        process: proc,
        initialization: await getPythonInitialization(root),
      };
    },
  };

  /**
   * Go Language Server (gopls).
   */
  export const Gopls: LSPServerInfo = {
    id: 'gopls',
    extensions: ['.go'],
    root: async (file) => {
      // First check for go.work (workspace)
      const workRoot = await NearestRoot(['go.work'])(file);
      if (workRoot && (await pathExists(path.join(workRoot, 'go.work')))) {
        return workRoot;
      }
      // Fall back to go.mod
      return NearestRoot(['go.mod', 'go.sum'])(file);
    },
    async spawn(root) {
      const bin = await which('gopls');
      if (!bin) return undefined;

      return {
        process: spawn(bin, [], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Rust Language Server (rust-analyzer).
   */
  export const RustAnalyzer: LSPServerInfo = {
    id: 'rust-analyzer',
    extensions: ['.rs'],
    root: NearestRoot(['Cargo.toml', 'Cargo.lock']),
    async spawn(root) {
      const bin = await which('rust-analyzer');
      if (!bin) return undefined;

      return {
        process: spawn(bin, [], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Vue Language Server.
   */
  export const Vue: LSPServerInfo = {
    id: 'vue',
    extensions: ['.vue'],
    root: NearestRoot([
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]),
    async spawn(root) {
      const binary = await which('vue-language-server');

      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        const proc = spawn(npx, ['@vue/language-server', '--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });

        return { process: proc };
      }

      return {
        process: spawn(binary, ['--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * ESLint Language Server.
   */
  export const ESLint: LSPServerInfo = {
    id: 'eslint',
    extensions: [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.mts',
      '.cts',
      '.vue',
    ],
    root: NearestRoot([
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]),
    async spawn(root) {
      // Check if eslint is available
      const eslint = await resolveModule('eslint', root);
      if (!eslint) return undefined;

      // ESLint language server is typically run via VS Code extension
      // For CLI, we can use eslint_d or similar
      const eslintD = await which('eslint_d');
      if (!eslintD) return undefined;

      return {
        process: spawn(eslintD, ['--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Biome Language Server (linter/formatter).
   */
  export const Biome: LSPServerInfo = {
    id: 'biome',
    extensions: [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '.jsonc',
      '.css',
      '.vue',
    ],
    root: NearestRoot([
      'biome.json',
      'biome.jsonc',
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
    ]),
    async spawn(root) {
      // Check local installation first
      const localBin = path.join(root, 'node_modules', '.bin', 'biome');
      let bin: string | undefined;

      if (await pathExists(localBin)) {
        bin = localBin;
      } else {
        bin = await which('biome');
      }

      if (!bin) return undefined;

      return {
        process: spawn(bin, ['lsp-proxy', '--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Clangd (C/C++ Language Server).
   */
  export const Clangd: LSPServerInfo = {
    id: 'clangd',
    extensions: ['.c', '.cpp', '.cxx', '.cc', '.h', '.hpp', '.hxx'],
    root: NearestRoot([
      'compile_commands.json',
      '.clangd',
      'CMakeLists.txt',
      'Makefile',
    ]),
    async spawn(root) {
      const bin = await which('clangd');
      if (!bin) return undefined;

      return {
        process: spawn(bin, [], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };
}

/**
 * Get Python initialization options (venv detection).
 */
async function getPythonInitialization(
  root: string,
): Promise<Record<string, string>> {
  const initialization: Record<string, string> = {};

  const venvPaths = [
    process.env['VIRTUAL_ENV'],
    path.join(root, '.venv'),
    path.join(root, 'venv'),
  ].filter((p): p is string => p !== undefined);

  for (const venvPath of venvPaths) {
    const isWindows = process.platform === 'win32';
    const pythonPath = isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');

    if (await pathExists(pythonPath)) {
      initialization['pythonPath'] = pythonPath;
      break;
    }
  }

  return initialization;
}

/**
 * Get all available server definitions.
 */
export function getAllServers(): Record<string, LSPServerInfo> {
  return {
    typescript: LSPServer.Typescript,
    deno: LSPServer.Deno,
    pyright: LSPServer.Pyright,
    gopls: LSPServer.Gopls,
    'rust-analyzer': LSPServer.RustAnalyzer,
    vue: LSPServer.Vue,
    eslint: LSPServer.ESLint,
    biome: LSPServer.Biome,
    clangd: LSPServer.Clangd,
  };
}
