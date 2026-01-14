/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

// Basic types for the Agent Client Protocol (ACP)
// These define the structure of messages and tool calls within the agent loop.

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export type AgentState = 'pending' | 'running' | 'completed' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
}

// Phase 4 additions
import type { Model } from '../provider/types.js';
import type { Config as CoreConfig } from '../config/config.js';

export interface ACPConfig {
  sdk: {
    config: CoreConfig;
  };
  defaultModel?: {
    modelID: string;
    providerID: string;
  };
  config: CoreConfig;
}

export interface ACPSessionState {
  id: string;
  cwd: string;
  mcpServers: unknown[]; // Precise type can be refined
  model: Model;
  summary?: string;
  pinnedMessageIds?: string[];
}

/**
 * ACP State Machine Types
 * Defines all possible states and valid transitions for the ACP agent.
 */

/**
 * All possible states for the ACP agent.
 */
export type ACPState =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'processing'
  | 'waiting_for_tool'
  | 'error'
  | 'shutdown';

/**
 * Events that can trigger state transitions.
 */
export type ACPEvent =
  | 'initialize'
  | 'initialized'
  | 'prompt'
  | 'tool_call'
  | 'tool_result'
  | 'complete'
  | 'error'
  | 'shutdown'
  | 'reset';

/**
 * Capabilities exposed by the ACP agent.
 */
export interface ACPCapabilities {
  /** List of available tool names */
  tools: string[];
  /** Whether streaming responses are supported */
  streaming: boolean;
  /** Whether multi-turn conversations are supported */
  multiTurn: boolean;
  /** Maximum context window size in tokens */
  contextWindow: number;
}

/**
 * Valid state transitions map.
 * Maps each state to the events that can be triggered from that state
 * and the resulting state after the transition.
 */
export const ACPStateTransitions: Record<
  ACPState,
  Partial<Record<ACPEvent, ACPState>>
> = {
  uninitialized: {
    initialize: 'initializing',
  },
  initializing: {
    initialized: 'ready',
    error: 'error',
  },
  ready: {
    prompt: 'processing',
    shutdown: 'shutdown',
    error: 'error',
  },
  processing: {
    tool_call: 'waiting_for_tool',
    complete: 'ready',
    error: 'error',
  },
  waiting_for_tool: {
    tool_result: 'processing',
    error: 'error',
  },
  error: {
    reset: 'uninitialized',
    shutdown: 'shutdown',
  },
  shutdown: {
    // Terminal state - no transitions out
  },
};

/**
 * State machine for managing ACP agent state transitions.
 */
export class ACPStateMachine {
  private _currentState: ACPState = 'uninitialized';
  private readonly listeners: Set<(state: ACPState, event: ACPEvent) => void> =
    new Set();

  /**
   * Gets the current state of the state machine.
   */
  get currentState(): ACPState {
    return this._currentState;
  }

  /**
   * Checks if a transition is valid from the current state.
   *
   * @param event - The event to check
   * @returns true if the transition is valid
   */
  canTransition(event: ACPEvent): boolean {
    const transitions = ACPStateTransitions[this._currentState];
    return event in transitions;
  }

  /**
   * Attempts to transition to a new state based on an event.
   *
   * @param event - The event triggering the transition
   * @returns The new state after transition
   * @throws Error if the transition is invalid
   */
  transition(event: ACPEvent): ACPState {
    const transitions = ACPStateTransitions[this._currentState];
    const nextState = transitions[event];

    if (nextState === undefined) {
      throw new Error(
        `Invalid transition: cannot trigger '${event}' from state '${this._currentState}'`,
      );
    }

    this._currentState = nextState;

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(nextState, event);
      } catch (err) {
        console.warn('State transition listener error:', err);
      }
    }

    return nextState;
  }

  /**
   * Gets all valid events that can be triggered from the current state.
   *
   * @returns Array of valid events
   */
  getValidTransitions(): ACPEvent[] {
    const transitions = ACPStateTransitions[this._currentState];
    return Object.keys(transitions) as ACPEvent[];
  }

  /**
   * Adds a listener for state transitions.
   *
   * @param listener - Callback function called on each transition
   * @returns Function to remove the listener
   */
  onTransition(
    listener: (state: ACPState, event: ACPEvent) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Resets the state machine to uninitialized state.
   * Only valid from error state.
   */
  reset(): void {
    if (this._currentState === 'error') {
      this.transition('reset');
    } else if (this._currentState === 'uninitialized') {
      // Already in initial state, no-op
    } else {
      throw new Error(`Cannot reset from state '${this._currentState}'`);
    }
  }

  /**
   * Checks if the state machine is in a terminal state.
   */
  isTerminal(): boolean {
    return this._currentState === 'shutdown';
  }

  /**
   * Checks if the state machine is ready to process prompts.
   */
  isReady(): boolean {
    return this._currentState === 'ready';
  }

  /**
   * Checks if the state machine is currently processing.
   */
  isProcessing(): boolean {
    return (
      this._currentState === 'processing' ||
      this._currentState === 'waiting_for_tool'
    );
  }
}
