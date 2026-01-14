/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { get_encoding } from 'tiktoken';
import { type Message } from './types.js';
import type { Model } from '../provider/types.js';

const enc = get_encoding('cl100k_base');

export const PRUNE_MINIMUM = 20_000;
export const PRUNE_PROTECT = 40_000;

/**
 * Configuration for session compaction.
 */
export interface CompactionConfig {
  /** Maximum tokens before compaction is triggered */
  maxTokens: number;
  /** Target token count after compaction */
  targetTokens: number;
  /** Whether to preserve system messages during compaction */
  preserveSystemMessages: boolean;
  /** Whether summarization is enabled */
  summarizationEnabled: boolean;
}

/**
 * Represents a pinned message that should not be removed during compaction.
 */
export interface PinnedMessage {
  /** Message ID */
  id: string;
  /** Optional reason for pinning */
  reason?: string;
  /** Timestamp when the message was pinned */
  pinnedAt: number;
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** Original token count before compaction */
  originalTokens: number;
  /** Token count after compaction */
  compactedTokens: number;
  /** Number of messages removed */
  removedMessages: number;
  /** Number of messages summarized */
  summarizedMessages: number;
  /** IDs of pinned messages that were preserved */
  pinnedMessages: string[];
  /** Generated summary text, if any */
  summary?: string;
}

/**
 * Plugin hook input for compaction events.
 */
export interface CompactionHookInput {
  /** Session ID */
  sessionId: string;
  /** Messages being considered for compaction */
  messages: Message[];
  /** Current pinned message IDs */
  pinnedIds: Set<string>;
  /** Current token count */
  tokenCount: number;
  /** Target token count */
  targetTokens: number;
}

/**
 * Plugin hook output for compaction events.
 */
export interface CompactionHookOutput {
  /** Modified messages (plugins can filter or modify) */
  messages?: Message[];
  /** Additional message IDs to pin */
  additionalPins?: string[];
  /** Whether to skip default compaction logic */
  skipDefault?: boolean;
  /** Custom summary to use instead of generated one */
  customSummary?: string;
}

/**
 * Session compactor for managing context window limits.
 */
export class SessionCompactor {
  private config: CompactionConfig;
  private pinnedMessages: Map<string, PinnedMessage> = new Map();
  private pluginHook?: (
    input: CompactionHookInput,
    output: CompactionHookOutput,
  ) => Promise<void>;

  constructor(config?: Partial<CompactionConfig>) {
    this.config = {
      maxTokens: 128000,
      targetTokens: 100000,
      preserveSystemMessages: true,
      summarizationEnabled: true,
      ...config,
    };
  }

