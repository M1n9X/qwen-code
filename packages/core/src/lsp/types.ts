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
  TextDocumentContentChangeEvent,
  WorkspaceFolder,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
} from 'vscode-languageserver-types';

export interface LSPConfiguration {
  serverID: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  root: string;
  initializationOptions?: Record<string, unknown>;
}
