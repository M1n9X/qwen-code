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
