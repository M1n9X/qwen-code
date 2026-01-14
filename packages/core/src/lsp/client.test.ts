/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import {
  LSPClient,
  LSPClientConfigSchema,
  formatDiagnostic,
  type LSPClientOptions,
  type Diagnostic,
} from './client.js';

import type { LSPServerHandle } from './server.js';

// Mock the dependencies
vi.mock('vscode-jsonrpc/node.js', () => ({
  createMessageConnection: vi.fn(() => ({
    sendRequest: vi.fn().mockResolvedValue({}),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn(),
    onRequest: vi.fn(),
    listen: vi.fn(),
    end: vi.fn(),
    dispose: vi.fn(),
  })),
  StreamMessageReader: vi.fn(),
  StreamMessageWriter: vi.fn(),
}));

vi.mock('../runtime/bun-adapter.js', () => ({
  file: vi.fn(() => ({
    text: vi.fn().mockResolvedValue('test content'),
  })),
}));

vi.mock('./language.js', () => ({
  getLanguageId: vi.fn(() => 'typescript'),
}));

/**
 * Create a mock LSP server handle for testing.
 */
function createMockServerHandle(): LSPServerHandle {
  const processEmitter = new EventEmitter();
  return {
    process: Object.assign(processEmitter, {
      stdout: { pipe: vi.fn() },
      stdin: { write: vi.fn() },
      stderr: { pipe: vi.fn() },
      pid: 12345,
      killed: false,
      kill: vi.fn(),
      // Add missing ChildProcess properties
      stdio: [null, null, null, null, null],
      connected: false,
      exitCode: null,
      signalCode: null,
      spawnargs: [],
      spawnfile: '',
      send: vi.fn(),
      disconnect: vi.fn(),
      unref: vi.fn(),
      ref: vi.fn(),
      channel: undefined,
    }),
    initialization: {},
  } as unknown as LSPServerHandle;
}

describe('LSPClientConfigSchema', () => {
  it('should validate valid configuration', () => {
    const config = {
      serverID: 'typescript',
      root: '/path/to/project',
    };

    const result = LSPClientConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject empty serverID', () => {
    const config = {
      serverID: '',
      root: '/path/to/project',
    };

    const result = LSPClientConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Server ID is required');
    }
  });

  it('should reject empty root', () => {
    const config = {
      serverID: 'typescript',
      root: '',
    };

    const result = LSPClientConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Root path is required');
    }
  });

  it('should validate optional capabilities', () => {
    const config = {
      serverID: 'typescript',
      root: '/path/to/project',
      capabilities: { textDocument: { completion: true } },
    };

    const result = LSPClientConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate maxRestartAttempts within range', () => {
    const validConfig = {
      serverID: 'typescript',
      root: '/path/to/project',
      maxRestartAttempts: 5,
    };

    expect(LSPClientConfigSchema.safeParse(validConfig).success).toBe(true);

    const invalidConfig = {
      serverID: 'typescript',
      root: '/path/to/project',
      maxRestartAttempts: 15, // exceeds max of 10
    };

    expect(LSPClientConfigSchema.safeParse(invalidConfig).success).toBe(false);
  });

  it('should validate restartDelayMs within range', () => {
    const validConfig = {
      serverID: 'typescript',
      root: '/path/to/project',
      restartDelayMs: 1000,
    };

    expect(LSPClientConfigSchema.safeParse(validConfig).success).toBe(true);

    const invalidConfig = {
      serverID: 'typescript',
      root: '/path/to/project',
      restartDelayMs: 50, // below min of 100
    };

    expect(LSPClientConfigSchema.safeParse(invalidConfig).success).toBe(false);
  });
});

describe('LSPClient', () => {
  let mockServer: ReturnType<typeof createMockServerHandle>;
  let clientOptions: LSPClientOptions;

  beforeEach(() => {
    mockServer = createMockServerHandle();
    clientOptions = {
      serverID: 'typescript',
      server: mockServer,
      root: '/test/project',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid options', () => {
      const client = new LSPClient(clientOptions);
      expect(client.getServerID()).toBe('typescript');
      expect(client.getRoot()).toBe('/test/project');
    });

    it('should throw ZodError for invalid options', () => {
      const invalidOptions = {
        serverID: '',
        server: mockServer,
        root: '/test/project',
      };

      expect(() => new LSPClient(invalidOptions)).toThrow(z.ZodError);
    });

    it('should use default restart settings', () => {
      const client = new LSPClient(clientOptions);
      expect(client.isRunning()).toBe(true);
    });

    it('should accept custom restart settings', () => {
      const customOptions = {
        ...clientOptions,
        maxRestartAttempts: 3,
        restartDelayMs: 500,
      };

      const client = new LSPClient(customOptions);
      expect(client.getServerID()).toBe('typescript');
    });
  });

  describe('getServerID', () => {
    it('should return the server ID', () => {
      const client = new LSPClient(clientOptions);
      expect(client.getServerID()).toBe('typescript');
    });
  });

  describe('getRoot', () => {
    it('should return the project root', () => {
      const client = new LSPClient(clientOptions);
      expect(client.getRoot()).toBe('/test/project');
    });
  });

  describe('isRunning', () => {
    it('should return true when server is running', () => {
      const client = new LSPClient(clientOptions);
      expect(client.isRunning()).toBe(true);
    });

    it('should return false when server is killed', () => {
      const client = new LSPClient(clientOptions);
      (mockServer.process as { killed: boolean }).killed = true;
      expect(client.isRunning()).toBe(false);
    });
  });

  describe('getDiagnostics', () => {
    it('should return empty map initially', () => {
      const client = new LSPClient(clientOptions);
      const diagnostics = client.getDiagnostics();
      expect(diagnostics.size).toBe(0);
    });
  });

  describe('getDiagnosticsForFile', () => {
    it('should return undefined for unknown file', () => {
      const client = new LSPClient(clientOptions);
      const diagnostics = client.getDiagnosticsForFile('/unknown/file.ts');
      expect(diagnostics).toBeUndefined();
    });
  });
});

describe('formatDiagnostic', () => {
  it('should format error diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 10, character: 5 },
        end: { line: 10, character: 15 },
      },
      message: 'Type error',
      severity: 1,
    };

    const formatted = formatDiagnostic(diagnostic);
    expect(formatted).toBe('ERROR [11:6] Type error');
  });

  it('should format warning diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 5, character: 0 },
        end: { line: 5, character: 10 },
      },
      message: 'Unused variable',
      severity: 2,
    };

    const formatted = formatDiagnostic(diagnostic);
    expect(formatted).toBe('WARN [6:1] Unused variable');
  });

  it('should format info diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      message: 'Info message',
      severity: 3,
    };

    const formatted = formatDiagnostic(diagnostic);
    expect(formatted).toBe('INFO [1:1] Info message');
  });

  it('should format hint diagnostic', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 2, character: 3 },
        end: { line: 2, character: 8 },
      },
      message: 'Consider refactoring',
      severity: 4,
    };

    const formatted = formatDiagnostic(diagnostic);
    expect(formatted).toBe('HINT [3:4] Consider refactoring');
  });

  it('should default to ERROR for missing severity', () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      message: 'Unknown issue',
    };

    const formatted = formatDiagnostic(diagnostic);
    expect(formatted).toBe('ERROR [1:1] Unknown issue');
  });
});
