/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Server Registry.
 *
 * This module provides a registry for managing LSP server definitions,
 * allowing dynamic registration and lookup by file extension or server ID.
 *
 * @module lsp/registry
 */

import type { LSPServerInfo } from './server.js';

/**
 * LSP Server Registry interface.
 */
export interface LSPServerRegistry {
  /**
   * Get all registered servers.
   */
  getAll(): LSPServerInfo[];

  /**
   * Get a server by its ID.
   */
  getServerById(id: string): LSPServerInfo | undefined;

  /**
   * Get servers that handle a specific file extension.
   */
  getServersForExtension(extension: string): LSPServerInfo[];

  /**
   * Register a new server.
   */
  registerServer(server: LSPServerInfo): void;

  /**
   * Unregister a server by ID.
   */
  unregisterServer(id: string): boolean;

  /**
   * Check if a server is registered.
   */
  hasServer(id: string): boolean;
}

/**
 * Create a new LSP server registry.
 */
export function createLSPServerRegistry(
  initialServers: Record<string, LSPServerInfo> = {},
): LSPServerRegistry {
  const servers = new Map<string, LSPServerInfo>(
    Object.entries(initialServers),
  );

  return {
    getAll(): LSPServerInfo[] {
      return Array.from(servers.values());
    },

    getServerById(id: string): LSPServerInfo | undefined {
      return servers.get(id);
    },

    getServersForExtension(extension: string): LSPServerInfo[] {
      const normalizedExt = extension.startsWith('.')
        ? extension
        : `.${extension}`;

      return Array.from(servers.values()).filter(
        (server) =>
          server.extensions.length === 0 ||
          server.extensions.includes(normalizedExt),
      );
    },

    registerServer(server: LSPServerInfo): void {
      servers.set(server.id, server);
    },

    unregisterServer(id: string): boolean {
      return servers.delete(id);
    },

    hasServer(id: string): boolean {
      return servers.has(id);
    },
  };
}