  /**
   * Updates the compaction configuration.
   */
  configure(config: Partial<CompactionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sets the plugin hook for compaction events.
   */
  setPluginHook(
    hook: (
      input: CompactionHookInput,
      output: CompactionHookOutput,
    ) => Promise<void>,
  ): void {
    this.pluginHook = hook;
  }

  /**
   * Pins a message to prevent it from being removed during compaction.
   */
  pinMessage(messageId: string, reason?: string): void {
    if (!this.pinnedMessages.has(messageId)) {
      this.pinnedMessages.set(messageId, {
        id: messageId,
        reason,
        pinnedAt: Date.now(),
      });
    }
  }

  /**
   * Unpins a message, allowing it to be removed during compaction.
   */
  unpinMessage(messageId: string): void {
    this.pinnedMessages.delete(messageId);
  }

  /**
   * Gets all pinned messages.
   */
  getPinnedMessages(): PinnedMessage[] {
    return Array.from(this.pinnedMessages.values());
  }

  /**
   * Checks if a message is pinned.
   */
  isMessagePinned(messageId: string): boolean {
    return this.pinnedMessages.has(messageId);
  }

  /**
   * Determines if compaction should be triggered based on token count.
   */
  shouldCompact(messages: Message[]): boolean {
    const tokenCount = this.countMessagesTokens(messages);
    return tokenCount > this.config.maxTokens;
  }

  /**
   * Counts total tokens across all messages.
   */
  countMessagesTokens(messages: Message[]): number {
    let total = 0;
    for (const m of messages) {
      total += countTokens(m.content || '');
      if (m.toolResults) {
        for (const res of m.toolResults) {
          total += countTokens(String(res.result));
        }
      }
    }
    return total;
  }

  /**
   * Performs compaction on the given messages.
   */
  async compactMessages(
    sessionId: string,
    messages: Message[],
    summarizer?: (messages: Message[]) => Promise<string>,
  ): Promise<{ messages: Message[]; result: CompactionResult }> {
    const originalTokens = this.countMessagesTokens(messages);
    const pinnedIds = new Set(this.pinnedMessages.keys());

    // Invoke plugin hook if registered
    const hookOutput: CompactionHookOutput = {};
    if (this.pluginHook) {
      const hookInput: CompactionHookInput = {
        sessionId,
        messages: [...messages],
        pinnedIds,
        tokenCount: originalTokens,
        targetTokens: this.config.targetTokens,
      };
      await this.pluginHook(hookInput, hookOutput);

      // Apply plugin modifications
      if (hookOutput.messages) {
        messages = hookOutput.messages;
      }
      if (hookOutput.additionalPins) {
        for (const id of hookOutput.additionalPins) {
          pinnedIds.add(id);
        }
      }
      if (hookOutput.skipDefault) {
        return {
          messages,
          result: {
            originalTokens,
            compactedTokens: this.countMessagesTokens(messages),
            removedMessages: 0,
            summarizedMessages: 0,
            pinnedMessages: Array.from(pinnedIds),
            summary: hookOutput.customSummary,
          },
        };
      }
    }

    // Use the compact function with pinned IDs
    const compactResult = await compact(messages, {
      model: {
        contextWindow: this.config.maxTokens,
        maxOutput: this.config.maxTokens - this.config.targetTokens,
      } as Model,
      pinnedIds,
      summarizer: this.config.summarizationEnabled ? summarizer : undefined,
    });

    const compactedTokens = this.countMessagesTokens(compactResult.messages);
    const removedCount = messages.length - compactResult.messages.length;

    return {
      messages: compactResult.messages,
      result: {
        originalTokens,
        compactedTokens,
        removedMessages: removedCount,
        summarizedMessages:
          removedCount > 0 && compactResult.activeSummary ? removedCount : 0,
        pinnedMessages: Array.from(pinnedIds),
        summary: hookOutput.customSummary || compactResult.activeSummary,
      },
    };
  }
}

// Estimates token count for a string
export function estimate(text: string): number {
  return Math.ceil(text.length / 4); // Fast approximation, use enc.encode(text).length for precision if needed
}

export function countTokens(text: string): number {
  try {
    return enc.encode(text).length;
  } catch (_e) {
    // Fallback
    return Math.ceil(text.length / 4);
  }
}

export function isOverflow(input: {
  tokens: { input: number; output: number; cache?: { read: number } };
  model: Model;
}): boolean {
  const context = input.model.contextWindow || 32000;
  if (context === 0) return false;

  const count =
    input.tokens.input + (input.tokens.cache?.read || 0) + input.tokens.output;
  // Reserve space for output
  const outputMax = input.model.maxOutput || 4096;
  const usable = context - outputMax;

  return count > usable;
}

// Prunes old tool outputs if they exceed protection limit
export async function prune(
  messages: Message[],
): Promise<{ pruned: number; total: number }> {
  let total = 0;
  let pruned = 0;
  const toPrune: number[] = []; // Indices to prune content from

  // Go backwards through messages
  // Logic: If tool output is completed and accumulates > PRUNE_PROTECT, clear it.

  let currentTokens = 0;

  // We iterate backwards
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'tool' && msg.toolResults) {
      for (const res of msg.toolResults) {
        const text = String(res.result);
        const tokens = countTokens(text);
        total += tokens;

        if (currentTokens > PRUNE_PROTECT) {
          toPrune.push(i);
        } else {
          currentTokens += tokens;
        }
      }
    }

