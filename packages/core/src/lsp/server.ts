/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import { LSPConfiguration } from './types.js';

export namespace LSPServer {
  export interface Handle {
    process: ChildProcess;
    initialization: Record<string, unknown> | undefined;
  }

  export function create(config: LSPConfiguration): Handle {
    const process = spawn(config.command, config.args ?? [], {
      env: { ...global.process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
    });

    return {
      process,
      initialization: config.initializationOptions,
    };
  }
}
