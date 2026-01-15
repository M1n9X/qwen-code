# Incremental Migration Plan: Unified Architecture

## Overview

This document provides a step-by-step execution plan for migrating from the current dual-provider architecture to the unified Vercel AI SDK-based system. Each phase is designed to be independently deployable with minimal risk.

---

## Phase 0: Preparation (1 week)

### 0.1 Create Architecture Documentation

- [x] Document current issues (`current_issues.md`)
- [x] Design new architecture (`architecture_redesign.md`)
- [x] Create this migration plan

### 0.2 Set Up Migration Infrastructure

```bash
# Create new directories
mkdir -p packages/core/src/generation
mkdir -p packages/core/src/types/unified
```

### 0.3 Add Migration Flags

Create feature flags for gradual rollout:

```typescript
// packages/core/src/config/featureFlags.ts
export const FeatureFlags = {
  USE_UNIFIED_PROVIDERS: process.env.QWEN_UNIFIED_PROVIDERS === 'true',
  LEGACY_CONTENT_GENERATOR: process.env.QWEN_LEGACY_CG !== 'false',
  ENABLE_PROVIDER_FALLBACK: process.env.QWEN_PROVIDER_FALLBACK === 'true',
} as const;
```

---

## Phase 1: Unified Types (1 week)

### 1.1 Create Unified Message Types

**File**: `packages/core/src/types/unified/message.ts`

```typescript
import type { CoreMessage, CoreToolMessage, CoreAssistantMessage } from 'ai';

// Re-export Vercel AI SDK types as our unified types
export type { CoreMessage, CoreToolMessage, CoreAssistantMessage };

// Extended types for session management
export interface SessionMessage {
  id: string;
  message: CoreMessage;
  timestamp: number;
  metadata: MessageMetadata;
}

export interface MessageMetadata {
  tokensUsed?: number;
  pinned?: boolean;
  summarized?: boolean;
  toolResults?: ToolResultMetadata[];
}
```

### 1.2 Create Message Converter

**File**: `packages/core/src/types/unified/converter.ts`

```typescript
import type { Content } from '@google/genai';
import type { CoreMessage } from 'ai';

/**
 * Convert legacy @google/genai Content to CoreMessage
 */
export function contentToCoreMessage(content: Content): CoreMessage {
  // Implementation
}

/**
 * Convert CoreMessage to legacy Content (for backward compatibility)
 */
export function coreMessageToContent(message: CoreMessage): Content {
  // Implementation
}
```

### 1.3 Update Type Exports

**File**: `packages/core/src/types/index.ts`

```typescript
// Unified types (new)
export * from './unified/message.js';
export * from './unified/converter.js';

// Legacy types (deprecated)
export * from './legacy/index.js';
```

**Testing**:

```bash
npm run test -- --grep "unified types"
npm run typecheck
```

---

## Phase 2: Generation Service (2 weeks)

### 2.1 Create GenerationService Interface

**File**: `packages/core/src/generation/interface.ts`

```typescript
import type { CoreMessage, CoreTool } from 'ai';

export interface GenerationOptions {
  model: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: CoreTool[];
  systemPrompt?: string;
  signal?: AbortSignal;
}

export interface GenerationResult {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: FinishReason;
}

export interface GenerationService {
  generate(
    messages: CoreMessage[],
    options: GenerationOptions,
  ): Promise<GenerationResult>;
  stream(
    messages: CoreMessage[],
    options: GenerationOptions,
  ): AsyncGenerator<GenerationChunk>;
  countTokens(messages: CoreMessage[]): Promise<number>;
}
```

### 2.2 Implement GenerationService

**File**: `packages/core/src/generation/service.ts`

```typescript
import { generateText, streamText } from 'ai';
import type { ProviderCoordinator } from '../provider/coordinator.js';
import type { PluginManager } from '../plugin/plugin-manager.js';

export class GenerationServiceImpl implements GenerationService {
  constructor(
    private coordinator: ProviderCoordinator,
    private pluginManager?: PluginManager,
  ) {}

  async generate(messages, options) {
    // 1. Plugin: transform messages
    const transformed = await this.applyMessageTransform(messages);

    // 2. Get model from coordinator
    const model = this.coordinator.getActiveProvider().languageModel(options.model);

    // 3. Generate
    const result = await generateText({
      model,
      messages: transformed,
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
      tools: options.tools,
      abortSignal: options.signal,
    });

    // 4. Plugin: post-generation hook
    await this.pluginManager?.trigger('chat.message', { ... }, { ... });

    return this.mapResult(result);
  }

  async *stream(messages, options) {
    // Similar with streaming
  }
}
```

### 2.3 Create Legacy Adapter

**File**: `packages/core/src/generation/legacy-adapter.ts`

