/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Manager Module.
 *
 * This module orchestrates multiple language servers, handling lazy spawning,
 * client caching, and providing high-level APIs for code intelligence.
 *
 * @module lsp
 */

import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

import { type LSPClient, createLSPClient, type Diagnostic } from './client.js';
import { type LSPServerInfo, getAllServers } from './server.js';

/**
 * LSP Status for a connected server.
 */
export interface LSPStatus {
  id: string;
  name: string;
  root: string;
  status: 'connected' | 'error';
}

/**
 * LSP Symbol from workspace/symbol request.
 */
export interface LSPSymbol {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
}

/**
 * Document Symbol from textDocument/documentSymbol request.
 */
export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * LSP Manager state.
 */
interface LSPState {
  clients: LSPClient[];
  servers: Record<string, LSPServerInfo>;
  broken: Set<string>;
  spawning: Map<string, Promise<LSPClient | undefined>>;
  instanceDirectory: string;
}

/**
 * LSP Manager class for orchestrating multiple language servers.
 */
export class LSPManager extends EventEmitter {
  private state: LSPState;
  private initialized = false;

  constructor(instanceDirectory: string = process.cwd()) {
    super();
    this.state = {
      clients: [],
      servers: {},
      broken: new Set(),
      spawning: new Map(),
      instanceDirectory,
    };
  }

