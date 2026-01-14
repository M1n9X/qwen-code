/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LSP Client Implementation.
 *
 * This module creates and manages connections to language servers,
 * handling initialization, diagnostics, and document synchronization.
 *
 * @module lsp/client
 */

import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import type { MessageConnection } from 'vscode-jsonrpc/node.js';

import { file as bunFile } from '../runtime/bun-adapter.js';
import { getLanguageId } from './language.js';
import type { LSPServerHandle } from './server.js';

const DIAGNOSTICS_DEBOUNCE_MS = 150;
const INITIALIZE_TIMEOUT_MS = 45_000;
const DIAGNOSTICS_TIMEOUT_MS = 3_000;

/**
 * LSP Diagnostic interface.
 */
export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: 1 | 2 | 3 | 4; // Error, Warning, Info, Hint
  code?: string | number;
  source?: string;
}

/**
 * Events emitted by LSP Client.
 */
export interface LSPClientEvents {
  diagnostics: {
    serverID: string;
    path: string;
    diagnostics: Diagnostic[];
  };
  error: Error;
  initialized: void;
  shutdown: void;
}

/**
 * LSP Client options.
 */
export interface LSPClientOptions {
  serverID: string;
  server: LSPServerHandle;
  root: string;
}

/**
 * LSP Client class for managing language server connections.
 */
export class LSPClient extends EventEmitter {
  private connection: MessageConnection;
  private diagnosticsMap: Map<string, Diagnostic[]> = new Map();
  private fileVersions: Map<string, number> = new Map();
  private serverID: string;
  private root: string;
  private server: LSPServerHandle;

  /**
   * Create a new LSP client.
   */
  constructor(options: LSPClientOptions) {
    super();
    this.serverID = options.serverID;
    this.root = options.root;
    this.server = options.server;

    this.connection = createMessageConnection(
      new StreamMessageReader(this.server.process.stdout!),
      new StreamMessageWriter(this.server.process.stdin!),
    );

    this.setupNotificationHandlers();
  }

  /**
   * Get the server ID.
   */
  getServerID(): string {
    return this.serverID;
  }

  /**
   * Get the project root.
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * Get the underlying connection.
   */
  getConnection(): MessageConnection {
    return this.connection;
  }

