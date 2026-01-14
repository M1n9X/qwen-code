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
import {
  type ACPConfig,
  type Message,
  type ACPState,
  type ACPCapabilities,
  type AgentState,
  ACPStateMachine,
} from './types.js';

/**
 * Chunk types for streaming prompt responses.
 */
export type PromptChunk =
  | { type: 'text'; text: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      toolCallId: string;
      result: string;
      isError?: boolean;
    };

// Simple logger fallback if needed
const log = {
  info: (msg: string, data?: unknown) => console.log(`[ACP] ${msg}`, data),
  error: (msg: string, data?: unknown) => console.error(`[ACP] ${msg}`, data),
  debug: (msg: string, data?: unknown) => console.debug(`[ACP] ${msg}`, data),
};

export async function init(config: ACPConfig) {
  return {
    create: (connection: AgentSideConnection) =>
      new ACPAgent(connection, config),
  };
}

export class ACPAgent implements ACPAgentInterface {
  private connection: AgentSideConnection;
  private config: ACPConfig;
  private stateMachine: ACPStateMachine;
  private capabilities: ACPCapabilities;

  constructor(connection: AgentSideConnection, config: ACPConfig) {
    this.connection = connection;
    this.config = config;
    this.stateMachine = new ACPStateMachine();
    this.capabilities = {
      tools: [],
      streaming: true,
      multiTurn: true,
      contextWindow: 128000, // Default, will be updated based on model
    };
  }

  // Registry of active sessions
  private sessions = new Map<string, ACPSessionManager>();

  /**
   * Gets the current state of the ACP agent.
   */
  getState(): ACPState {
    return this.stateMachine.currentState;
  }

  /**
   * Gets the capabilities of the ACP agent.
   */
  getCapabilities(): ACPCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Checks if the agent is ready to process prompts.
   */
  isReady(): boolean {
    return this.stateMachine.isReady();
  }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    log.info('initialize', { protocolVersion: params.protocolVersion });

    // Transition state machine
    if (this.stateMachine.currentState === 'uninitialized') {
      this.stateMachine.transition('initialize');
    }

    try {
      // Update capabilities based on available tools
      const toolRegistry = this.config.config.getToolRegistry();
      const tools = toolRegistry.getAllTools();
      this.capabilities.tools = tools.map((t) => t.name);

      const authMethod: AuthMethod = {
        description: 'No authentication required',
        name: 'Default',
        id: 'default-auth',
      };

      // Transition to ready state
      this.stateMachine.transition('initialized');

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
    } catch (err) {
      this.stateMachine.transition('error');
      throw err;
    }
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

    // Transition to processing state if ready
    if (this.stateMachine.isReady()) {
      this.stateMachine.transition('prompt');
    }

    try {
      // Extract text from prompt parts
      const text = params.prompt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.text)
        .join('\n');

      await sessionManager.addUserMessage(text);

      // Transition back to ready state
      if (this.stateMachine.isProcessing()) {
        this.stateMachine.transition('complete');
      }
    } catch (err) {
      if (this.stateMachine.canTransition('error')) {
        this.stateMachine.transition('error');
      }
      throw err;
    }
  }

  /**
   * Streaming prompt handler that yields chunks as they are generated.
   * This is an AsyncGenerator version of prompt() for streaming responses.
   *
   * @param params - The prompt request parameters
   * @yields PromptChunk objects containing text or tool call updates
   */
  async *promptStream(params: PromptRequest): AsyncGenerator<PromptChunk> {
    const sessionManager = this.sessions.get(params.sessionId);
    if (!sessionManager) throw new Error('Session not found');

    // Transition to processing state if ready
    if (this.stateMachine.isReady()) {
      this.stateMachine.transition('prompt');
    }

    // Create a queue to collect chunks from event handlers
    const chunkQueue: Array<PromptChunk | { done: true } | { error: Error }> =
      [];
    let resolveWait: (() => void) | null = null;

    const pushChunk = (
      chunk: PromptChunk | { done: true } | { error: Error },
    ) => {
      chunkQueue.push(chunk);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    // Set up temporary event listeners for streaming
    const onMessage = (message: Message) => {
      if (message.role === 'assistant') {
        if (message.content) {
          pushChunk({ type: 'text', text: message.content });
        }
        if (message.toolCalls) {
          for (const tc of message.toolCalls) {
            pushChunk({
              type: 'tool_call',
              toolCallId: tc.id,
              toolName: tc.name,
              arguments: tc.arguments,
            });
          }
        }
      } else if (message.role === 'tool' && message.toolResults) {
        for (const tr of message.toolResults) {
          pushChunk({
            type: 'tool_result',
            toolCallId: tr.toolCallId,
            result: String(tr.result),
            isError: tr.isError,
          });
        }
      }
    };

    const onStateChanged = (state: AgentState) => {
      if (state === 'completed') {
        pushChunk({ done: true });
      } else if (state === 'error') {
        pushChunk({ error: new Error('Session processing failed') });
      }
    };

    const onError = (err: Error) => {
      pushChunk({ error: err });
    };

    sessionManager.on('message.created', onMessage);
    sessionManager.on('state.changed', onStateChanged);
    sessionManager.on('error', onError);

    try {
      // Extract text from prompt parts
      const text = params.prompt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.text)
        .join('\n');

      // Start processing (don't await - we'll yield chunks as they come)
      const processPromise = sessionManager.addUserMessage(text);

      // Yield chunks as they arrive
      while (true) {
        if (chunkQueue.length === 0) {
          // Wait for next chunk
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
          });
        }

        const chunk = chunkQueue.shift();
        if (!chunk) continue;

        if ('done' in chunk) {
          break;
        }
        if ('error' in chunk) {
          throw chunk.error;
        }

        yield chunk;
      }

      // Ensure processing is complete
      await processPromise;

      // Transition back to ready state
      if (this.stateMachine.isProcessing()) {
        this.stateMachine.transition('complete');
      }
    } catch (err) {
      if (this.stateMachine.canTransition('error')) {
        this.stateMachine.transition('error');
      }
      throw err;
    } finally {
      // Clean up listeners
      sessionManager.off('message.created', onMessage);
      sessionManager.off('state.changed', onStateChanged);
      sessionManager.off('error', onError);
    }
  }

  /**
   * Processes a message through the agent pipeline.
   * This is a lower-level method for direct message processing.
   *
   * @param sessionId - The session ID
   * @param message - The message to process
   */
  async processMessage(sessionId: string, message: Message): Promise<void> {
    const sessionManager = this.sessions.get(sessionId);
    if (!sessionManager) throw new Error('Session not found');

    if (message.role === 'user') {
      await sessionManager.addUserMessage(message.content);
    }
    // Other message types can be handled as needed
  }

  setupEventSubscriptions(
    sessionManager: ACPSessionManager,
    sessionId: string,
  ): void {
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
          // Transition to waiting_for_tool state
          if (this.stateMachine.canTransition('tool_call')) {
            this.stateMachine.transition('tool_call');
          }

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
        // Transition back to processing after tool result
        if (this.stateMachine.canTransition('tool_result')) {
          this.stateMachine.transition('tool_result');
        }

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

  /**
   * Shuts down the agent gracefully.
   */
  async shutdown(): Promise<void> {
    if (this.stateMachine.canTransition('shutdown')) {
      this.stateMachine.transition('shutdown');
    }

    // Clean up all sessions
    for (const [sessionId, session] of this.sessions) {
      log.info('closing_session', { sessionId });
      session.removeAllListeners();
    }
    this.sessions.clear();
  }
}
