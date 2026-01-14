/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export specific types to avoid polluting the global namespace
export type {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
  Location,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
  WorkspaceFolder,
} from 'vscode-languageserver-types';

export type {
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  TextDocumentContentChangeEvent,
} from 'vscode-languageserver-protocol';

export interface LSPConfiguration {
  serverID: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  root: string;
  initializationOptions?: Record<string, unknown>;
}
