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
 * Features:
 * - Zod schema validation for configuration
 * - Auto-restart on server crash with exponential backoff
 * - LSP navigation methods (definition, references, hover)
 * - Diagnostics event handling
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
import { z } from 'zod';

import { file as bunFile } from '../runtime/bun-adapter.js';
import { getLanguageId } from './language.js';
import type { LSPServerHandle, LSPServerInfo } from './server.js';

const DIAGNOSTICS_DEBOUNCE_MS = 150;
const INITIALIZE_TIMEOUT_MS = 45_000;
const DIAGNOSTICS_TIMEOUT_MS = 3_000;

/** Maximum restart attempts before giving up */
const MAX_RESTART_ATTEMPTS = 5;
/** Base delay for exponential backoff (ms) */
const RESTART_BASE_DELAY_MS = 1000;
/** Maximum delay between restart attempts (ms) */
const RESTART_MAX_DELAY_MS = 30_000;

/**
 * Zod schema for LSP client configuration validation.
 * Validates: Requirements 3.1
 */
export const LSPClientConfigSchema = z.object({
  serverID: z.string().min(1, 'Server ID is required'),
  root: z.string().min(1, 'Root path is required'),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  maxRestartAttempts: z.number().int().min(0).max(10).optional(),
  restartDelayMs: z.number().int().min(100).max(60_000).optional(),
});

export type LSPClientConfig = z.infer<typeof LSPClientConfigSchema>;

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
 * LSP Location interface for navigation results.
 */
export interface LSPLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * LSP Position interface.
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * LSP Hover result interface.
 */
export interface HoverResult {
  contents:
    | string
    | { kind: string; value: string }
    | Array<string | { kind: string; value: string }>;
  range?: {
    start: Position;
    end: Position;
  };
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
  restarting: { attempt: number; maxAttempts: number };
  restarted: void;
  restartFailed: { error: Error; attempts: number };
}

/**
 * LSP Client options.
 */
export interface LSPClientOptions {
  serverID: string;
  server: LSPServerHandle;
  root: string;
  /** Server info for restart capability */
  serverInfo?: LSPServerInfo;
  /** Maximum restart attempts (default: 5) */
  maxRestartAttempts?: number;
  /** Base delay for restart backoff in ms (default: 1000) */
  restartDelayMs?: number;
}

/**
 * LSP Client class for managing language server connections.
 *
 * Features:
 * - Automatic restart on server crash with exponential backoff
 * - Diagnostics event handling
 * - Navigation methods (definition, references, hover)
 */
export class LSPClient extends EventEmitter {
  private connection: MessageConnection;
  private diagnosticsMap: Map<string, Diagnostic[]> = new Map();
  private fileVersions: Map<string, number> = new Map();
  private serverID: string;
  private root: string;
  private server: LSPServerHandle;
  private serverInfo?: LSPServerInfo;
  private maxRestartAttempts: number;
  private restartDelayMs: number;
  private restartAttempts = 0;
  private isShuttingDown = false;
  private isRestarting = false;

  /**
   * Create a new LSP client.
   * @throws {z.ZodError} If options fail validation
   */
  constructor(options: LSPClientOptions) {
    super();

    // Validate configuration using Zod schema
    const validatedConfig = LSPClientConfigSchema.parse({
      serverID: options.serverID,
      root: options.root,
      maxRestartAttempts: options.maxRestartAttempts,
      restartDelayMs: options.restartDelayMs,
    });

    this.serverID = validatedConfig.serverID;
    this.root = validatedConfig.root;
    this.server = options.server;
    this.serverInfo = options.serverInfo;
    this.maxRestartAttempts =
      options.maxRestartAttempts ?? MAX_RESTART_ATTEMPTS;
    this.restartDelayMs = options.restartDelayMs ?? RESTART_BASE_DELAY_MS;

    this.connection = createMessageConnection(
      new StreamMessageReader(this.server.process.stdout!),
      new StreamMessageWriter(this.server.process.stdin!),
    );

    this.setupNotificationHandlers();
    this.setupProcessMonitoring();
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
   * Set up process monitoring for auto-restart on crash.
   * Implements: Requirements 3.3
   */
  private setupProcessMonitoring(): void {
    this.server.process.on('exit', (code, signal) => {
      // Don't restart if we're intentionally shutting down
      if (this.isShuttingDown || this.isRestarting) return;

      const error = new Error(
        `LSP server ${this.serverID} exited unexpectedly (code: ${code}, signal: ${signal})`,
      );
      this.emit('error', error);

      // Attempt restart if we have server info and haven't exceeded max attempts
      if (this.serverInfo && this.restartAttempts < this.maxRestartAttempts) {
        this.attemptRestart().catch((restartError) => {
          this.emit('restartFailed', {
            error: restartError as Error,
            attempts: this.restartAttempts,
          });
        });
      }
    });

    this.server.process.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Attempt to restart the LSP server with exponential backoff.
   * Implements: Requirements 3.3
   */
  private async attemptRestart(): Promise<void> {
    if (!this.serverInfo) {
      throw new Error('Cannot restart: server info not available');
    }

    this.isRestarting = true;
    this.restartAttempts++;

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.restartDelayMs * Math.pow(2, this.restartAttempts - 1),
      RESTART_MAX_DELAY_MS,
    );

    this.emit('restarting', {
      attempt: this.restartAttempts,
      maxAttempts: this.maxRestartAttempts,
    });

    // Wait before attempting restart
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      // Clean up old connection
      try {
        this.connection.end();
        this.connection.dispose();
      } catch {
        // Ignore cleanup errors
      }

      // Spawn new server
      const newHandle = await this.serverInfo.spawn(this.root);
      if (!newHandle) {
        throw new Error('Failed to spawn new server instance');
      }

      this.server = newHandle;

      // Create new connection
      this.connection = createMessageConnection(
        new StreamMessageReader(this.server.process.stdout!),
        new StreamMessageWriter(this.server.process.stdin!),
      );

      this.setupNotificationHandlers();
      this.setupProcessMonitoring();

      // Re-initialize
      await this.initialize();

      // Re-open all previously opened files
      const filesToReopen = Array.from(this.fileVersions.keys());
      this.fileVersions.clear();
      for (const filePath of filesToReopen) {
        await this.openFile(filePath);
      }

      // Reset restart counter on successful restart
      this.restartAttempts = 0;
      this.isRestarting = false;
      this.emit('restarted');
    } catch (error) {
      this.isRestarting = false;

      // If we haven't exceeded max attempts, try again
      if (this.restartAttempts < this.maxRestartAttempts) {
        return this.attemptRestart();
      }

      throw error;
    }
  }

