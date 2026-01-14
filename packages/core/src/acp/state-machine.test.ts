/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ACPStateMachine,
  ACPStateTransitions,
  type ACPState,
} from './types.js';

describe('ACPStateMachine', () => {
  let stateMachine: ACPStateMachine;

  beforeEach(() => {
    stateMachine = new ACPStateMachine();
  });

  describe('initial state', () => {
    it('should start in uninitialized state', () => {
      expect(stateMachine.currentState).toBe('uninitialized');
    });

    it('should not be ready initially', () => {
      expect(stateMachine.isReady()).toBe(false);
    });

    it('should not be processing initially', () => {
      expect(stateMachine.isProcessing()).toBe(false);
    });

    it('should not be terminal initially', () => {
      expect(stateMachine.isTerminal()).toBe(false);
    });
  });

  describe('canTransition', () => {
    it('should allow initialize from uninitialized', () => {
      expect(stateMachine.canTransition('initialize')).toBe(true);
    });

    it('should not allow prompt from uninitialized', () => {
      expect(stateMachine.canTransition('prompt')).toBe(false);
    });

    it('should allow prompt from ready state', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      expect(stateMachine.canTransition('prompt')).toBe(true);
    });
  });

  describe('transition', () => {
    it('should transition from uninitialized to initializing', () => {
      const newState = stateMachine.transition('initialize');
      expect(newState).toBe('initializing');
      expect(stateMachine.currentState).toBe('initializing');
    });

    it('should transition from initializing to ready', () => {
      stateMachine.transition('initialize');
      const newState = stateMachine.transition('initialized');
      expect(newState).toBe('ready');
      expect(stateMachine.currentState).toBe('ready');
    });

    it('should transition from ready to processing on prompt', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      const newState = stateMachine.transition('prompt');
      expect(newState).toBe('processing');
    });

    it('should transition from processing to waiting_for_tool on tool_call', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      stateMachine.transition('prompt');
      const newState = stateMachine.transition('tool_call');
      expect(newState).toBe('waiting_for_tool');
    });

    it('should transition from waiting_for_tool to processing on tool_result', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      stateMachine.transition('prompt');
      stateMachine.transition('tool_call');
      const newState = stateMachine.transition('tool_result');
      expect(newState).toBe('processing');
    });

    it('should transition from processing to ready on complete', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      stateMachine.transition('prompt');
      const newState = stateMachine.transition('complete');
      expect(newState).toBe('ready');
    });

    it('should throw error for invalid transition', () => {
      expect(() => stateMachine.transition('prompt')).toThrow(
        "Invalid transition: cannot trigger 'prompt' from state 'uninitialized'",
      );
    });

    it('should transition to error state on error event', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      stateMachine.transition('prompt');
      const newState = stateMachine.transition('error');
      expect(newState).toBe('error');
    });

    it('should transition to shutdown from ready', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      const newState = stateMachine.transition('shutdown');
      expect(newState).toBe('shutdown');
      expect(stateMachine.isTerminal()).toBe(true);
    });
  });

  describe('getValidTransitions', () => {
    it('should return initialize for uninitialized state', () => {
      const valid = stateMachine.getValidTransitions();
      expect(valid).toEqual(['initialize']);
    });

    it('should return multiple options for ready state', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      const valid = stateMachine.getValidTransitions();
      expect(valid).toContain('prompt');
      expect(valid).toContain('shutdown');
      expect(valid).toContain('error');
    });

    it('should return empty array for shutdown state', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      stateMachine.transition('shutdown');
      const valid = stateMachine.getValidTransitions();
      expect(valid).toEqual([]);
    });
  });

  describe('onTransition', () => {
    it('should notify listeners on transition', () => {
      const listener = vi.fn();
      stateMachine.onTransition(listener);

      stateMachine.transition('initialize');

      expect(listener).toHaveBeenCalledWith('initializing', 'initialize');
    });

    it('should allow removing listeners', () => {
      const listener = vi.fn();
      const remove = stateMachine.onTransition(listener);

      remove();
      stateMachine.transition('initialize');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should continue even if listener throws', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      stateMachine.onTransition(errorListener);
      stateMachine.onTransition(goodListener);

      // Should not throw
      expect(() => stateMachine.transition('initialize')).not.toThrow();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset from error state to uninitialized', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('error');
      stateMachine.reset();
      expect(stateMachine.currentState).toBe('uninitialized');
    });

    it('should be no-op when already uninitialized', () => {
      stateMachine.reset();
      expect(stateMachine.currentState).toBe('uninitialized');
    });

    it('should throw when trying to reset from non-error state', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      expect(() => stateMachine.reset()).toThrow(
        "Cannot reset from state 'ready'",
      );
    });
  });

  describe('state helpers', () => {
    it('isReady should return true only in ready state', () => {
      expect(stateMachine.isReady()).toBe(false);
      stateMachine.transition('initialize');
      expect(stateMachine.isReady()).toBe(false);
      stateMachine.transition('initialized');
      expect(stateMachine.isReady()).toBe(true);
      stateMachine.transition('prompt');
      expect(stateMachine.isReady()).toBe(false);
    });

    it('isProcessing should return true in processing or waiting_for_tool', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      expect(stateMachine.isProcessing()).toBe(false);
      stateMachine.transition('prompt');
      expect(stateMachine.isProcessing()).toBe(true);
      stateMachine.transition('tool_call');
      expect(stateMachine.isProcessing()).toBe(true);
    });

    it('isTerminal should return true only in shutdown state', () => {
      stateMachine.transition('initialize');
      stateMachine.transition('initialized');
      expect(stateMachine.isTerminal()).toBe(false);
      stateMachine.transition('shutdown');
      expect(stateMachine.isTerminal()).toBe(true);
    });
  });
});

describe('ACPStateTransitions', () => {
  it('should define transitions for all states', () => {
    const allStates: ACPState[] = [
      'uninitialized',
      'initializing',
      'ready',
      'processing',
      'waiting_for_tool',
      'error',
      'shutdown',
    ];

    for (const state of allStates) {
      expect(ACPStateTransitions[state]).toBeDefined();
    }
  });

  it('should have shutdown as terminal state with no outgoing transitions', () => {
    const shutdownTransitions = ACPStateTransitions['shutdown'];
    expect(Object.keys(shutdownTransitions)).toHaveLength(0);
  });

  it('should allow error transition from most active states', () => {
    expect(ACPStateTransitions['initializing']['error']).toBe('error');
    expect(ACPStateTransitions['ready']['error']).toBe('error');
    expect(ACPStateTransitions['processing']['error']).toBe('error');
    expect(ACPStateTransitions['waiting_for_tool']['error']).toBe('error');
  });
});
