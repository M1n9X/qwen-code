/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';

export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export class McpManager extends EventEmitter {
  private configPath: string;
  private servers: Map<string, ChildProcess> = new Map();

  constructor(configDir: string) {
    super();
    this.configPath = path.join(configDir, 'mcp.json');
  }

  async loadConfig(): Promise<McpConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { mcpServers: {} };
    }
  }

  async saveConfig(config: McpConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async addServer(name: string, config: McpServerConfig): Promise<void> {
    const current = await this.loadConfig();
    current.mcpServers[name] = config;
    await this.saveConfig(current);
    this.emit('server.added', name);
  }

  async removeServer(name: string): Promise<void> {
    const current = await this.loadConfig();
    if (current.mcpServers[name]) {
      delete current.mcpServers[name];
      await this.saveConfig(current);
      this.emit('server.removed', name);
    }
  }

  async startServer(name: string): Promise<void> {
    const config = await this.loadConfig();
    const serverConfig = config.mcpServers[name];
    if (!serverConfig) throw new Error(`Server ${name} not found`);

    if (this.servers.has(name)) return; // Already running

    const process = spawn(serverConfig.command, serverConfig.args, {
      env: { ...global.process.env, ...serverConfig.env },
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.servers.set(name, process);
    this.emit('server.started', name);
  }

  stopServer(name: string): void {
    const process = this.servers.get(name);
    if (process) {
      process.kill();
      this.servers.delete(name);
      this.emit('server.stopped', name);
    }
  }

  listServers(): string[] {
    return Array.from(this.servers.keys());
  }
}
