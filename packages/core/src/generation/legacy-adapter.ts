/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Legacy Generation Adapter.
 *
 * Wraps the legacy ContentGenerator interface to implement the new
 * GenerationService interface. This allows gradual migration without
 * breaking existing code that depends on ContentGenerator.
 *
 * @module generation/legacy-adapter
 * @deprecated This adapter is temporary and will be removed after migration
 */

import type { LanguageModel, ModelMessage } from 'ai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { migrationDebug } from '../config/featureFlags.js';
import { modelMessageToContent } from '../types/unified/converter.js';
import type {
  GenerationService,
  GenerationOptions,
  GenerationResult,
  GenerationChunk,
  FinishReason,
} from './interface.js';

/**
 * Adapter that wraps ContentGenerator to implement GenerationService.
 *
 * This provides backward compatibility during the migration period.
 * Use GenerationServiceImpl for new code.
 *
 * @deprecated Use GenerationServiceImpl instead
 */
export class LegacyGenerationAdapter implements GenerationService {
  private ready = false;
  private model: string;

  constructor(
    private contentGenerator: ContentGenerator,
    model: string = 'gemini-1.5-flash',
  ) {
    this.model = model;
    this.ready = true;
    migrationDebug('LegacyGenerationAdapter initialized');
  }

  /**
   * Perform a non-streaming generation using legacy ContentGenerator.
   */
  async generate(
    messages: ModelMessage[],
    options: GenerationOptions,
  ): Promise<GenerationResult> {
    migrationDebug('LegacyGenerationAdapter.generate called', {
      messageCount: messages.length,
      model: options.model,
    });

    // Convert messages to legacy Content format
    const contents = messages.map((msg) => modelMessageToContent(msg).result);

    // Use model from options or fall back to configured model
    const modelId = options.model || this.model;

    try {
      // Call legacy generateContent with proper GenerateContentParameters
      const response = await this.contentGenerator.generateContent(
        {
          model: modelId,
          contents,
          config: {
            maxOutputTokens: options.maxTokens,
            temperature: options.temperature,
            stopSequences: options.stopSequences,
          },
        },
        `migration-${Date.now()}`, // userPromptId
      );

      // Extract text from response
      const text = this.extractTextFromResponse(response);

      // Map to GenerationResult
      return {
        content: text,
        toolCalls: this.extractToolCalls(response),
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        },
        finishReason: this.mapFinishReason(
          response.candidates?.[0]?.finishReason,
        ),
        providerId: 'legacy',
        modelId,
      };
    } catch (error) {
      migrationDebug('LegacyGenerationAdapter.generate error', error);
      throw error;
    }
  }

  /**
   * Perform a streaming generation using legacy ContentGenerator.
   */
  async *stream(
    messages: ModelMessage[],
    options: GenerationOptions,
  ): AsyncGenerator<GenerationChunk> {
    migrationDebug('LegacyGenerationAdapter.stream called', {
      messageCount: messages.length,
      model: options.model,
    });

    // Convert messages to legacy Content format
    const contents = messages.map((msg) => modelMessageToContent(msg).result);

    // Use model from options or fall back to configured model
    const modelId = options.model || this.model;

    try {
      // Call legacy generateContentStream with proper GenerateContentParameters
      const streamGenerator = await this.contentGenerator.generateContentStream(
        {
          model: modelId,
          contents,
          config: {
            maxOutputTokens: options.maxTokens,
            temperature: options.temperature,
            stopSequences: options.stopSequences,
          },
        },
        `migration-${Date.now()}`,
      );

      // Process stream chunks
      for await (const response of streamGenerator) {
        const text = this.extractTextFromResponse(response);
        if (text) {
          yield {
            type: 'text-delta',
            textDelta: text,
          };
        }
      }

      // Yield finish chunk
      yield {
        type: 'finish',
        finishReason: 'stop',
      };
    } catch (error) {
      migrationDebug('LegacyGenerationAdapter.stream error', error);
      throw error;
    }
  }

  /**
   * Count tokens using legacy ContentGenerator.
   */
  async countTokens(
    messages: ModelMessage[],
    modelId?: string,
  ): Promise<number> {
    // Convert messages to legacy format
    const contents = messages.map((msg) => modelMessageToContent(msg).result);

    try {
      const response = await this.contentGenerator.countTokens({
        model: modelId || this.model,
        contents,
      });
      return response.totalTokens ?? 0;
    } catch (error) {
      migrationDebug('LegacyGenerationAdapter.countTokens error', error);
      // Fall back to simple estimation
      let totalChars = 0;
      for (const msg of messages) {
        if (typeof msg.content === 'string') {
          totalChars += msg.content.length;
        }
      }
      return Math.ceil(totalChars / 4);
    }
  }

  /**
   * Get language model - not supported in legacy adapter.
   * @throws Error as legacy adapter doesn't support direct model access
   */
  getLanguageModel(_modelId: string, _providerId?: string): LanguageModel {
    throw new Error(
      'LegacyGenerationAdapter does not support getLanguageModel. ' +
        'Use GenerationServiceImpl for direct model access.',
    );
  }

  /**
   * Check if the adapter is ready.
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Shut down the adapter.
   */
  async shutdown(): Promise<void> {
    this.ready = false;
    migrationDebug('LegacyGenerationAdapter shutdown');
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  /**
   * Extract text content from a GenerateContentResponse.
   */
  private extractTextFromResponse(response: unknown): string {
    const resp = response as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const candidate = resp.candidates?.[0];
    if (!candidate?.content?.parts) {
      return '';
    }

    return candidate.content.parts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join('');
  }

  /**
   * Extract tool calls from a GenerateContentResponse.
   */
  private extractToolCalls(
    response: unknown,
  ): Array<{ id: string; name: string; arguments: Record<string, unknown> }> {
    const resp = response as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            functionCall?: { name?: string; args?: Record<string, unknown> };
          }>;
        };
      }>;
    };

    const candidate = resp.candidates?.[0];
    if (!candidate?.content?.parts) {
      return [];
    }

    return candidate.content.parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: `tc-${i}`,
        name: p.functionCall!.name ?? 'unknown',
        arguments: p.functionCall!.args ?? {},
      }));
  }

  /**
   * Map legacy finish reason to our format.
   */
  private mapFinishReason(reason: string | undefined): FinishReason {
    switch (reason?.toUpperCase()) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
      case 'LENGTH':
        return 'length';
      case 'TOOL_CALLS':
      case 'FUNCTION_CALL':
        return 'tool-calls';
      case 'SAFETY':
      case 'RECITATION':
        return 'content-filter';
      case 'ERROR':
        return 'error';
      default:
        return 'other';
    }
  }
}

/**
 * Create a LegacyGenerationAdapter.
 *
 * @param contentGenerator - The legacy ContentGenerator to wrap
 * @param model - Default model ID to use
 * @returns GenerationService implementation wrapping the legacy generator
 * @deprecated Use createGenerationService instead
 */
export function createLegacyGenerationAdapter(
  contentGenerator: ContentGenerator,
  model?: string,
): GenerationService {
  return new LegacyGenerationAdapter(contentGenerator, model);
}