```typescript
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { GenerationService } from './interface.js';
import {
  contentToCoreMessage,
  coreMessageToContent,
} from '../types/unified/converter.js';

/**
 * Adapts the legacy ContentGenerator to the new GenerationService interface.
 * This allows gradual migration without breaking existing code.
 */
export class LegacyGenerationAdapter implements GenerationService {
  constructor(private contentGenerator: ContentGenerator) {}

  async generate(messages, options) {
    // Convert to legacy format
    const legacyMessages = messages.map(coreMessageToContent);

    // Call legacy generator
    const result = await this.contentGenerator.generateContent(
      {
        contents: legacyMessages,
        // ... map other options
      },
      'migration-prompt',
    );

    // Convert back to unified format
    return this.mapLegacyResult(result);
  }
}
```

### 2.4 Integration Point in Config

**File**: `packages/core/src/config/config.ts` (update)

```typescript
import { GenerationServiceImpl } from '../generation/service.js';
import { LegacyGenerationAdapter } from '../generation/legacy-adapter.js';
import { FeatureFlags } from './featureFlags.js';

class Config {
  private generationService?: GenerationService;

  getGenerationService(): GenerationService {
    if (!this.generationService) {
      if (FeatureFlags.USE_UNIFIED_PROVIDERS) {
        this.generationService = new GenerationServiceImpl(
          this.getProviderCoordinator(),
          this.getPluginManager(),
        );
      } else {
        // Backward compatible - wrap legacy
        this.generationService = new LegacyGenerationAdapter(
          this.getContentGenerator(),
        );
      }
    }
    return this.generationService;
  }
}
```

**Testing**:

```bash
# Test both paths
QWEN_UNIFIED_PROVIDERS=false npm run test -- --grep "generation"
QWEN_UNIFIED_PROVIDERS=true npm run test -- --grep "generation"
```

---

## Phase 3: Unified Provider Refactoring (2 weeks)

### 3.1 Simplify Provider Interface

Remove duplicate `chat()` and `chatStream()` methods; rely on `languageModel()` only:

**File**: `packages/core/src/provider/interface.ts`

```typescript
import type { LanguageModel } from 'ai';

export interface UnifiedProvider {
  readonly id: string;
  readonly name: string;
  readonly models: ModelDefinition[];

  /**
   * Core method: returns a Vercel AI SDK LanguageModel
   */
  languageModel(modelId: string): LanguageModel;

  /**
   * Validate configuration
   */
  validate(): Promise<ValidationResult>;

  /**
   * List available models
   */
  listModels(): ModelDefinition[];
}
```

### 3.2 Refactor Existing Providers

For each provider in `packages/core/src/provider/`:

```typescript
// openai.ts - simplified
import { createOpenAI } from '@ai-sdk/openai';

export class OpenAIProvider implements UnifiedProvider {
  private client = createOpenAI({ apiKey: this.config.apiKey });

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }

  // Remove chat(), chatStream() - handled by GenerationService
}
```

### 3.3 Add Google/Gemini Provider

**File**: `packages/core/src/provider/gemini.ts`

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export class GeminiProvider implements UnifiedProvider {
  id = 'gemini';
  name = 'Google Gemini';

  private client = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
  });

  languageModel(modelId: string): LanguageModel {
    return this.client(modelId);
  }
}
```

### 3.4 Update Coordinator

```typescript
// provider/coordinator.ts
export class ProviderCoordinator {
  // Keep existing but ensure it works with GenerationService
  getModel(options: { provider?: string; model: string }): LanguageModel {
    const provider = options.provider
      ? this.getProvider(options.provider)
      : this.getActiveProvider();
    return provider.languageModel(options.model);
  }
}
```

**Testing**:

```bash
npm run test -- --grep "provider"
```

---

## Phase 4: ACP Integration (1 week)

### 4.1 Update ACP Agent to Use GenerationService

**File**: `packages/core/src/acp/agent.ts` (update)

```typescript
import type { GenerationService } from '../generation/interface.js';

export class ACPAgent {
  constructor(
    private connection: AgentSideConnection,
    private config: ACPConfig,
    private generationService: GenerationService, // NEW
  ) {}

