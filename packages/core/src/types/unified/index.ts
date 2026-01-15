/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified Types Module.
 *
 * Re-exports all unified types based on Vercel AI SDK for provider-agnostic
 * message handling throughout the application.
 *
 * @module types/unified
 */

// Message types
export {
  // Re-exported from Vercel AI SDK
  type ModelMessage,
  // Custom types
  type UnifiedMessage,
  type MessageMetadata,
  type ToolResultMetadata,
  type SessionMessage,
  type MessageRole,
  type TextPart,
  type ImagePart,
  type ToolCallPart,
  type ToolResultPart,
  type ContentPart,
  // Utility functions
  getMessageRole,
  isSystemMessage,
  isUserMessage,
  isAssistantMessage,
  isToolMessage,
  getMessageText,
  createTextMessage,
  createSessionMessage,
} from './message.js';

// Converter utilities
export {
  type ConversionResult,
  contentToModelMessage,
  modelMessageToContent,
  contentsToModelMessages,
  modelMessagesToContents,
  // Legacy aliases
  contentToCoreMessage,
  coreMessageToContent,
  contentsToCoreMessages,
  coreMessagesToContents,
} from './converter.js';
