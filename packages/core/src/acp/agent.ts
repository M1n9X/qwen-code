/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Agent as ACPAgentInterface,
  type AgentSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type LoadSessionRequest,
  type AuthenticateRequest,
  type PromptRequest,
  type CancelNotification,
  type SetSessionModelRequest,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type AuthMethod,
} from '@agentclientprotocol/sdk';
import { randomUUID } from 'crypto';

import { ACPSessionManager } from './session.js';
import type { ACPConfig, Message } from './types.js';

// Simple logger fallback if needed
const log = {
  info: (msg: string, data?: unknown) => console.log(`[ACP] ${msg}`, data),
  error: (msg: string, data?: unknown) => console.error(`[ACP] ${msg}`, data),
  debug: (msg: string, data?: unknown) => console.debug(`[ACP] ${msg}`, data),
};

export async function init(config: ACPConfig) {
  return {
    create: (connection: AgentSideConnection) => new ACPAgent(connection, config),
  };
}

export class ACPAgent implements ACPAgentInterface {
  private connection: AgentSideConnection;
  private config: ACPConfig;

  constructor(connection: AgentSideConnection, config: ACPConfig) {
    this.connection = connection;
    this.config = config;
  }

  // Registry of active sessions
  private sessions = new Map<string, ACPSessionManager>();

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    log.info('initialize', { protocolVersion: params.protocolVersion });

    const authMethod: AuthMethod = {
      description: 'No authentication required',
      name: 'Default',
      id: 'default-auth',
    };

    return {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        mcpCapabilities: {
          http: true,
          sse: true,
        },
        promptCapabilities: {
          embeddedContext: true,
          image: true,
        },
      },
      authMethods: [authMethod],
      agentInfo: {
        name: 'Qwen Code',
        version: '0.7.0',
      },
    };
  }

  async authenticate(_params: AuthenticateRequest) {
    // No-op for now
    return { success: true };
  }

  async newSession(params: NewSessionRequest) {
    const sessionId = randomUUID();
    const directory = params.cwd || process.cwd();

    // Create new session manager
    const sessionManager = new ACPSessionManager(sessionId, this.config.config);
    this.sessions.set(sessionId, sessionManager);
    this.setupEventSubscriptions(sessionManager, sessionId);

    log.info('creating_session', {
      sessionId,
      mcpServers: params.mcpServers?.length,
    });

    return this.loadSessionMode({
      cwd: directory,
      mcpServers: params.mcpServers || [],
      sessionId,
    });
  }

  async loadSession(params: LoadSessionRequest) {
    const sessionId = params.sessionId;
    if (!this.sessions.has(sessionId)) {
      log.info('load_session_recreate', { sessionId });
      const sessionManager = new ACPSessionManager(
        sessionId,
        this.config.config,
      );
      this.sessions.set(sessionId, sessionManager);
      this.setupEventSubscriptions(sessionManager, sessionId);
    }

    return this.loadSessionMode(params);
  }

  async prompt(params: PromptRequest) {
    const sessionManager = this.sessions.get(params.sessionId);
    if (!sessionManager) throw new Error('Session not found');

    // This triggers the loop in sessionManager
    // Note: ACPSessionManager currently doesn't support streaming, so we wait for completion
    // But we have event listeners setup to relay messages as they are created.
    // Extract text from prompt parts
    const text = params.prompt
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p.text)
      .join('\n');

    await sessionManager.addUserMessage(text);
  }

  private setupEventSubscriptions(
    sessionManager: ACPSessionManager,
    sessionId: string,
  ) {
    sessionManager.on('message.created', async (message: Message) => {
      log.debug('message_created', message);

      if (message.role === 'assistant') {
        // Send text content
        if (message.content) {
          await this.connection
            .sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: message.content },
              },
            })
            .catch((err) => log.error('failed to send text update', err));
        }

        // Handle tool calls
        if (message.toolCalls) {
          for (const tc of message.toolCalls) {
            await this.connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: 'tool_call',
                  toolCallId: tc.id,
                  title: tc.name, // Use name as title for now
                  kind: 'call', // Simplified kind mapping
                  status: 'pending',
                  locations: [],
                  rawInput: tc.arguments,
                },
              })
              .catch((err) =>
                log.error('failed to send tool call pending', err),
              );

            // Since we don't have 'running' state in batch mode, we might want to send it immediately?
            // Or wait for result.
          }
        }
      } else if (message.role === 'tool') {
        // Send tool results
        if (message.toolResults) {
          for (const tr of message.toolResults) {
            const isError = tr.isError === true;
            await this.connection
              .sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: 'tool_call_update',
                  toolCallId: tr.toolCallId,
                  status: isError ? 'failed' : 'completed',
                  kind: 'call',
                  title: 'Tool Call', // Ideally we'd map this back to original call name
                  content: [
                    {
                      type: 'content',
                      content: { type: 'text', text: String(tr.result) },
                    },
                  ],
                  rawOutput: { output: tr.result },
                  rawInput: {}, // We don't have input here easily without tracking
                },
              })
              .catch((err) => log.error('failed to send tool result', err));
          }
        }
      }
    });

    sessionManager.on('state.changed', (state) => {
      log.info('state_changed', { sessionId, state });
      // We could map state to ACP status if needed
    });
  }

  async cancel(_params: CancelNotification) {
    // Implementation TODO
  }

  async setSessionModel(_params: SetSessionModelRequest) {
    // Implementation TODO
  }

  async setSessionMode(
    _params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse | void> {
    // Implementation TODO
  }

  async loadSessionMode(params: LoadSessionRequest) {
    // Mock data for initial implementation
    const availableModels = [{ modelId: 'mock/model', name: 'Mock Model' }];

    return {
      sessionId: params.sessionId,
      models: {
        currentModelId: 'mock/model',
        availableModels,
      },
      modes: {
        availableModes: [
          { id: 'default', name: 'Default', description: 'Default mode' },
        ],
        currentModeId: 'default',
      },
      _meta: {},
    };
  }
}
