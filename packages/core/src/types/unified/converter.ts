/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message Converter.
 *
 * Provides bidirectional conversion between legacy @google/genai Content types
 * and the unified ModelMessage types from Vercel AI SDK.
 *
 * @module types/unified/converter
 */

import type { Content, Part } from '@google/genai';
import type { ModelMessage } from 'ai';
import { migrationDebug } from '../../config/featureFlags.js';
import type { TextPart, ImagePart, ToolCallPart } from './message.js';

/**
 * Conversion result with optional warnings
 */
export interface ConversionResult<T> {
  result: T;
  warnings?: string[];
}

/**
 * Convert legacy @google/genai Content to Vercel AI SDK ModelMessage.
 *
 * @param content - Legacy Content object
 * @returns Converted ModelMessage with any conversion warnings
 *
 * @example
 * ```typescript
 * const content: Content = { role: 'user', parts: [{ text: 'Hello' }] };
 * const { result, warnings } = contentToModelMessage(content);
 * // result: { role: 'user', content: 'Hello' }
 * ```
 */
export function contentToModelMessage(
  content: Content,
): ConversionResult<ModelMessage> {
  const warnings: string[] = [];

  // Map role
  const role = mapRole(content.role);

  // Convert parts to content
  const convertedContent = convertParts(content.parts, warnings);

  migrationDebug('contentToModelMessage', {
    inputRole: content.role,
    outputRole: role,
    partsCount: content.parts?.length ?? 0,
  });

  return {
    result: {
      role,
      content: convertedContent,
    } as ModelMessage,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Convert Vercel AI SDK ModelMessage to legacy @google/genai Content.
 *
 * @param message - ModelMessage object
 * @returns Converted Content with any conversion warnings
 *
 * @example
 * ```typescript
 * const message: ModelMessage = { role: 'user', content: 'Hello' };
 * const { result, warnings } = modelMessageToContent(message);
 * // result: { role: 'user', parts: [{ text: 'Hello' }] }
 * ```
 */
export function modelMessageToContent(
  message: ModelMessage,
): ConversionResult<Content> {
  const warnings: string[] = [];

  // Map role back to GenAI format
  const role = mapRoleToGenAI(message.role);

  // Convert content to parts
  const parts = convertContentToParts(message.content, warnings);

  migrationDebug('modelMessageToContent', {
    inputRole: message.role,
    outputRole: role,
    contentType: typeof message.content,
  });

  return {
    result: {
      role,
      parts,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// Legacy aliases for backward compatibility
export const contentToCoreMessage = contentToModelMessage;
export const coreMessageToContent = modelMessageToContent;

/**
 * Batch convert multiple Content objects to ModelMessages
 */
export function contentsToModelMessages(
  contents: Content[],
): ConversionResult<ModelMessage[]> {
  const results: ModelMessage[] = [];
  const allWarnings: string[] = [];

  for (const content of contents) {
    const { result, warnings } = contentToModelMessage(content);
    results.push(result);
    if (warnings) {
      allWarnings.push(...warnings);
    }
  }

  return {
    result: results,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

// Legacy alias
export const contentsToCoreMessages = contentsToModelMessages;

/**
 * Batch convert multiple ModelMessages to Content objects
 */
export function modelMessagesToContents(
  messages: ModelMessage[],
): ConversionResult<Content[]> {
  const results: Content[] = [];
  const allWarnings: string[] = [];

  for (const message of messages) {
    const { result, warnings } = modelMessageToContent(message);
    results.push(result);
    if (warnings) {
      allWarnings.push(...warnings);
    }
  }

  return {
    result: results,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

// Legacy alias
export const coreMessagesToContents = modelMessagesToContents;

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Map GenAI role to ModelMessage role
 */
function mapRole(
  genaiRole: string | undefined,
): 'system' | 'user' | 'assistant' | 'tool' {
  switch (genaiRole?.toLowerCase()) {
    case 'system':
      return 'system';
    case 'user':
      return 'user';
    case 'model':
    case 'assistant':
      return 'assistant';
    case 'function':
    case 'tool':
      return 'tool';
    default:
      return 'user';
  }
}

/**
 * Map ModelMessage role to GenAI role
 */
function mapRoleToGenAI(
  coreRole: string,
): 'user' | 'model' | 'function' | 'system' {
  switch (coreRole) {
    case 'system':
      return 'system';
    case 'user':
      return 'user';
    case 'assistant':
      return 'model';
    case 'tool':
      return 'function';
    default:
      return 'user';
  }
}

/**
 * Convert GenAI Parts to ModelMessage content
 */
function convertParts(
  parts: Part[] | undefined,
  warnings: string[],
): string | Array<TextPart | ImagePart | ToolCallPart> {
  if (!parts || parts.length === 0) {
    return '';
  }

  // If single text part, return string directly
  if (parts.length === 1 && 'text' in parts[0] && parts[0].text) {
    return parts[0].text;
  }

  // Convert to array of parts
  const converted: Array<TextPart | ImagePart | ToolCallPart> = [];

  for (const part of parts) {
    if ('text' in part && part.text) {
      converted.push({ type: 'text', text: part.text });
    } else if ('inlineData' in part && part.inlineData) {
      // Image data
      converted.push({
        type: 'image',
        image: part.inlineData.data ?? '',
        mimeType: part.inlineData.mimeType,
      });
    } else if ('functionCall' in part && part.functionCall) {
      // Tool call
      converted.push({
        type: 'tool-call',
        toolCallId: part.functionCall.name ?? 'unknown',
        toolName: part.functionCall.name ?? 'unknown',
        args: (part.functionCall.args as Record<string, unknown>) ?? {},
      });
    } else if ('functionResponse' in part && part.functionResponse) {
      // Skip function responses in this path - handled separately
      warnings.push('Function response in non-tool message');
    } else {
      warnings.push(`Unknown part type: ${JSON.stringify(Object.keys(part))}`);
    }
  }

  return converted.length === 1 && converted[0].type === 'text'
    ? converted[0].text
    : converted;
}

/**
 * Convert ModelMessage content to GenAI Parts
 */
function convertContentToParts(
  content: string | unknown[],
  warnings: string[],
): Part[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ text: String(content) }];
  }

  const parts: Part[] = [];

  for (const item of content) {
    const partItem = item as {
      type?: string;
      text?: string;
      image?: unknown;
      toolName?: string;
      toolCallId?: string;
      args?: Record<string, unknown>;
      result?: unknown;
    };

    if (partItem.type === 'text' && partItem.text) {
      parts.push({ text: partItem.text });
    } else if (partItem.type === 'image' && partItem.image) {
      if (typeof partItem.image === 'string') {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: partItem.image,
          },
        });
      }
    } else if (partItem.type === 'tool-call' && partItem.toolName) {
      parts.push({
        functionCall: {
          name: partItem.toolName,
          args: partItem.args ?? {},
        },
      });
    } else if (partItem.type === 'tool-result' && partItem.toolName) {
      parts.push({
        functionResponse: {
          name: partItem.toolName,
          response: {
            result:
              typeof partItem.result === 'string'
                ? partItem.result
                : JSON.stringify(partItem.result),
          },
        },
      });
    } else if (partItem.type) {
      warnings.push(`Unknown content type: ${partItem.type}`);
    }
  }

  return parts;
}