  /**
   * Manually restart the LSP server.
   * Implements: Requirements 3.3
   */
  async restart(): Promise<void> {
    if (!this.serverInfo) {
      throw new Error('Cannot restart: server info not available');
    }

    this.restartAttempts = 0;
    this.isShuttingDown = false;

    // Kill current server
    try {
      this.server.process.kill();
    } catch {
      // Ignore if already dead
    }

    return this.attemptRestart();
  }

  /**
   * Check if the LSP server is running.
   */
  isRunning(): boolean {
    return !this.server.process.killed && !this.isShuttingDown;
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
   * Get definition locations for a symbol at a position.
   * Implements: Requirements 3.4
   *
   * @param filePath - Path to the file
   * @param position - Position in the file (0-indexed line and character)
   * @returns Array of locations where the symbol is defined
   */
  async getDefinition(
    filePath: string,
    position: Position,
  ): Promise<LSPLocation[]> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    const uri = pathToFileURL(absPath).href;

    try {
      const result = await this.connection.sendRequest<
        LSPLocation | LSPLocation[] | null
      >('textDocument/definition', {
        textDocument: { uri },
        position,
      });

      if (!result) return [];
      return Array.isArray(result) ? result : [result];
    } catch {
      return [];
    }
  }

  /**
   * Get all references to a symbol at a position.
   * Implements: Requirements 3.5
   *
   * @param filePath - Path to the file
   * @param position - Position in the file (0-indexed line and character)
   * @param includeDeclaration - Whether to include the declaration in results
   * @returns Array of locations where the symbol is referenced
   */
  async getReferences(
    filePath: string,
    position: Position,
    includeDeclaration = true,
  ): Promise<LSPLocation[]> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    const uri = pathToFileURL(absPath).href;

    try {
      const result = await this.connection.sendRequest<LSPLocation[] | null>(
        'textDocument/references',
        {
          textDocument: { uri },
          position,
          context: { includeDeclaration },
        },
      );

      return result ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Get hover information for a position.
   * Implements: Requirements 3.6
   *
   * @param filePath - Path to the file
   * @param position - Position in the file (0-indexed line and character)
   * @returns Hover result with contents, or null if no hover info available
   */
  async getHover(
    filePath: string,
    position: Position,
  ): Promise<HoverResult | null> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.root, filePath);
    const uri = pathToFileURL(absPath).href;

    try {
      const result = await this.connection.sendRequest<HoverResult | null>(
        'textDocument/hover',
        {
          textDocument: { uri },
          position,
        },
      );

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Register a handler for diagnostics events.
   * Implements: Requirements 3.2
   *
   * @param handler - Callback function to handle diagnostics
   * @returns Function to unregister the handler
   */
  onDiagnostics(
    handler: (uri: string, diagnostics: Diagnostic[]) => void,
  ): () => void {
    const wrappedHandler = (event: LSPClientEvents['diagnostics']) => {
      handler(pathToFileURL(event.path).href, event.diagnostics);
    };

    this.on('diagnostics', wrappedHandler);
    return () => this.removeListener('diagnostics', wrappedHandler);
  }

  /**
   * Shutdown the LSP client.
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
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