  /**
   * Set up LSP notification handlers.
   */
  private setupNotificationHandlers(): void {
    // Handle diagnostics
    this.connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: { uri: string; diagnostics: Diagnostic[] }) => {
        const filePath = this.normalizePath(fileURLToPath(params.uri));
        const exists = this.diagnosticsMap.has(filePath);
        this.diagnosticsMap.set(filePath, params.diagnostics);

        // Don't emit for typescript on first diagnostic
        // (wait for full diagnostics)
        if (!exists && this.serverID === 'typescript') return;

        this.emit('diagnostics', {
          serverID: this.serverID,
          path: filePath,
          diagnostics: params.diagnostics,
        });
      },
    );

    // Handle work done progress
    this.connection.onRequest('window/workDoneProgress/create', () => null);

    // Handle configuration requests
    this.connection.onRequest('workspace/configuration', async () => [
      this.server.initialization ?? {},
    ]);

    // Handle capability registration
    this.connection.onRequest('client/registerCapability', async () => {});
    this.connection.onRequest('client/unregisterCapability', async () => {});

    // Handle workspace folders request
    this.connection.onRequest('workspace/workspaceFolders', async () => [
      {
        name: 'workspace',
        uri: pathToFileURL(this.root).href,
      },
    ]);

    this.connection.listen();
  }

  /**
   * Normalize file path.
   */
  private normalizePath(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Initialize the LSP connection.
   */
  async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href;

    await this.withTimeout(
      this.connection.sendRequest('initialize', {
        rootUri,
        processId: this.server.process.pid,
        workspaceFolders: [
          {
            name: 'workspace',
            uri: rootUri,
          },
        ],
        initializationOptions: {
          ...this.server.initialization,
        },
        capabilities: {
          window: {
            workDoneProgress: true,
          },
          workspace: {
            configuration: true,
            didChangeWatchedFiles: {
              dynamicRegistration: true,
            },
          },
          textDocument: {
            synchronization: {
              didOpen: true,
              didChange: true,
            },
            publishDiagnostics: {
              versionSupport: true,
            },
          },
        },
      }),
      INITIALIZE_TIMEOUT_MS,
    );

    await this.connection.sendNotification('initialized', {});

    if (this.server.initialization) {
      await this.connection.sendNotification(
        'workspace/didChangeConfiguration',
        {
          settings: this.server.initialization,
        },
      );
    }

    this.emit('initialized');
  }

  /**
   * Open a file in the language server.
   */
  async openFile(filePath: string): Promise<void> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    const uri = pathToFileURL(absPath).href;
    const extension = path.extname(absPath);
    const languageId = getLanguageId(extension);

    // Read file content
    const f = bunFile(absPath);
    const text = await f.text();

    const existingVersion = this.fileVersions.get(absPath);

    if (existingVersion !== undefined) {
      // File already open - send change notification
      await this.connection.sendNotification(
        'workspace/didChangeWatchedFiles',
        {
          changes: [{ uri, type: 2 }], // Changed
        },
      );

      const nextVersion = existingVersion + 1;
      this.fileVersions.set(absPath, nextVersion);

      await this.connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: nextVersion },
        contentChanges: [{ text }],
      });
      return;
    }

    // File not yet open - send open notification
    await this.connection.sendNotification('workspace/didChangeWatchedFiles', {
      changes: [{ uri, type: 1 }], // Created
    });

    this.diagnosticsMap.delete(absPath);

    await this.connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 0,
        text,
      },
    });

    this.fileVersions.set(absPath, 0);
  }

  /**
   * Wait for diagnostics to be published for a file.
   */
  async waitForDiagnostics(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(
      path.isAbsolute(filePath) ? filePath : path.resolve(this.root, filePath),
    );

    return new Promise<void>((resolve) => {
      let debounceTimer: NodeJS.Timeout | undefined;

      const handler = (event: LSPClientEvents['diagnostics']) => {
        if (event.path === normalizedPath && event.serverID === this.serverID) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.removeListener('diagnostics', handler);
            resolve();
          }, DIAGNOSTICS_DEBOUNCE_MS);
        }
      };

      this.on('diagnostics', handler);

      // Timeout after DIAGNOSTICS_TIMEOUT_MS
      setTimeout(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        this.removeListener('diagnostics', handler);
        resolve();
      }, DIAGNOSTICS_TIMEOUT_MS);
    });
  }

  /**
   * Get all diagnostics.
   */
  getDiagnostics(): Map<string, Diagnostic[]> {
    return this.diagnosticsMap;
  }

  /**
   * Get diagnostics for a specific file.
   */
  getDiagnosticsForFile(filePath: string): Diagnostic[] | undefined {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    return this.diagnosticsMap.get(this.normalizePath(absPath));
  }

  /**
   * Send a request to the language server.
   */
  async sendRequest<T>(method: string, params: unknown): Promise<T> {
    return this.connection.sendRequest(method, params);
  }

  /**
   * Shutdown the LSP client.
   */
  async shutdown(): Promise<void> {
    try {
      await this.connection.sendRequest('shutdown');
      await this.connection.sendNotification('exit');
    } catch {
      // Server may have already exited
    } finally {
      this.connection.end();
      this.connection.dispose();
      this.server.process.kill();
      this.emit('shutdown');
    }
  }

  /**
   * Helper to add timeout to a promise.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }
}

/**
 * Create an LSP client and initialize it.
 */
export async function createLSPClient(
  options: LSPClientOptions,
): Promise<LSPClient> {
  const client = new LSPClient(options);
  await client.initialize();
  return client;
}

/**
 * Format a diagnostic for display.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
  const severityMap: Record<number, string> = {
    1: 'ERROR',
    2: 'WARN',
    3: 'INFO',
    4: 'HINT',
  };

  const severity = severityMap[diagnostic.severity ?? 1] ?? 'ERROR';
  const line = diagnostic.range.start.line + 1;
  const col = diagnostic.range.start.character + 1;

  return `${severity} [${line}:${col}] ${diagnostic.message}`;
}
