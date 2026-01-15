# Architecture Documentation

This directory contains the architecture analysis and redesign proposal for qwen-code following the feature migration from opencode and crush.

## Documents

### 1. [Current Issues Analysis](./current_issues.md)

Analyzes the technical debt introduced by the patch-based migration approach:

- **Dual Provider Systems**: Legacy `ContentGenerator` vs new `ProviderCoordinator`
- **API Inconsistency**: `@google/genai` types vs Vercel AI SDK types
- **Dead Code**: Unused but implemented features
- **Configuration Fragmentation**: Two separate config systems
- **Integration Gaps**: Components not properly connected

### 2. [Architecture Redesign](./architecture_redesign.md)

Proposes a unified architecture based on Vercel AI SDK:

- **Single Provider Abstraction**: One interface for all LLMs
- **Unified Message Types**: Based on `CoreMessage` from Vercel AI
- **Generation Service**: Central orchestration layer
- **Component Mapping**: What to keep, remove, and refactor

### 3. [Migration Plan](./migration_plan.md)

Incremental execution plan with 8 phases:

| Phase | Duration | Description                      |
| :---- | :------- | :------------------------------- |
| 0     | 1 week   | Preparation & infrastructure     |
| 1     | 1 week   | Unified types & converters       |
| 2     | 2 weeks  | GenerationService implementation |
| 3     | 2 weeks  | Provider refactoring             |
| 4     | 1 week   | ACP integration                  |
| 5     | 1 week   | Plugin hook wiring               |
| 6     | 1 week   | Deprecation & cleanup            |
| 7     | 1 week   | Final migration                  |

**Total: ~10 weeks**

---

## Quick Reference

### Current State (Post-Feature-Migration)

```
packages/core/src/
├── core/                  # ❌ LEGACY - To be deprecated
│   ├── contentGenerator.ts
│   ├── client.ts (GeminiClient)
│   ├── openaiContentGenerator/
│   └── anthropicContentGenerator/
│
├── provider/              # ✅ NEW - To be enhanced
│   ├── coordinator.ts
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── azure.ts
│   ├── bedrock.ts
│   ├── google.ts
│   └── openrouter.ts
│
├── acp/                   # ✅ KEEP - Needs integration
├── plugin/                # ✅ KEEP - Needs integration
├── lsp/                   # ✅ KEEP - Already integrated
├── skills/                # ✅ KEEP - Already integrated
└── tools/                 # ✅ KEEP - Minor updates
```

### Target State (Post-Architecture-Consolidation)

```
packages/core/src/
├── generation/            # NEW - Unified generation
│   ├── service.ts
│   └── interface.ts
│
├── provider/              # ENHANCED - Pure providers
│   ├── coordinator.ts
│   └── [providers].ts
│
├── types/                 # NEW - Unified types
│   └── unified/
│
├── acp/                   # INTEGRATED
├── plugin/                # INTEGRATED
├── lsp/                   # UNCHANGED
├── skills/                # UNCHANGED
└── tools/                 # MINOR UPDATES
```

---

## Getting Started

1. Read [current_issues.md](./current_issues.md) for context
2. Review [architecture_redesign.md](./architecture_redesign.md) for the proposed solution
3. Follow [migration_plan.md](./migration_plan.md) for implementation steps