    // Count other message tokens roughly
    if (msg.content) {
      currentTokens += countTokens(msg.content);
    }
  }

  // Apply pruning
  if (toPrune.length > 0) {
    for (const idx of toPrune) {
      const msg = messages[idx];
      if (msg.toolResults) {
        for (const res of msg.toolResults) {
          const tokens = countTokens(String(res.result));
          if (tokens > 100) {
            // Don't prune small outputs
            res.result = `(Output pruned: ${tokens} tokens)`;
            pruned += tokens;
          }
        }
      }
    }
  }

  return { pruned, total };
}

export interface InteractionTokens {
  input: number;
  output: number;
  cache?: { read: number };
}

export interface CompactOptions {
  model: Model;
  pinnedIds?: Set<string>;
  summarizer?: (messages: Message[]) => Promise<string>;
}

export async function compact(
  messages: Message[],
  options: CompactOptions,
): Promise<{ messages: Message[]; activeSummary?: string }> {
  const { model, pinnedIds, summarizer } = options;

  // 1. Calculate current usage
  const contextLimit = model.contextWindow || 32000;
  // Reserve space for output (assuming input tokens shouldn't squeeze output too much)
  const maxInputTokens = contextLimit - (model.maxOutput || 4096) - 1000; // 1k safety buffer

  let currentTokens = 0;
  for (const m of messages) {
    currentTokens += countTokens(m.content || '');
    if (m.toolResults) {
      for (const res of m.toolResults) {
        currentTokens += countTokens(String(res.result));
      }
    }
  }

  // If within limits, just return
  if (currentTokens <= maxInputTokens) {
    return { messages };
  }

  // 2. Prune Tool Outputs (Aggressive)
  const { pruned } = await prune(messages); // This mutates toolResults in place
  if (currentTokens - pruned <= maxInputTokens) {
    return { messages }; // Pruning was enough
  }

  // 3. Summarization Strategy
  if (!summarizer) {
    // Fallback to simple truncation if no summarizer provided
    // Keep system, keep pinned, keep last N
    const keepLast = 10;
    if (messages.length <= keepLast + 1) return { messages };

    const lastMessages = messages.slice(-keepLast);
    // Try to preserve system message
    const first = messages[0];
    const newMessages =
      first.role === 'system' ? [first, ...lastMessages] : lastMessages;

    return { messages: newMessages };
  }

  // Identify block to summarize
  // We want to keep:
  // - System message(s) at start
  // - Pinned messages
  // - Recent N messages (e.g. last 10)

  const keepLast = 10;
  const safeZoneStartIndex = Math.max(0, messages.length - keepLast);

  // Candidates for summarization: Indices from 0 to safeZoneStartIndex
  // Excluding system prompts at very start and pinned messages

  const toSummarizeVars: Message[] = [];
  const keptMessages: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isSystem = msg.role === 'system';
    const isPinned = pinnedIds?.has(msg.id);
    const isRecent = i >= safeZoneStartIndex;

    if (isSystem || isPinned || isRecent) {
      keptMessages.push(msg);
    } else {
      // This message is old, not pinned, not system. Summarize it.
      toSummarizeVars.push(msg);
    }
  }

  if (toSummarizeVars.length === 0) {
    // Nothing to summarize, but still overflow?
    // This means pinned/recent messages are too large.
    // We might need to forcefully drop unpinned recent messages or fail.
    // For now, return keptMessages (which is everything we wanted to keep).
    return { messages: keptMessages };
  }

  // Generate summary
  const summaryText = await summarizer(toSummarizeVars);

  // Create summary message
  // We can inject this as a system message with a specific header
  // Or return it separately for the session to handle.
  // Let's insert it after the initial system prompts?
  // Or just return it.

  return { messages: keptMessages, activeSummary: summaryText };
}
