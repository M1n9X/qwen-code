/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLSPServerRegistry, type LSPServerRegistry } from './registry.js';
import { getAllServers, type LSPServerInfo } from './server.js';

describe('LSP Server Registry', () => {
  let registry: LSPServerRegistry;

  beforeEach(() => {
    registry = createLSPServerRegistry(getAllServers());
  });

  describe('getAll()', () => {
    it('should return all registered servers', () => {
      const servers = registry.getAll();
      expect(servers.length).toBeGreaterThan(0);
      expect(servers.some((s) => s.id === 'typescript')).toBe(true);
      expect(servers.some((s) => s.id === 'pyright')).toBe(true);
    });
  });

  describe('getServerById()', () => {
    it('should return server by ID', () => {
      const ts = registry.getServerById('typescript');
      expect(ts).toBeDefined();
      expect(ts?.id).toBe('typescript');
    });

    it('should return undefined for unknown ID', () => {
      const unknown = registry.getServerById('unknown-server');
      expect(unknown).toBeUndefined();
    });
  });

  describe('getServersForExtension()', () => {
    it('should return TypeScript server for .ts files', () => {
      const servers = registry.getServersForExtension('.ts');
      expect(servers.some((s) => s.id === 'typescript')).toBe(true);
    });

    it('should return Python server for .py files', () => {
      const servers = registry.getServersForExtension('.py');
      expect(servers.some((s) => s.id === 'pyright')).toBe(true);
    });

    it('should return Go server for .go files', () => {
      const servers = registry.getServersForExtension('.go');
      expect(servers.some((s) => s.id === 'gopls')).toBe(true);
    });

    it('should return Rust server for .rs files', () => {
      const servers = registry.getServersForExtension('.rs');
      expect(servers.some((s) => s.id === 'rust-analyzer')).toBe(true);
    });

    it('should handle extension without leading dot', () => {
      const servers = registry.getServersForExtension('ts');
      expect(servers.some((s) => s.id === 'typescript')).toBe(true);
    });

    it('should return multiple servers for extensions with multiple handlers', () => {
      const servers = registry.getServersForExtension('.ts');
      // TypeScript files can be handled by typescript, deno, eslint, biome, oxlint
      expect(servers.length).toBeGreaterThan(1);
    });
  });

  describe('registerServer()', () => {
    it('should register a new server', () => {
      const customServer: LSPServerInfo = {
        id: 'custom-server',
        extensions: ['.custom'],
        root: async () => process.cwd(),
        spawn: async () => undefined,
      };

      registry.registerServer(customServer);

      expect(registry.hasServer('custom-server')).toBe(true);
      expect(registry.getServerById('custom-server')).toBe(customServer);
    });

    it('should override existing server with same ID', () => {
      const customTs: LSPServerInfo = {
        id: 'typescript',
        extensions: ['.ts'],
        root: async () => '/custom/root',
        spawn: async () => undefined,
      };

      registry.registerServer(customTs);

      const ts = registry.getServerById('typescript');
      expect(ts).toBe(customTs);
    });
  });

  describe('unregisterServer()', () => {
    it('should remove a registered server', () => {
      expect(registry.hasServer('typescript')).toBe(true);

      const result = registry.unregisterServer('typescript');

      expect(result).toBe(true);
      expect(registry.hasServer('typescript')).toBe(false);
    });

    it('should return false for non-existent server', () => {
      const result = registry.unregisterServer('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('hasServer()', () => {
    it('should return true for registered servers', () => {
      expect(registry.hasServer('typescript')).toBe(true);
      expect(registry.hasServer('pyright')).toBe(true);
      expect(registry.hasServer('gopls')).toBe(true);
    });

    it('should return false for non-registered servers', () => {
      expect(registry.hasServer('non-existent')).toBe(false);
    });
  });

  describe('getAllServers() coverage', () => {
    it('should include all expected language servers', () => {
      const servers = getAllServers();
      const serverIds = Object.keys(servers);

      // Core servers
      expect(serverIds).toContain('typescript');
      expect(serverIds).toContain('deno');
      expect(serverIds).toContain('pyright');
      expect(serverIds).toContain('gopls');
      expect(serverIds).toContain('rust-analyzer');
      expect(serverIds).toContain('vue');
      expect(serverIds).toContain('eslint');
      expect(serverIds).toContain('biome');
      expect(serverIds).toContain('clangd');

      // Additional servers
      expect(serverIds).toContain('ruby-lsp');
      expect(serverIds).toContain('intelephense');
      expect(serverIds).toContain('jdtls');
      expect(serverIds).toContain('sourcekit-lsp');
      expect(serverIds).toContain('kotlin-ls');
      expect(serverIds).toContain('zls');
      expect(serverIds).toContain('svelte');
      expect(serverIds).toContain('astro');
      expect(serverIds).toContain('csharp');
      expect(serverIds).toContain('fsharp');
      expect(serverIds).toContain('elixir-ls');
      expect(serverIds).toContain('yaml-ls');
      expect(serverIds).toContain('lua-ls');
      expect(serverIds).toContain('bash');
      expect(serverIds).toContain('terraform');
      expect(serverIds).toContain('dockerfile');
      expect(serverIds).toContain('dart');
      expect(serverIds).toContain('ocaml-lsp');
      expect(serverIds).toContain('gleam');
      expect(serverIds).toContain('clojure-lsp');
      expect(serverIds).toContain('nixd');
      expect(serverIds).toContain('prisma');
      expect(serverIds).toContain('texlab');
      expect(serverIds).toContain('oxlint');
    });

    it('should have correct extensions for each server', () => {
      const servers = getAllServers();

      expect(servers['typescript'].extensions).toContain('.ts');
      expect(servers['typescript'].extensions).toContain('.tsx');
      expect(servers['pyright'].extensions).toContain('.py');
      expect(servers['gopls'].extensions).toContain('.go');
      expect(servers['rust-analyzer'].extensions).toContain('.rs');
      expect(servers['zls'].extensions).toContain('.zig');
      expect(servers['ruby-lsp'].extensions).toContain('.rb');
      expect(servers['intelephense'].extensions).toContain('.php');
      expect(servers['jdtls'].extensions).toContain('.java');
      expect(servers['kotlin-ls'].extensions).toContain('.kt');
      expect(servers['dart'].extensions).toContain('.dart');
    });
  });
});
