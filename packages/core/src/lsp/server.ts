/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import type { LSPConfiguration } from './types.js';

export interface LSPServerHandle {
  process: ChildProcess;
  initialization: Record<string, unknown> | undefined;
}

export function createLSPServer(config: LSPConfiguration): LSPServerHandle {
  const process = spawn(config.command, config.args ?? [], {
    env: { ...global.process.env, ...config.env },
    stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
  });

  return {
    process,
    initialization: config.initializationOptions,
  };
}
