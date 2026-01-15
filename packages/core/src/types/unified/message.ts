/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Message Types.
 *
 * This module defines the unified message types based on Vercel AI SDK's ModelMessage.
 * These types replace the legacy @google/genai Content types for a provider-agnostic
 * message representation.
 *
 * @module types/unified/message
 */

import type { ModelMessage } from 'ai';

// Re-export Vercel AI SDK types as our unified types
export type { ModelMessage };

/**
 * Alias for ModelMessage - the primary message type
 */
export type UnifiedMessage = ModelMessage;

/**
 * Message role type
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Text content part
 */
export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * Image content part
 */
export interface ImagePart {
  type: 'image';
  image: string | URL | Uint8Array;
  mimeType?: string;
}

/**
 * Tool call part
 */
export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tool result part
 */
export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

/**
 * Union of content parts
 */
export type ContentPart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

/**
 * Metadata associated with a message in a session
 */
export interface MessageMetadata {
  /** Approximate tokens used by this message */
  tokensUsed?: number;
  /** Whether this message is pinned (protected from compaction) */
  pinned?: boolean;
  /** Reason for pinning */
  pinnedReason?: string;
  /** Whether this message was summarized during compaction */
  summarized?: boolean;
  /** Original message ID if this is a summarized version */
  summarizedFrom?: string[];
  /** Tool execution results metadata */
  toolResults?: ToolResultMetadata[];
  /** Model that generated this message */
  modelId?: string;
  /** Provider that handled this message */
  providerId?: string;
}

/**
 * Metadata for tool execution results
 */
export interface ToolResultMetadata {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name */
  toolName: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Extended message type for session management.
 * Combines a ModelMessage with session-specific metadata.
 */
export interface SessionMessage {
  /** Unique message identifier */
  id: string;
  /** The underlying message content */
  message: ModelMessage;
  /** Timestamp when message was created */
  timestamp: number;
  /** Session-specific metadata */
  metadata: MessageMetadata;
}

/**
 * Get the role of a message
 */
export function getMessageRole(message: ModelMessage): MessageRole {
  return message.role as MessageRole;
}

/**
 * Check if a message is a system message
 */
export function isSystemMessage(message: ModelMessage): boolean {
  return message.role === 'system';
}

/**
 * Check if a message is a user message
 */
export function isUserMessage(message: ModelMessage): boolean {
  return message.role === 'user';
}

/**
 * Check if a message is an assistant message
 */
export function isAssistantMessage(message: ModelMessage): boolean {
  return message.role === 'assistant';
}

/**
 * Check if a message is a tool message
 */
export function isToolMessage(message: ModelMessage): boolean {
  return message.role === 'tool';
}

/**
 * Extract text content from a message
 */
export function getMessageText(message: ModelMessage): string {
  const content = message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: 'text'; text: string } =>
          typeof part === 'object' && part.type === 'text',
      )
      .map((part) => part.text)
      .join('\n');
  }

  return '';
}

/**
 * Create a simple text message
 */
export function createTextMessage(
  role: 'user' | 'assistant' | 'system',
  text: string,
): ModelMessage {
  return { role, content: text } as ModelMessage;
}

/**
 * Create a session message with metadata
 */
export function createSessionMessage(
  message: ModelMessage,
  metadata: Partial<MessageMetadata> = {},
): SessionMessage {
  return {
    id: crypto.randomUUID(),
    message,
    timestamp: Date.now(),
    metadata: {
      tokensUsed: undefined,
      pinned: false,
      summarized: false,
      ...metadata,
    },
  };
}