  /**
   * Initialize the LSP manager with available servers.
   */
  async initialize(config?: {
    lsp?: boolean | Record<string, unknown>;
  }): Promise<void> {
    if (this.initialized) return;

    // If LSP is disabled, don't load any servers
    if (config?.lsp === false) {
      this.initialized = true;
      return;
    }

    // Load all available servers
    this.state.servers = getAllServers();

    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Get status of all connected LSP clients.
   */
  getStatus(): LSPStatus[] {
    return this.state.clients.map((client) => ({
      id: client.getServerID(),
      name:
        this.state.servers[client.getServerID()]?.id ?? client.getServerID(),
      root: path.relative(this.state.instanceDirectory, client.getRoot()),
      status: 'connected' as const,
    }));
  }

  /**
   * Get clients for a file (spawning if necessary).
   */
  private async getClients(file: string): Promise<LSPClient[]> {
    const extension = path.extname(file) || file;
    const result: LSPClient[] = [];

    for (const server of Object.values(this.state.servers)) {
      // Check if server handles this extension
      if (server.extensions.length && !server.extensions.includes(extension)) {
        continue;
      }

      // Determine project root
      const root = await server.root(file);
      if (!root) continue;

      const key = root + server.id;
      if (this.state.broken.has(key)) continue;

      // Check for existing client
      const existing = this.state.clients.find(
        (c) => c.getRoot() === root && c.getServerID() === server.id,
      );
      if (existing) {
        result.push(existing);
        continue;
      }

      // Check if already spawning
      const inflight = this.state.spawning.get(key);
      if (inflight) {
        const client = await inflight;
        if (client) result.push(client);
        continue;
      }

      // Spawn new client
      const task = this.spawnClient(server, root, key);
      this.state.spawning.set(key, task);

      task.finally(() => {
        if (this.state.spawning.get(key) === task) {
          this.state.spawning.delete(key);
        }
      });

      const client = await task;
      if (client) {
        result.push(client);
        this.emit('client:connected', { serverID: server.id, root });
      }
    }

    return result;
  }

  /**
   * Spawn an LSP client.
   */
  private async spawnClient(
    server: LSPServerInfo,
    root: string,
    key: string,
  ): Promise<LSPClient | undefined> {
    try {
      const handle = await server.spawn(root);
      if (!handle) {
        this.state.broken.add(key);
        return undefined;
      }

      const client = await createLSPClient({
        serverID: server.id,
        server: handle,
        root,
      });

      // Check for duplicate (race condition)
      const existing = this.state.clients.find(
        (c) => c.getRoot() === root && c.getServerID() === server.id,
      );
      if (existing) {
        await client.shutdown();
        return existing;
      }

      this.state.clients.push(client);
      return client;
    } catch (error) {
      this.state.broken.add(key);
      this.emit('error', { serverID: server.id, error });
      return undefined;
    }
  }

  /**
   * Check if there are any LSP clients for a file.
   */
  async hasClients(file: string): Promise<boolean> {
    const extension = path.extname(file) || file;

    for (const server of Object.values(this.state.servers)) {
      if (server.extensions.length && !server.extensions.includes(extension)) {
        continue;
      }

      const root = await server.root(file);
      if (!root) continue;

      const key = root + server.id;
      if (this.state.broken.has(key)) continue;

      return true;
    }

    return false;
  }

  /**
   * Touch a file to trigger diagnostics.
   */
  async touchFile(
    file: string,
    options?: { waitForDiagnostics?: boolean },
  ): Promise<void> {
    const clients = await this.getClients(file);

    await Promise.all(
      clients.map(async (client) => {
        const wait = options?.waitForDiagnostics
          ? client.waitForDiagnostics(file)
          : Promise.resolve();

        await client.openFile(file);
        return wait;
      }),
    ).catch((err) => {
      this.emit('error', { file, error: err });
    });
  }

  /**
   * Get all diagnostics from all clients.
   */
  async diagnostics(): Promise<Record<string, Diagnostic[]>> {
    const results: Record<string, Diagnostic[]> = {};

    for (const client of this.state.clients) {
      for (const [filePath, diags] of client.getDiagnostics().entries()) {
        const arr = results[filePath] || [];
        arr.push(...diags);
        results[filePath] = arr;
      }
    }

    return results;
  }

  /**
   * Get diagnostics for a specific file.
   */
  async diagnosticsForFile(file: string): Promise<Diagnostic[]> {
    const clients = await this.getClients(file);
    const results: Diagnostic[] = [];

    for (const client of clients) {
      const diags = client.getDiagnosticsForFile(file);
      if (diags) {
        results.push(...diags);
      }
    }

    return results;
  }

  /**
   * Get hover information for a position.
   */
  async hover(input: {
    file: string;
    line: number;
    character: number;
  }): Promise<unknown[]> {
    const clients = await this.getClients(input.file);

    return Promise.all(
      clients.map((client) =>
        client
          .sendRequest('textDocument/hover', {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      ),
    ).then((results) => results.filter(Boolean));
  }

  /**
   * Get symbol definitions.
   */
  async definition(input: {
    file: string;
    line: number;
    character: number;
  }): Promise<unknown[]> {
    const clients = await this.getClients(input.file);

    return Promise.all(
      clients.map((client) =>
        client
          .sendRequest('textDocument/definition', {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
          })
          .catch(() => null),
      ),
    ).then((results) => results.flat().filter(Boolean));
  }

  /**
   * Get symbol references.
   */
  async references(input: {
    file: string;
    line: number;
    character: number;
  }): Promise<unknown[]> {
    const clients = await this.getClients(input.file);

    return Promise.all(
      clients.map((client) =>
        client
          .sendRequest('textDocument/references', {
            textDocument: { uri: pathToFileURL(input.file).href },
            position: { line: input.line, character: input.character },
            context: { includeDeclaration: true },
          })
          .catch(() => []),
      ),
    ).then((results) => results.flat().filter(Boolean));
  }

  /**
   * Search workspace symbols.
   */
  async workspaceSymbol(query: string): Promise<LSPSymbol[]> {
    const tasks = this.state.clients.map((client) =>
      client
        .sendRequest<LSPSymbol[]>('workspace/symbol', { query })
        .then((result) => result.slice(0, 10))
        .catch(() => []),
    );

    return Promise.all(tasks).then((results) => results.flat());
  }

  /**
   * Get document symbols.
   */
  async documentSymbol(
    uri: string,
  ): Promise<Array<DocumentSymbol | LSPSymbol>> {
    const file = fileURLToPath(uri);
    const clients = await this.getClients(file);

    const tasks = clients.map((client) =>
      client
        .sendRequest<
          Array<DocumentSymbol | LSPSymbol>
        >('textDocument/documentSymbol', { textDocument: { uri } })
        .catch(() => []),
    );

    return Promise.all(tasks).then((results) => results.flat().filter(Boolean));
  }

  /**
   * Shutdown all clients.
   */
  async shutdown(): Promise<void> {
    await Promise.all(this.state.clients.map((client) => client.shutdown()));
    this.state.clients = [];
    this.state.spawning.clear();
    this.emit('shutdown');
  }
}

// Re-export types and functions
export type { Diagnostic } from './client.js';
export { formatDiagnostic } from './client.js';
export type { LSPServerInfo, LSPServerHandle } from './server.js';
export { LANGUAGE_EXTENSIONS, getLanguageId } from './language.js';
export type { LSPServerRegistry } from './registry.js';
export { createLSPServerRegistry } from './registry.js';
