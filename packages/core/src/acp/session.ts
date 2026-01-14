/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import {
  generateText,
  type ModelMessage,
  type Tool,
  tool,
  jsonSchema,
  type JSONSchema7,
  type TextPart,
  type ToolCallPart,
} from 'ai';
import { randomUUID } from 'crypto';
import type { AgentState, Message, ToolResult } from './types.js';
import type { Config } from '../config/config.js';
import type { AnyDeclarativeTool } from '../tools/tools.js';
import * as SessionCompaction from './compaction.js';

export class ACPSessionManager extends EventEmitter {
  id: string;
  state: AgentState = 'pending';
  messages: Message[] = [];

  private config: Config;
  private currentProviderId?: string;
  private currentModelId?: string;

  constructor(id: string, config: Config) {
    super();
    this.id = id;
    this.config = config;
  }

  setModel(providerId: string, modelId: string) {
    const registry = this.config.getProviderRegistry();
    const provider = registry.get(providerId);
    if (!provider) throw new Error(`Provider ${providerId} not found`);

    this.currentProviderId = providerId;
    this.currentModelId = modelId;
  }

  async addUserMessage(content: string): Promise<void> {
    const message: Message = {
      id: randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.messages.push(message);
    this.emit('message.created', message);

    await this.run();
  }

  private async run() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.emit('state.changed', this.state);

    const MAX_STEPS = 10;
    let stepCount = 0;

    try {
      if (!this.currentProviderId || !this.currentModelId) {
        throw new Error('No model configured for session');
      }

      const registry = this.config.getProviderRegistry();
      const provider = registry.get(this.currentProviderId);
      if (!provider)
        throw new Error(`Provider ${this.currentProviderId} not found`);

      const languageModel = provider.languageModel(this.currentModelId);
      const toolRegistry = this.config.getToolRegistry();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = this.convertTools(toolRegistry.getAllTools()) as any;

      while (stepCount < MAX_STEPS) {
        stepCount++;
        const coreMessages = this.convertHistoryToCoreMessages();

        // Check for context overflow
        if (
          this.currentModelId &&
          provider.models &&
          provider.models[this.currentModelId]
        ) {
          const modelDef = provider.models[this.currentModelId];
          // Calculate input tokens roughly
          let inputTokens = 0;
          for (const m of this.messages) {
            inputTokens += m.content
              ? SessionCompaction.countTokens(m.content)
              : 0;
            if (m.toolCalls) {
              for (const tc of m.toolCalls) {
                inputTokens += SessionCompaction.countTokens(
                  JSON.stringify(tc.arguments),
                );
              }
            }
            if (m.toolResults) {
              for (const tr of m.toolResults) {
                inputTokens += SessionCompaction.countTokens(String(tr.result));
              }
            }
          }

          if (
            SessionCompaction.isOverflow({
              tokens: { input: inputTokens, output: 0 },
              model: modelDef,
            })
          ) {
            // Prune
            await SessionCompaction.prune(this.messages);
            // Re-convert messages after pruning (if content changed)
            // But pruning modifies messages in place in our implementation?
            // Yes, we implemented inplace modification for now.
            // So we just continue.
            // TODO: If still overflow, compact.
          }
        }

        const { text, toolCalls } = await generateText({
          model: languageModel,
          messages: coreMessages,
          tools,
        });

        // Append assistant response
        const assistantMsg: Message = {
          id: randomUUID(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
          toolCalls: toolCalls?.map((tc) => ({
            id: tc.toolCallId,
            name: tc.toolName,
            arguments:
              (tc as unknown as { args?: Record<string, unknown> }).args ??
              (tc as unknown as { input?: Record<string, unknown> }).input ??
              {},
          })),
        };
        this.messages.push(assistantMsg);
        this.emit('message.created', assistantMsg);

        if (!toolCalls || toolCalls.length === 0) {
          break; // No tools called, we are done
        }

        // Execute tools
        const toolResults: ToolResult[] = [];
        for (const tc of toolCalls) {
          try {
            const allTools = toolRegistry.getAllTools();
            const selectedTool = allTools.find((t) => t.name === tc.toolName);

            if (selectedTool) {
              // Safe execution using buildAndExecute from DeclarativeTool
              const inputArgs =
                (tc as unknown as { args?: object }).args ??
                (tc as unknown as { input?: object }).input ??
                {};
              // Pass undefined as AbortSignal (as DeclarativeTool implementation must handle it optional)
              const result = await selectedTool.buildAndExecute(
                inputArgs,
                undefined as unknown as AbortSignal,
              );

              let resultString = '';
              if (typeof result.llmContent === 'string') {
                resultString = result.llmContent;
              } else {
                resultString = JSON.stringify(result.llmContent);
              }

              toolResults.push({
                toolCallId: tc.toolCallId,
                result: resultString,
                isError: false,
              });
            } else {
              toolResults.push({
                toolCallId: tc.toolCallId,
                result: 'Tool not found',
                isError: true,
              });
            }
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            toolResults.push({
              toolCallId: tc.toolCallId,
              result: errorMessage,
              isError: true,
            });
          }
        }

        // Create tool message (role: 'tool')
        const toolMsg: Message = {
          id: randomUUID(),
          role: 'tool',
          content: '',
          timestamp: Date.now(),
          toolResults,
        };
        this.messages.push(toolMsg);
        this.emit('message.created', toolMsg);
      }

      this.state = 'completed';
      this.emit('state.changed', this.state);
    } catch (error) {
      console.error('ACP Run Error:', error);
      this.state = 'error';
      this.emit('state.changed', this.state);
      this.emit('error', error);
    }
  }

  private convertTools(tools: AnyDeclarativeTool[]): Record<string, Tool> {
    const coreTools: Record<string, Tool> = {};
    for (const t of tools) {
      coreTools[t.name] = tool({
        description: t.description,
        inputSchema: jsonSchema(t.parameterSchema as JSONSchema7),
        execute: async (args: unknown) => {
          // We map this for completeness, though our manual loop bypasses it.
          const result = await t.buildAndExecute(
            args as object,
            undefined as unknown as AbortSignal,
          );
          return typeof result.llmContent === 'string'
            ? result.llmContent
            : JSON.stringify(result.llmContent);
        },
      });
    }
    return coreTools;
  }

  private convertHistoryToCoreMessages(): ModelMessage[] {
    const coreMessages: ModelMessage[] = [];
    const knownToolCalls = new Map<
      string,
      { name: string; args: Record<string, unknown> }
    >();

    for (const m of this.messages) {
      if (m.role === 'user') {
        coreMessages.push({ role: 'user', content: m.content });
      } else if (m.role === 'system') {
        coreMessages.push({ role: 'system', content: m.content });
      } else if (m.role === 'assistant') {
        const content: Array<TextPart | ToolCallPart> = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            // Track tool call for later resolution of results
            knownToolCalls.set(tc.id, { name: tc.name, args: tc.arguments });

            content.push({
              type: 'tool-call',
              toolCallId: tc.id,
              toolName: tc.name,
              args: tc.arguments,
            } as unknown as ToolCallPart); // casting because args vs input mismatch if types are strict
          }
        }
        coreMessages.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        if (m.toolResults) {
          const content = m.toolResults.map((tr) => {
            const originalCall = knownToolCalls.get(tr.toolCallId);
            const toolName = originalCall?.name || 'unknown';
            const input = (originalCall?.args as Record<string, unknown>) || {};

            return {
              type: 'tool-result' as const,
              toolCallId: tr.toolCallId,
              toolName,
              input,
              output:
                typeof tr.result === 'string'
                  ? tr.result
                  : JSON.stringify(tr.result),
              isError: tr.isError,
            };
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          coreMessages.push({ role: 'tool', content: content as any });
        }
      }
    }
    return coreMessages;
  }
}