  async prompt(params: PromptRequest) {
    const messages = this.buildMessages(params);

    // Use unified generation service
    const result = await this.generationService.generate(messages, {
      model: this.config.model,
      tools: this.getTools(),
    });

    return this.processResult(result);
  }
}
```

### 4.2 Integrate Session Compaction

Connect `SessionCompactor` to the generation flow:

```typescript
// In generation/service.ts
async generate(messages, options) {
  // Check if compaction needed
  if (this.compactor && this.compactor.shouldCompact(messages)) {
    const { messages: compacted } = await this.compactor.compactMessages(
      this.sessionId,
      messages,
      this.createSummarizer(),
    );
    messages = compacted;
  }

  // Continue with generation
}
```

**Testing**:

```bash
npm run test -- --grep "acp"
```

---

## Phase 5: Plugin Integration (1 week)

### 5.1 Wire Plugin Hooks

Ensure all hooks are triggered:

```typescript
// generation/service.ts
async generate(messages, options) {
  // Hook: chat.params
  const chatParams = await this.pluginManager?.trigger(
    'chat.params',
    { messages, options },
    { messages, options }
  );

  // Hook: experimental.chat.messages.transform
  const transformed = await this.pluginManager?.trigger(
    'experimental.chat.messages.transform',
    { messages: chatParams.messages },
    { messages: chatParams.messages }
  );

  // Generate...
  const result = await generateText({ ... });

  // Hook: chat.message
  await this.pluginManager?.trigger('chat.message', { ... }, { ... });

  return result;
}
```

### 5.2 Add Tool Hooks

```typescript
// In tool execution
async executeToolCall(toolCall) {
  // Hook: tool.execute.before
  await this.pluginManager?.trigger('tool.execute.before', { toolCall }, {});

  const result = await this.toolRegistry.execute(toolCall);

  // Hook: tool.execute.after
  await this.pluginManager?.trigger('tool.execute.after', { toolCall, result }, {});

  return result;
}
```

**Testing**:

```bash
npm run test -- --grep "plugin"
```

---

## Phase 6: Deprecation & Cleanup (1 week)

### 6.1 Mark Legacy Code as Deprecated

```typescript
// core/contentGenerator.ts
/**
 * @deprecated Use GenerationService instead
 * This will be removed in version 2.0
 */
export interface ContentGenerator {
  // ...
}
```

### 6.2 Update Documentation

- Add migration guide to README
- Update API documentation
- Add deprecation warnings in JSDoc

### 6.3 Remove Feature Flags (Later)

After validation period:

```bash
# Remove flags
git rm packages/core/src/config/featureFlags.ts

# Delete legacy code
git rm -rf packages/core/src/core/openaiContentGenerator
git rm -rf packages/core/src/core/anthropicContentGenerator
git rm -rf packages/core/src/core/geminiContentGenerator
git rm packages/core/src/core/baseLlmClient.ts
```

---

## Phase 7: Final Migration (1 week)

### 7.1 Remove Legacy Adapter

Once all tests pass with `USE_UNIFIED_PROVIDERS=true`:

```bash
git rm packages/core/src/generation/legacy-adapter.ts
```

### 7.2 Refactor GeminiClient

Replace `GeminiClient` with thin wrapper around `GenerationService`:

```typescript
// core/client.ts
/**
 * @deprecated Migrate to SessionManager
 */
export class GeminiClient {
  constructor(private config: Config) {}

  async sendMessageStream(request, signal, promptId) {
    // Delegate to GenerationService
    return this.config
      .getGenerationService()
      .stream(this.convertRequest(request), { signal });
  }
}
```

### 7.3 Update Package Exports

```typescript
// packages/core/src/index.ts
// Primary exports
export {
  GenerationService,
  GenerationServiceImpl,
} from './generation/index.js';
export { ProviderCoordinator } from './provider/coordinator.js';
export { UnifiedProvider } from './provider/interface.js';

// Legacy (deprecated)
export { ContentGenerator } from './core/contentGenerator.js';
export { GeminiClient } from './core/client.js';
```

---

## Timeline Summary

| Phase | Duration | Dependencies | Key Deliverables                 |
| :---- | :------- | :----------- | :------------------------------- |
| **0** | 1 week   | None         | Documentation, infrastructure    |
| **1** | 1 week   | Phase 0      | Unified types, converter         |
| **2** | 2 weeks  | Phase 1      | GenerationService, LegacyAdapter |
| **3** | 2 weeks  | Phase 2      | Simplified providers             |
| **4** | 1 week   | Phase 3      | ACP integration                  |
| **5** | 1 week   | Phase 4      | Plugin hooks                     |
| **6** | 1 week   | Phase 5      | Deprecation, docs                |
| **7** | 1 week   | Phase 6      | Final cleanup                    |

**Total**: ~10 weeks

---

## Validation Checklist

Before each phase completion:

- [ ] All existing tests pass
- [ ] New tests cover added functionality
- [ ] TypeScript compilation successful
- [ ] No regression in CLI functionality
- [ ] No regression in VSCode extension
- [ ] Documentation updated
- [ ] Deprecation warnings added where appropriate

---

## Rollback Plan

Each phase can be rolled back by:

1. Reverting the Git commits for that phase
2. Setting `USE_UNIFIED_PROVIDERS=false`
3. Verifying all tests pass

The `LegacyAdapter` ensures backward compatibility until Phase 7.
