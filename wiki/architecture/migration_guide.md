# Migration Guide: ContentGenerator to GenerationService

This guide explains how to migrate from the legacy `ContentGenerator` API to the new `GenerationService` API.

## Overview

The architecture has been consolidated to use a unified provider system based on Vercel AI SDK. The new `GenerationService` is the recommended API for all LLM generation operations.

| Legacy API                                 | New API                        |
| :----------------------------------------- | :----------------------------- |
| `ContentGenerator.generateContent()`       | `GenerationService.generate()` |
| `ContentGenerator.generateContentStream()` | `GenerationService.stream()`   |
| `Provider.chat()`                          | `GenerationService.generate()` |
| `Provider.chatStream()`                    | `GenerationService.stream()`   |
| `Coordinator.chat()`                       | `GenerationService.generate()` |

---

## Quick Migration

### Before (Legacy)

```typescript
import { Config } from '@qwen-code/core';

const config = new Config({ ... });
await config.initialize();

// Using ContentGenerator
const contentGenerator = config.getContentGenerator();
const response = await contentGenerator.generateContent({
  contents: messages,
  model: 'gemini-1.5-pro',
});
```

### After (New)

```typescript
import { Config } from '@qwen-code/core';

const config = new Config({ ... });
await config.initialize();

// Using GenerationService
const generationService = config.getGenerationService();
const result = await generationService.generate(messages, {
  model: 'gemini-1.5-pro',
});

console.log(result.content);      // Generated text
console.log(result.toolCalls);    // Tool calls if any
console.log(result.usage);        // Token usage
```

---

## Message Format

Messages now use the Vercel AI SDK `ModelMessage` type instead of `@google/genai` `Content` type.

### Converting Messages

```typescript
import { contentToModelMessage, modelMessageToContent } from '@qwen-code/core';

// Legacy Content to ModelMessage
const legacyContent = { role: 'user', parts: [{ text: 'Hello' }] };
const { result: modelMessage } = contentToModelMessage(legacyContent);

// ModelMessage to legacy Content (if needed)
const { result: content } = modelMessageToContent(modelMessage);
```

### Creating Messages Directly

```typescript
import type { ModelMessage } from 'ai';

const messages: ModelMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello!' },
];
```

---

## Streaming

### Before

```typescript
for await (const chunk of contentGenerator.generateContentStream(request)) {
  const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) process.stdout.write(text);
}
```

### After

```typescript
for await (const chunk of generationService.stream(messages, options)) {
  if (chunk.type === 'text-delta' && chunk.textDelta) {
    process.stdout.write(chunk.textDelta);
  }
  if (chunk.type === 'finish') {
    console.log('Done:', chunk.finishReason);
  }
}
```

---

## Tool Calling

Tool calls are now returned in a standardized format:

```typescript
const result = await generationService.generate(messages, {
  model: 'gpt-4o',
  tools: myTools,
});

if (result.toolCalls) {
  for (const toolCall of result.toolCalls) {
    console.log('Tool:', toolCall.name);
    console.log('Args:', toolCall.arguments);
    // Execute tool...
  }
}
```

---

## Provider Access

If you need direct access to a Vercel AI SDK `LanguageModel`:

```typescript
const model = generationService.getLanguageModel('gpt-4o', 'openai');
// Use with Vercel AI SDK directly
import { generateText } from 'ai';
const result = await generateText({ model, messages });
```

---

## Deprecated APIs

The following APIs are deprecated and will be removed in a future version:

- `ContentGenerator` interface and implementations
- `Provider.chat()` and `Provider.chatStream()` methods
- `Coordinator.chat()` and `Coordinator.chatStream()` methods
- `GeminiClient` class
- `BaseLlmClient` class

---

## Feature Flags

During the transition period, you can control which code path is used:

```bash
# Use new unified provider path (recommended)
export QWEN_UNIFIED_PROVIDERS=true

# Use legacy ContentGenerator path (backward compatibility)
export QWEN_UNIFIED_PROVIDERS=false
```

---

## Related Documentation

- [Architecture Redesign](./architecture_redesign.md)
- [Migration Plan](./migration_plan.md)
- [Current Issues](./current_issues.md)
