/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  MessageConnection,
} from 'vscode-jsonrpc/node';
import { LSPServer } from './server.js';
import { Diagnostic, LSPConfiguration } from './types.js';

export class LSPClient extends EventEmitter {
  private connection: MessageConnection;
  private diagnostics: Map<string, Diagnostic[]> = new Map();
  private serverID: string;
  private root: string;

  constructor(
    private server: LSPServer.Handle,
    private config: LSPConfiguration
  ) {
    super();
    this.serverID = config.serverID;
    this.root = config.root;

    this.connection = createMessageConnection(
      new StreamMessageReader(this.server.process.stdout!),
      new StreamMessageWriter(this.server.process.stdin!)
    );

    this.setupNotificationHandlers();
  }

  private setupNotificationHandlers() {
    this.connection.onNotification('textDocument/publishDiagnostics', (params) => {
      const filePath = fileURLToPath(params.uri);
      this.diagnostics.set(filePath, params.diagnostics);
      this.emit('diagnostics', {
        serverID: this.serverID,
        path: filePath,
        diagnostics: params.diagnostics,
      });
    });

    this.connection.onRequest('window/workDoneProgress/create', () => null);
    
    this.connection.onRequest('workspace/configuration', async () => {
      return [this.server.initialization ?? {}];
    });

    this.connection.listen();
  }

  public async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href;

    await this.connection.sendRequest('initialize', {
      rootUri,
      processId: process.pid,
      workspaceFolders: [
        {
          name: 'workspace',
          uri: rootUri,
        },
      ],
      initializationOptions: this.server.initialization,
      capabilities: {
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
    });

    await this.connection.sendNotification('initialized', {});
  }

  public async open(filePath: string, content: string): Promise<void> {
    const absPath = path.resolve(this.root, filePath);
    const uri = pathToFileURL(absPath).href;

    await this.connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'plaintext', // TODO: Detector
        version: 1,
        text: content,
      },
    });
  }

  public async shutdown(): Promise<void> {
    await this.connection.sendRequest('shutdown');
    await this.connection.sendNotification('exit');
    this.connection.dispose();
    this.server.process.kill();
  }

  public getDiagnostics(filePath: string): Diagnostic[] | undefined {
     return this.diagnostics.get(path.resolve(this.root, filePath));
  }
}
