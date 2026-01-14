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

export async function compact(
  messages: Message[],
  _model: Model,
): Promise<Message[]> {
  // Basic compaction: Keep system prompt, keep last N messages, summarize the middle.
  // Since we don't have an LLM call here easily without recursing into session,
  // we will implement a "dumb" compaction first: Drop middle messages.
  // Better compaction requires calling an LLM to summarize.

  // Strategy:
  // 1. Keep System message (if any, usually implicit or first)
  // 2. Keep last 10 messages (or fit within context)
  // 3. Drop/Summarize the middle.

  const keepLast = 10;
  if (messages.length <= keepLast + 1) return messages;

  const lastMessages = messages.slice(-keepLast);
  // Keep first message if it's system or critical context?
  // const firstMessage = messages[0];

  // For now, simple truncation.
  const newMessages = [...lastMessages];

  return newMessages;
}
