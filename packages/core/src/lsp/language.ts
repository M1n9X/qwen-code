/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Language extension to language ID mapping for LSP.
 *
 * This module maps file extensions to LSP language identifiers,
 * used when opening documents in language servers.
 *
 * @module lsp/language
 */

export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',

  // Python
  '.py': 'python',
  '.pyi': 'python',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.gemspec': 'ruby',
  '.ru': 'ruby',
  '.erb': 'erb',

  // Java/JVM
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',

  // C/C++
  '.c': 'c',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.c++': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.hxx': 'cpp',

  // C#/F#/.NET
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.fsi': 'fsharp',
  '.fsx': 'fsharp',

  // PHP
  '.php': 'php',

  // Swift
  '.swift': 'swift',

  // Shell
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.ksh': 'shellscript',
  '.ps1': 'powershell',
  '.psm1': 'powershell',

  // Data/Config
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.ini': 'ini',

  // Markup
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.tex': 'latex',
  '.latex': 'latex',

  // Other languages
  '.zig': 'zig',
  '.zon': 'zig',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hrl': 'erlang',
  '.hs': 'haskell',
  '.lhs': 'haskell',
  '.lua': 'lua',
  '.sql': 'sql',
  '.r': 'r',
  '.dart': 'dart',
  '.pl': 'perl',
  '.pm': 'perl',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.cljc': 'clojure',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.nix': 'nix',
  '.tf': 'terraform',
  '.tfvars': 'terraform-vars',
  '.hcl': 'hcl',
  '.typ': 'typst',
  '.gleam': 'gleam',

  // Dockerfile
  dockerfile: 'dockerfile',
  Dockerfile: 'dockerfile',

  // Makefile
  makefile: 'makefile',
  Makefile: 'makefile',
} as const;

/**
 * Get the language ID for a file extension.
 */
export function getLanguageId(extension: string): string {
  return LANGUAGE_EXTENSIONS[extension] ?? 'plaintext';
}
