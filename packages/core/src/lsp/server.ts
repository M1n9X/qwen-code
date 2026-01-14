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
    extensions: [
      '.c',
      '.cpp',
      '.cxx',
      '.cc',
      '.c++',
      '.h',
      '.hpp',
      '.hxx',
      '.h++',
    ],
    root: NearestRoot([
      'compile_commands.json',
      'compile_flags.txt',
      '.clangd',
      'CMakeLists.txt',
      'Makefile',
    ]),
    async spawn(root) {
      const bin = await which('clangd');
      if (!bin) return undefined;

      return {
        process: spawn(bin, ['--background-index', '--clang-tidy'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  // ============================================================================
  // Additional Language Servers (ported from opencode)
  // ============================================================================

  /**
   * Ruby Language Server (RuboCop).
   */
  export const Ruby: LSPServerInfo = {
    id: 'ruby-lsp',
    extensions: ['.rb', '.rake', '.gemspec', '.ru'],
    root: NearestRoot(['Gemfile', 'Gemfile.lock']),
    async spawn(root) {
      const bin = await which('rubocop');
      if (!bin) return undefined;

      return {
        process: spawn(bin, ['--lsp'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * PHP Language Server (Intelephense).
   */
  export const PHP: LSPServerInfo = {
    id: 'intelephense',
    extensions: ['.php'],
    root: NearestRoot(['composer.json', 'composer.lock', '.php-version']),
    async spawn(root) {
      const binary = await which('intelephense');
      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        return {
          process: spawn(npx, ['intelephense', '--stdio'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
          }),
          initialization: { telemetry: { enabled: false } },
        };
      }

      return {
        process: spawn(binary, ['--stdio'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
        initialization: { telemetry: { enabled: false } },
      };
    },
  };

  /**
   * Java Language Server (Eclipse JDT.LS).
   */
  export const Java: LSPServerInfo = {
    id: 'jdtls',
    extensions: ['.java'],
    root: NearestRoot([
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      '.project',
      '.classpath',
    ]),
    async spawn(root) {
      const java = await which('java');
      if (!java) return undefined;

      // JDTLS requires manual installation - check if it exists
      const jdtls = await which('jdtls');
      if (!jdtls) return undefined;

      return {
        process: spawn(jdtls, [], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Swift Language Server (SourceKit-LSP).
   */
  export const Swift: LSPServerInfo = {
    id: 'sourcekit-lsp',
    extensions: ['.swift'],
    root: NearestRoot(['Package.swift', '*.xcodeproj', '*.xcworkspace']),
    async spawn(root) {
      const sourcekit = await which('sourcekit-lsp');
      if (sourcekit) {
        return {
          process: spawn(sourcekit, [], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
          }),
        };
      }

      // On macOS, try xcrun
      if (process.platform === 'darwin') {
        const xcrun = await which('xcrun');
        if (!xcrun) return undefined;

        return {
          process: spawn(xcrun, ['sourcekit-lsp'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
          }),
        };
      }

      return undefined;
    },
  };

  /**
   * Kotlin Language Server.
   */
  export const Kotlin: LSPServerInfo = {
    id: 'kotlin-ls',
    extensions: ['.kt', '.kts'],
    root: async (file) => {
      // Nearest Gradle root (multi-project or included build)
      const settingsRoot = await NearestRoot([
        'settings.gradle.kts',
        'settings.gradle',
      ])(file);
      if (settingsRoot) return settingsRoot;

      // Gradle wrapper (strong root signal)
      const wrapperRoot = await NearestRoot(['gradlew', 'gradlew.bat'])(file);
      if (wrapperRoot) return wrapperRoot;

      // Single-project or module-level build
      const buildRoot = await NearestRoot(['build.gradle.kts', 'build.gradle'])(
        file,
      );
      if (buildRoot) return buildRoot;

      // Maven fallback
      return NearestRoot(['pom.xml'])(file);
    },
    async spawn(root) {
      const bin = await which('kotlin-language-server');
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
   * Zig Language Server (ZLS).
   */
  export const Zig: LSPServerInfo = {
    id: 'zls',
    extensions: ['.zig', '.zon'],
    root: NearestRoot(['build.zig']),
    async spawn(root) {
      const bin = await which('zls');
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
   * Svelte Language Server.
   */
  export const Svelte: LSPServerInfo = {
    id: 'svelte',
    extensions: ['.svelte'],
    root: NearestRoot([
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]),
    async spawn(root) {
      const binary = await which('svelteserver');
      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        return {
          process: spawn(npx, ['svelte-language-server', '--stdio'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
          }),
        };
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
   * Astro Language Server.
   */
  export const Astro: LSPServerInfo = {
    id: 'astro',
    extensions: ['.astro'],
    root: NearestRoot([
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]),
    async spawn(root) {
      const binary = await which('astro-ls');
      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        return {
          process: spawn(npx, ['@astrojs/language-server', '--stdio'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
          }),
        };
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
   * C# Language Server (csharp-ls).
   */
  export const CSharp: LSPServerInfo = {
    id: 'csharp',
    extensions: ['.cs'],
    root: NearestRoot(['.sln', '.csproj', 'global.json']),
    async spawn(root) {
      const bin = await which('csharp-ls');
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
   * F# Language Server (fsautocomplete).
   */
  export const FSharp: LSPServerInfo = {
    id: 'fsharp',
    extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
    root: NearestRoot(['.sln', '.fsproj', 'global.json']),
    async spawn(root) {
      const bin = await which('fsautocomplete');
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
   * Elixir Language Server (ElixirLS).
   */
  export const Elixir: LSPServerInfo = {
    id: 'elixir-ls',
    extensions: ['.ex', '.exs'],
    root: NearestRoot(['mix.exs', 'mix.lock']),
    async spawn(root) {
      const bin = await which('elixir-ls');
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
   * YAML Language Server.
   */
  export const Yaml: LSPServerInfo = {
    id: 'yaml-ls',
    extensions: ['.yaml', '.yml'],
    root: NearestRoot([
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
    ]),
    async spawn(root) {
      const binary = await which('yaml-language-server');
      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        return {
          process: spawn(npx, ['yaml-language-server', '--stdio'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
          }),
        };
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
   * Lua Language Server.
   */
  export const Lua: LSPServerInfo = {
    id: 'lua-ls',
    extensions: ['.lua'],
    root: NearestRoot([
      '.luarc.json',
      '.luarc.jsonc',
      '.luacheckrc',
      '.stylua.toml',
      'stylua.toml',
      'selene.toml',
      'selene.yml',
    ]),
    async spawn(root) {
      const bin = await which('lua-language-server');
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
   * Bash Language Server.
   */
  export const Bash: LSPServerInfo = {
    id: 'bash',
    extensions: ['.sh', '.bash', '.zsh', '.ksh'],
    global: true,
    root: async () => process.cwd(),
    async spawn(root) {
      const binary = await which('bash-language-server');
      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        return {
          process: spawn(npx, ['bash-language-server', 'start'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
          }),
        };
      }

      return {
        process: spawn(binary, ['start'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Terraform Language Server.
   */
  export const Terraform: LSPServerInfo = {
    id: 'terraform',
    extensions: ['.tf', '.tfvars'],
    root: NearestRoot(['.terraform.lock.hcl', 'terraform.tfstate', '*.tf']),
    async spawn(root) {
      const bin = await which('terraform-ls');
      if (!bin) return undefined;

      return {
        process: spawn(bin, ['serve'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
        initialization: {
          experimentalFeatures: {
            prefillRequiredFields: true,
            validateOnSave: true,
          },
        },
      };
    },
  };

  /**
   * Dockerfile Language Server.
   */
  export const Dockerfile: LSPServerInfo = {
    id: 'dockerfile',
    extensions: ['.dockerfile'],
    global: true,
    root: async () => process.cwd(),
    async spawn(root) {
      const binary = await which('docker-langserver');
      if (!binary) {
        const npx = await which('npx');
        if (!npx) return undefined;

        return {
          process: spawn(
            npx,
            ['dockerfile-language-server-nodejs', '--stdio'],
            {
              cwd: root,
              stdio: ['pipe', 'pipe', 'pipe'],
              env: process.env,
            },
          ),
        };
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
   * Dart Language Server.
   */
  export const Dart: LSPServerInfo = {
    id: 'dart',
    extensions: ['.dart'],
    root: NearestRoot(['pubspec.yaml', 'analysis_options.yaml']),
    async spawn(root) {
      const dart = await which('dart');
      if (!dart) return undefined;

      return {
        process: spawn(dart, ['language-server', '--lsp'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * OCaml Language Server.
   */
  export const OCaml: LSPServerInfo = {
    id: 'ocaml-lsp',
    extensions: ['.ml', '.mli'],
    root: NearestRoot(['dune-project', 'dune-workspace', '.merlin', 'opam']),
    async spawn(root) {
      const bin = await which('ocamllsp');
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
   * Gleam Language Server.
   */
  export const Gleam: LSPServerInfo = {
    id: 'gleam',
    extensions: ['.gleam'],
    root: NearestRoot(['gleam.toml']),
    async spawn(root) {
      const gleam = await which('gleam');
      if (!gleam) return undefined;

      return {
        process: spawn(gleam, ['lsp'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Clojure Language Server.
   */
  export const Clojure: LSPServerInfo = {
    id: 'clojure-lsp',
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    root: NearestRoot([
      'deps.edn',
      'project.clj',
      'shadow-cljs.edn',
      'bb.edn',
      'build.boot',
    ]),
    async spawn(root) {
      const bin = await which('clojure-lsp');
      if (!bin) return undefined;

      return {
        process: spawn(bin, ['listen'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Nix Language Server (nixd).
   */
  export const Nix: LSPServerInfo = {
    id: 'nixd',
    extensions: ['.nix'],
    root: NearestRoot(['flake.nix', 'default.nix', 'shell.nix']),
    async spawn(root) {
      const nixd = await which('nixd');
      if (!nixd) return undefined;

      return {
        process: spawn(nixd, [], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * Prisma Language Server.
   */
  export const Prisma: LSPServerInfo = {
    id: 'prisma',
    extensions: ['.prisma'],
    root: NearestRoot([
      'schema.prisma',
      'prisma/schema.prisma',
      'package.json',
    ]),
    async spawn(root) {
      const prisma = await which('prisma');
      if (!prisma) return undefined;

      return {
        process: spawn(prisma, ['language-server'], {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      };
    },
  };

  /**
   * LaTeX Language Server (TexLab).
   */
  export const TexLab: LSPServerInfo = {
    id: 'texlab',
    extensions: ['.tex', '.bib'],
    root: NearestRoot(['.latexmkrc', 'latexmkrc', '.texlabroot', 'texlabroot']),
    async spawn(root) {
      const bin = await which('texlab');
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
   * Oxlint Language Server.
   */
  export const Oxlint: LSPServerInfo = {
    id: 'oxlint',
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
      '.astro',
      '.svelte',
    ],
    root: NearestRoot([
      '.oxlintrc.json',
      'package-lock.json',
      'bun.lockb',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package.json',
    ]),
    async spawn(root) {
      // Try oxlint with --lsp flag first
      const oxlint = await which('oxlint');
      if (oxlint) {
        return {
          process: spawn(oxlint, ['--lsp'], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
          }),
        };
      }

      // Fallback to oxc_language_server
      const oxcLs = await which('oxc_language_server');
      if (oxcLs) {
        return {
          process: spawn(oxcLs, [], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
          }),
        };
      }

      return undefined;
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
    // Core language servers
    typescript: LSPServer.Typescript,
    deno: LSPServer.Deno,
    pyright: LSPServer.Pyright,
    gopls: LSPServer.Gopls,
    'rust-analyzer': LSPServer.RustAnalyzer,
    vue: LSPServer.Vue,
    eslint: LSPServer.ESLint,
    biome: LSPServer.Biome,
    clangd: LSPServer.Clangd,
    // Additional language servers
    'ruby-lsp': LSPServer.Ruby,
    intelephense: LSPServer.PHP,
    jdtls: LSPServer.Java,
    'sourcekit-lsp': LSPServer.Swift,
    'kotlin-ls': LSPServer.Kotlin,
    zls: LSPServer.Zig,
    svelte: LSPServer.Svelte,
    astro: LSPServer.Astro,
    csharp: LSPServer.CSharp,
    fsharp: LSPServer.FSharp,
    'elixir-ls': LSPServer.Elixir,
    'yaml-ls': LSPServer.Yaml,
    'lua-ls': LSPServer.Lua,
    bash: LSPServer.Bash,
    terraform: LSPServer.Terraform,
    dockerfile: LSPServer.Dockerfile,
    dart: LSPServer.Dart,
    'ocaml-lsp': LSPServer.OCaml,
    gleam: LSPServer.Gleam,
    'clojure-lsp': LSPServer.Clojure,
    nixd: LSPServer.Nix,
    prisma: LSPServer.Prisma,
    texlab: LSPServer.TexLab,
    oxlint: LSPServer.Oxlint,
  };
}
