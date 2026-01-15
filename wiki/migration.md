# Migration Guide: Enhancing qwen-code with Features from opencode and crush

## 1. Executive Summary

This comprehensive migration guide details the strategic plan to enhance the **qwen-code** repository by transplanting superior feature implementations from **opencode** (TypeScript) and **crush** (Go).

**Goal**: Transform `qwen-code` into a robust, feature-rich AI coding assistant monorepo that combines:

- `qwen-code`'s existing CLI, VSCode foundation, and powerful subagent system
- `opencode`'s advanced LSP integration, Tree-sitter AST parsing, plugin architecture, and ACP robustness
- `crush`'s industry-standard Skills implementation, multi-provider coordination, and highly optimized Tools

> [!IMPORTANT]
> This migration requires careful analysis of each feature area to determine the "Gold Standard" implementation and the appropriate porting strategy (direct port, logic rewrite, or concept adaptation).

---

## 2. Project Architecture Overview

### 2.1 qwen-code (TypeScript/Node.js)

| Component            | Path                            | Description                                                  |
| :------------------- | :------------------------------ | :----------------------------------------------------------- |
| **CLI**              | `packages/cli`                  | Command-line interface (611 files)                           |
| **Core**             | `packages/core/src`             | Core functionality including ACP, MCP, LSP, tools, subagents |
| **SDK TypeScript**   | `packages/sdk-typescript`       | TypeScript SDK for external integrations                     |
| **SDK Java**         | `packages/sdk-java`             | Java SDK for JVM integrations                                |
| **VSCode Extension** | `packages/vscode-ide-companion` | IDE integration                                              |

**Key Strengths**:

- Full subagent system with `SubAgentScope`, `ContextState`, statistics, event emitters
- Comprehensive tool registry with 59 tools
- Integrated MCP OAuth/token storage system

### 2.2 opencode (TypeScript/Node.js)

| Component   | Path                    | Description                                |
| :---------- | :---------------------- | :----------------------------------------- |
| **Core**    | `packages/opencode/src` | Main application logic (35 subdirectories) |
| **Plugin**  | `packages/plugin/src`   | Plugin SDK with hook-based architecture    |
| **SDK**     | `packages/sdk`          | Client SDK for API access                  |
| **UI**      | `packages/ui`           | Web-based UI components                    |
| **Console** | `packages/console`      | Admin console                              |

**Key Strengths**:

- Extensive LSP server support (2033 lines, 15+ languages)
- Hook-based plugin system for extensibility
- Advanced session management with compaction, prompt engineering
- Full ACP implementation with state machine

### 2.3 crush (Go)

| Component  | Path                   | Description                                   |
| :--------- | :--------------------- | :-------------------------------------------- |
| **Agent**  | `internal/agent`       | Core agent with coordinator pattern           |
| **Tools**  | `internal/agent/tools` | 48 optimized tools                            |
| **Skills** | `internal/skills`      | agentskills.io compliant implementation       |
| **Config** | `internal/config`      | Provider configuration with multi-LLM support |
| **LSP**    | `internal/lsp`         | LSP client for code intelligence              |
| **TUI**    | `internal/tui`         | Bubbletea-based terminal UI                   |

**Key Strengths**:

- Coordinator pattern for multi-agent orchestration
- Multi-provider support (Anthropic, OpenAI, OpenRouter, Azure, Bedrock, Google)
- Spec-compliant Skills implementation
- High-performance Go-based tools (ripgrep, multiedit)

---

## 3. Feature Comparison Matrix

### 3.1 Core Features

| Feature          | qwen-code    | opencode               | crush     | **Gold Standard** | **Migration Action**                                       |
| :--------------- | :----------- | :--------------------- | :-------- | :---------------- | :--------------------------------------------------------- |
| **Language**     | TypeScript   | TypeScript             | Go        | N/A               | Maintain TS; rewrite Go logic                              |
| **UI Framework** | Ink (React)  | OpenTUI (SolidJS)      | Bubbletea | qwen-code         | Keep Ink; adapt concepts                                   |
| **CLI**          | Commander.js | Citty                  | Cobra     | opencode          | Port command structure                                     |
| **AST Parsing**  | None         | **Tree-sitter (WASM)** | None      | **opencode**      | **New Feature**: Integreate `opencode`'s AST capabilities. |

### 3.2 MCP (Model Context Protocol)

| Aspect                | qwen-code            | opencode          | crush           | **Gold Standard** | **Priority**  |
| :-------------------- | :------------------- | :---------------- | :-------------- | :---------------- | :------------ |
| **OAuth Support**     | ✅ Full (28KB)       | ✅ Basic (4KB)    | ❌              | **qwen-code**     | Keep existing |
| **Token Storage**     | ✅ Multiple backends | ✅ Basic          | ❌              | **qwen-code**     | Keep existing |
| **Server Management** | ⚠️ Basic             | ✅ Full lifecycle | ❌ Native tools | **opencode**      | Port manager  |
| **Client Manager**    | ✅ (4.6KB)           | ✅ (27KB)         | ❌              | **opencode**      | Port index.ts |

```diff
# MCP Migration Strategy
- qwen-code: Keep OAuth/token storage (22 files)
+ opencode: Port server lifecycle management from packages/opencode/src/mcp/index.ts
```

### 3.3 LSP (Language Server Protocol)

| Aspect                    | qwen-code      | opencode                | crush            | **Gold Standard** | **Priority** |
| :------------------------ | :------------- | :---------------------- | :--------------- | :---------------- | :----------- |
| **Client Implementation** | ⚠️ Basic (3KB) | ✅ Full (8KB)           | ✅ Go (14KB)     | **opencode**      | HIGH         |
| **Server Definitions**    | ❌             | ✅ 15+ languages (62KB) | ❌               | **opencode**      | HIGH         |
| **Diagnostics Handler**   | ❌             | ✅ Built-in             | ✅ Tool-based    | **crush**         | MEDIUM       |
| **References Tool**       | ❌             | ✅ lsp.ts               | ✅ references.go | **crush**         | MEDIUM       |

**Supported Languages in opencode LSP Server**:

| Language      | Server ID                | Extensions                                   |
| :------------ | :----------------------- | :------------------------------------------- |
| TypeScript/JS | `typescript`             | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Deno          | `deno`                   | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`         |
| Vue           | `vue`                    | `.vue`                                       |
| ESLint        | `eslint`                 | `.ts`, `.tsx`, `.js`, `.jsx`, etc.           |
| Biome         | `biome`                  | `.ts`, `.json`, `.css`, `.html`, etc.        |
| Python        | `pyright`, `ty`          | `.py`, `.pyi`                                |
| Go            | `gopls`                  | `.go`                                        |
| Ruby          | `ruby-lsp`               | `.rb`, `.rake`, `.gemspec`                   |
| Rust          | `rust-analyzer`          | `.rs`                                        |
| C/C++         | `clangd`                 | `.c`, `.cpp`, `.h`, `.hpp`                   |
| Java          | `jdtls`                  | `.java`                                      |
| PHP           | `intelephense`           | `.php`                                       |
| Swift         | `sourcekit-lsp`          | `.swift`                                     |
| Kotlin        | `kotlin-language-server` | `.kt`, `.kts`                                |
| Zig           | `zls`                    | `.zig`                                       |

### 3.4 Agent/ACP (Agent Client Protocol)

| Aspect                 | qwen-code         | opencode            | crush                   | **Gold Standard** | **Priority** |
| :--------------------- | :---------------- | :------------------ | :---------------------- | :---------------- | :----------- |
| **Session Management** | ⚠️ Basic (8KB)    | ✅ Full (14KB)      | ✅ Go (session.Service) | **opencode**      | HIGH         |
| **ACP Agent**          | ⚠️ Loose coupling | ✅ Full (37KB)      | ❌ Different pattern    | **opencode**      | HIGH         |
| **State Machine**      | ⚠️ Partial        | ✅ Complete         | ✅ Complete             | **opencode**      | HIGH         |
| **Message Processing** | ⚠️ Basic          | ✅ Advanced (19KB)  | ✅ message.Service      | **opencode**      | MEDIUM       |
| **Compaction**         | ❌                | ✅ (7KB)            | ❌                      | **opencode**      | MEDIUM       |
| **Prompt Engineering** | ⚠️ Basic          | ✅ (60KB prompt.ts) | ✅ (25KB prompts)       | **opencode**      | HIGH         |

### 3.5 Subagent System

| Aspect             | qwen-code          | opencode     | crush              | **Gold Standard** | **Priority** |
| :----------------- | :----------------- | :----------- | :----------------- | :---------------- | :----------- |
| **Subagent Scope** | ✅ Full (31KB)     | ❌           | ⚠️ isSubAgent flag | **qwen-code**     | Keep         |
| **Context State**  | ✅ Key-value pairs | ❌           | ❌                 | **qwen-code**     | Keep         |
| **Statistics**     | ✅ (8.6KB)         | ❌           | ❌                 | **qwen-code**     | Keep         |
| **Event Emitter**  | ✅ (3KB)           | ✅ Event bus | ✅ Event bus       | **qwen-code**     | Keep         |
| **Builtin Agents** | ✅ (4KB)           | ❌           | ❌                 | **qwen-code**     | Keep         |
| **Validation**     | ✅ (10KB)          | ❌           | ❌                 | **qwen-code**     | Keep         |

> [!TIP]
> qwen-code's subagent system is the most comprehensive. Consider exposing it via plugin hooks for extensibility (inspired by opencode's plugin architecture).

### 3.6 Skills System

| Aspect                 | qwen-code         | opencode       | crush                                                             | **Gold Standard** | **Priority** |
| :--------------------- | :---------------- | :------------- | :---------------------------------------------------------------- | :---------------- | :----------- |
| **SKILL.md Parsing**   | ✅ Custom         | ⚠️ Basic (3KB) | ✅ Spec-compliant                                                 | **crush**         | HIGH         |
| **Validation**         | ⚠️ Custom rules   | ⚠️ Minimal     | ✅ agentskills.io spec                                            | **crush**         | HIGH         |
| **Discovery**          | ✅ Manager (16KB) | ⚠️ Basic       | ✅ Concurrent fastwalk                                            | **crush**         | MEDIUM       |
| **Prompt Generation**  | ⚠️ Custom         | ⚠️ Custom      | ✅ XML format                                                     | **crush**         | HIGH         |
| **Frontmatter Struct** | ⚠️ Partial        | ⚠️ Partial     | ✅ Complete (name, description, license, compatibility, metadata) | **crush**         | HIGH         |

> [!NOTE]
> **Integration Strategy**: Skills (from `crush`) and Subagents (from `qwen-code`) are complementary.
>
> - **Skills** define atomic capabilities (tools + instructions) in a standard format.
> - **Subagents** define execution scopes that _use_ these skills to solve complex tasks.
>   The migration will standardize `qwen-code`'s tool definitions to the `crush` Skill format.

**crush Skill Spec Compliance** (from [agentskills.io](https://agentskills.io)):

```go
// From crush/internal/skills/skills.go
const (
    SkillFileName          = "SKILL.md"
    MaxNameLength          = 64
    MaxDescriptionLength   = 1024
    MaxCompatibilityLength = 500
)

var namePattern = regexp.MustCompile(`^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$`)

type Skill struct {
    Name          string            `yaml:"name"`
    Description   string            `yaml:"description"`
    License       string            `yaml:"license,omitempty"`
    Compatibility string            `yaml:"compatibility,omitempty"`
    Metadata      map[string]string `yaml:"metadata,omitempty"`
    Instructions  string            // Markdown body
    Path          string
    SkillFilePath string
}
```

### 3.7 Tools System

| Tool Category   | qwen-code         | opencode          | crush               | **Gold Standard** | **Action**        |
| :-------------- | :---------------- | :---------------- | :------------------ | :---------------- | :---------------- |
| **Registry**    | ✅ (14KB)         | ✅ (4KB)          | ✅ tools.go         | **qwen-code**     | Keep              |
| **Edit/Write**  | ✅ (20KB)         | ✅ (20KB)         | ✅ (14KB)           | qwen-code         | Keep              |
| **Grep**        | ✅ (4.7KB)        | ✅ (4KB)          | ✅ (10KB) optimized | **crush**         | Port optimization |
| **RipGrep**     | ✅ (10KB)         | ❌                | ✅ rg.go            | qwen-code         | Keep              |
| **MultiEdit**   | ✅ (3.5KB)        | ✅ (1.5KB)        | ✅ (14KB) robust    | **crush**         | Port robustness   |
| **Shell/Bash**  | ✅ (23KB)         | ✅ (8KB)          | ✅ (13KB)           | qwen-code         | Keep              |
| **Web Fetch**   | ✅ (7.9KB)        | ✅ (5.2KB)        | ✅ (5.4KB)          | qwen-code         | Keep              |
| **Web Search**  | ✅ (subdirectory) | ✅ (4KB)          | ✅ (1.2KB)          | qwen-code         | Keep              |
| **Memory**      | ✅ (19KB)         | ❌                | ❌                  | **qwen-code**     | Keep              |
| **Smart Edit**  | ✅ (32KB)         | ❌                | ❌                  | **qwen-code**     | Keep              |
| **Task**        | ✅ (18KB)         | ✅ (6.5KB)        | ❌                  | **qwen-code**     | Keep              |
| **Todo**        | ✅ (18KB)         | ✅ (1.3KB)        | ✅ (4KB)            | **qwen-code**     | Keep              |
| **LSP Tool**    | ❌                | ✅ lsp.ts (2.8KB) | ❌                  | **opencode**      | Port              |
| **Diagnostics** | ❌                | ❌                | ✅ (5.1KB)          | **crush**         | Port              |
| **References**  | ❌                | ❌                | ✅ (5.7KB)          | **crush**         | Port              |
| **Batch**       | ❌                | ✅ (6KB)          | ❌                  | **opencode**      | Port              |
| **Plan Mode**   | ✅ exitPlanMode   | ✅ plan.ts        | ❌                  | opencode          | Keep              |

### 3.8 Plugin System

| Aspect                  | qwen-code | opencode            | crush | **Gold Standard** | **Priority** |
| :---------------------- | :-------- | :------------------ | :---- | :---------------- | :----------- |
| **Plugin Architecture** | ❌        | ✅ Full (5.5KB API) | ❌    | **opencode**      | HIGH         |
| **Hook System**         | ❌        | ✅ 10+ hook types   | ❌    | **opencode**      | HIGH         |
| **Auth Hooks**          | ❌        | ✅ OAuth/API        | ❌    | **opencode**      | HIGH         |
| **Tool Hooks**          | ❌        | ✅ before/after     | ❌    | **opencode**      | MEDIUM       |
| **Event Hooks**         | ❌        | ✅ event handler    | ❌    | **opencode**      | MEDIUM       |
| **Codex Integration**   | ❌        | ✅ codex.ts (16KB)  | ❌    | **opencode**      | LOW          |

**opencode Plugin Hook Types**:

```typescript
interface Hooks {
  event?: (input: { event: Event }) => Promise<void>;
  config?: (input: Config) => Promise<void>;
  tool?: { [key: string]: ToolDefinition };
  auth?: AuthHook;
  'chat.message'?: (input, output) => Promise<void>;
  'chat.params'?: (input, output) => Promise<void>;
  'permission.ask'?: (input, output) => Promise<void>;
  'tool.execute.before'?: (input, output) => Promise<void>;
  'tool.execute.after'?: (input, output) => Promise<void>;
  'experimental.chat.messages.transform'?: (input, output) => Promise<void>;
  'experimental.chat.system.transform'?: (input, output) => Promise<void>;
  'experimental.session.compacting'?: (input, output) => Promise<void>;
  'experimental.text.complete'?: (input, output) => Promise<void>;
}
```

### 3.9 Multi-LLM Provider Support

| Provider              | qwen-code  | opencode           | crush            | **Gold Standard** |
| :-------------------- | :--------- | :----------------- | :--------------- | :---------------- |
| **OpenAI**            | ✅ (1.2KB) | ✅ (41KB provider) | ✅               | opencode/crush    |
| **Anthropic**         | ✅ (1.3KB) | ✅                 | ✅               | opencode/crush    |
| **Local Models**      | ✅ (1.4KB) | ✅                 | ✅ OpenAI-compat | opencode          |
| **Azure**             | ❌         | ✅                 | ✅               | **crush**         |
| **AWS Bedrock**       | ❌         | ⚠️                 | ✅               | **crush**         |
| **Google Vertex**     | ❌         | ✅                 | ✅               | **crush**         |
| **OpenRouter**        | ❌         | ⚠️                 | ✅               | **crush**         |
| **Provider Registry** | ✅ (1KB)   | ✅ SDK pattern     | ✅ Coordinator   | **opencode**      |

### 3.10 Command System

| Aspect                   | qwen-code    | opencode     | crush | **Gold Standard** |
| :----------------------- | :----------- | :----------- | :---- | :---------------- |
| **CLI Framework**        | Commander.js | Citty        | Cobra | opencode          |
| **Command Templates**    | ❌           | ✅ template/ | ❌    | **opencode**      |
| **Interactive Commands** | ✅           | ✅           | ✅    | All               |

---

## 4. Special/Unique Features

### 4.1 qwen-code Unique Features

| Feature             | Location                      | Size     | Description                         |
| :------------------ | :---------------------------- | :------- | :---------------------------------- |
| **Smart Edit**      | `tools/smart-edit.ts`         | 32KB     | AI-powered intelligent code editing |
| **Memory Tool**     | `tools/memoryTool.ts`         | 19KB     | Persistent memory across sessions   |
| **Todo Write**      | `tools/todoWrite.ts`          | 18KB     | Advanced TODO management            |
| **Exit Plan Mode**  | `tools/exitPlanMode.ts`       | 5.7KB    | Planning mode transitions           |
| **Read Many Files** | `tools/read-many-files.ts`    | 21KB     | Batch file reading                  |
| **Modifiable Tool** | `tools/modifiable-tool.ts`    | 4.5KB    | Dynamic tool modification           |
| **Subagent Hooks**  | `subagents/subagent-hooks.ts` | 797B     | Extensible subagent lifecycle       |
| **Telemetry**       | `telemetry/`                  | 26 files | Comprehensive telemetry system      |

### 4.2 opencode Unique Features

| Feature                | Location                | Size     | Description                   |
| :--------------------- | :---------------------- | :------- | :---------------------------- |
| **Session Compaction** | `session/compaction.ts` | 7KB      | Automatic context compression |
| **Prompt Engineering** | `session/prompt.ts`     | 60KB     | Advanced prompt templates     |
| **Share**              | `share/`                | 2 files  | Session sharing functionality |
| **Snapshot**           | `snapshot/`             | 1 file   | Session state snapshots       |
| **Worktree**           | `worktree/`             | 1 file   | Git worktree integration      |
| **Message V2**         | `session/message-v2.ts` | 19KB     | Advanced message handling     |
| **Provider SDK**       | `provider/sdk/`         | 17 files | Provider abstraction layer    |
| **Retry Logic**        | `session/retry.ts`      | 3KB      | Automatic retry handling      |
| **Revert**             | `session/revert.ts`     | 3.8KB    | Session state reversion       |

### 4.3 crush Unique Features

| Feature                 | Location                 | Size     | Description                |
| :---------------------- | :----------------------- | :------- | :------------------------- |
| **Coordinator**         | `agent/coordinator.go`   | 25KB     | Multi-agent coordination   |
| **Fantasy Provider**    | Via `charm.land/fantasy` | External | Provider abstraction       |
| **Catwalk Integration** | `config/catwalk.go`      | 1.9KB    | Model capability detection |
| **Hyper Mode**          | `agent/hyper/`           | 2 files  | High-performance mode      |
| **Job Management**      | `tools/job_*.go`         | 3.7KB    | Background job handling    |
| **Sourcegraph Search**  | `tools/sourcegraph.go`   | 7.8KB    | Enterprise code search     |
| **Download Tool**       | `tools/download.go`      | 4.6KB    | File download capability   |
| **Permission Service**  | `permission/`            | 2 files  | Fine-grained permissions   |
| **File Tracker**        | `filetracker/`           | 1 file   | File change tracking       |

---

## 5. Detailed Migration Plan

### Phase 1: LSP Integration (HIGH Priority)

**Objective**: Establish comprehensive language server support for code intelligence.

#### 1.1 Port LSP Server Definitions

**Source**: [opencode/packages/opencode/src/lsp/server.ts](file:///Users/mxue/GitRepos/Codebreeze/opencode/packages/opencode/src/lsp/server.ts)

**Target**: `packages/core/src/lsp/servers/`

**Actions**:

1. Create `servers/` subdirectory with individual server configs
2. Port `LSPServer.Info` interface and `NearestRoot` function
3. Implement spawn logic for each language server:
   - TypeScript/JavaScript (`typescript-language-server`)
   - Python (`pyright`, `ty`)
   - Go (`gopls`)
   - Rust (`rust-analyzer`)
   - Ruby (`ruby-lsp`)
   - PHP (`intelephense`)
   - Java (`jdtls`)
   - C/C++ (`clangd`)
   - Vue (`vue-language-server`)
   - ESLint, Biome, Oxlint linters

#### 1.2 Enhance LSP Client

**Source**: [opencode/packages/opencode/src/lsp/client.ts](file:///Users/mxue/GitRepos/Codebreeze/opencode/packages/opencode/src/lsp/client.ts) (8KB)

**Current**: [qwen-code/packages/core/src/lsp/client.ts](file:///Users/mxue/GitRepos/Codebreeze/qwen-code/packages/core/src/lsp/client.ts) (3KB)

**Actions**:

1. Port enhanced initialization with Zod schema validation
2. Add diagnostics event handling (`textDocument/publishDiagnostics`)
3. Implement auto-restart on crash
4. Add LSP method wrappers (references, definitions, hover)

#### 1.3 Add LSP Tools

**Sources**:

- [opencode lsp.ts](file:///Users/mxue/GitRepos/Codebreeze/opencode/packages/opencode/src/tool/lsp.ts)
- [crush diagnostics.go](file:///Users/mxue/GitRepos/Codebreeze/crush/internal/agent/tools/diagnostics.go)
- [crush references.go](file:///Users/mxue/GitRepos/Codebreeze/crush/internal/agent/tools/references.go)

**Actions**:

1. Create `tools/lsp-diagnostics.ts` - Get file/project diagnostics
2. Create `tools/lsp-references.ts` - Find symbol references
3. Create `tools/lsp-definitions.ts` - Go to definition

---

### Phase 0: Runtime Compatibility Layer (CRITICAL - Prerequisite)

**Objective**: Bridge the gap between `opencode`'s Bun-based infrastructure and `qwen-code`'s Node.js environment. **This must be completed first as all subsequent phases depend on it.**

**Risk Identification**:

- `opencode` heavily uses `Bun.spawn`, `Bun.file`, `Bun.write`, and `Bun.serve`.
- `qwen-code` runs on Node.js (v20+).

**Actions**:

1. **Create Runtime Adapter**: Implement `packages/core/src/runtime/bun-adapter.ts`:

   ```typescript
   // Polyfill Bun.spawn
   export async function spawn(cmd: string[], options?: SpawnOptions) {
     return execa(cmd[0], cmd.slice(1), options);
   }

   // Polyfill Bun.file
   export function file(path: string) {
     return {
       async text() {
         return fs.readFile(path, 'utf-8');
       },
       async json() {
         return JSON.parse(await this.text());
       },
       async exists() {
         return fs
           .access(path)
           .then(() => true)
           .catch(() => false);
       },
     };
   }
   ```

2. **Create Unit Tests**: Test each polyfill against Bun's documented behavior.
3. **Document API Mapping**: Create a reference table of Bun → Node equivalents.

**Estimated Duration**: 3 days

---

### Phase 2: Plugin System (HIGH Priority)

**Objective**: Enable extensibility through a hook-based plugin architecture.

#### 2.1 Create Plugin Package

**Source**: [opencode/packages/plugin/src/index.ts](file:///Users/mxue/GitRepos/Codebreeze/opencode/packages/plugin/src/index.ts)

**Target**: `packages/plugin/`

**Actions**:

1. Create new package `packages/plugin`
2. Port `PluginInput` interface for plugin initialization
3. Port `Hooks` interface with all hook types
4. Port `AuthHook` for provider authentication

#### 2.2 Integrate Hooks into Core

**Actions**:

1. Add `PluginManager` to `packages/core`
2. Integrate hooks into:
   - Session events (`chat.message`, `chat.params`)
   - Tool execution (`tool.execute.before`, `tool.execute.after`)
   - Permission system (`permission.ask`)
   - System prompt (`experimental.chat.system.transform`)

---

### Phase 3: Skills Standardization (HIGH Priority)

**Objective**: Align skill implementation with agentskills.io specification.

#### 3.1 Update Skill Types

**Source**: [crush/internal/skills/skills.go](file:///Users/mxue/GitRepos/Codebreeze/crush/internal/skills/skills.go)

**Current**: [qwen-code/packages/core/src/skills/types.ts](file:///Users/mxue/GitRepos/Codebreeze/qwen-code/packages/core/src/skills/types.ts)

**Actions**:

1. Add missing fields: `license`, `compatibility`, `metadata`
2. Implement validation constants:
   - `MaxNameLength = 64`
   - `MaxDescriptionLength = 1024`
   - `MaxCompatibilityLength = 500`
3. Implement name pattern validation: `^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$`

#### 3.2 Update Skill Manager

**Actions**:

1. Update `Validate()` to match agentskills.io spec
2. Port `ToPromptXML()` for system prompt injection
3. Improve discovery with concurrent file walking

---

### Phase 4: ACP Enhancement (HIGH Priority)

**Objective**: Implement robust Agent Client Protocol with full state machine.

#### 4.1 Port ACP Agent

**Source**: [opencode/packages/opencode/src/acp/agent.ts](file:///Users/mxue/GitRepos/Codebreeze/opencode/packages/opencode/src/acp/agent.ts) (37KB)

**Current**: [qwen-code/packages/core/src/acp/session.ts](file:///Users/mxue/GitRepos/Codebreeze/qwen-code/packages/core/src/acp/session.ts) (8KB)

**Key Methods to Port**:

- `initialize()` - ACP initialization with capabilities
- `setupEventSubscriptions()` - Event handling
- `processMessage()` - Message processing pipeline
- `loadSessionMode()` - Session mode management
- `prompt()` - Prompt handling with streaming

#### 4.2 Port Session Compaction

**Source**: [opencode/packages/opencode/src/session/compaction.ts](file:///Users/mxue/GitRepos/Codebreeze/opencode/packages/opencode/src/session/compaction.ts)

**Actions**:

1. Create `packages/core/src/session/compaction.ts`
2. Implement automatic context window management
3. Add `experimental.session.compacting` hook integration
4. (Phase 7) Enhanced compaction with Summarization and Pinning

---

### Phase 5: Multi-Provider Support (MEDIUM Priority)

**Objective**: Expand provider support beyond OpenAI/Anthropic.

#### 5.1 Add Provider Implementations

**Source**: [crush/internal/agent/coordinator.go](file:///Users/mxue/GitRepos/Codebreeze/crush/internal/agent/coordinator.go)

**Actions**:

1. Add `providers/azure.ts` - Azure OpenAI support
2. Add `providers/bedrock.ts` - AWS Bedrock support
3. Add `providers/google.ts` - Google Vertex AI support
4. Add `providers/openrouter.ts` - OpenRouter aggregator

#### 5.2 Implement Coordinator Pattern

**Actions**:

1. Create `Coordinator` class inspired by crush
2. Support model switching mid-session
3. Implement provider fallback logic

---

### Phase 6: Tool Optimization (MEDIUM Priority)

**Objective**: Enhance tool performance and robustness.

#### 6.1 Optimize Grep Tool

**Source**: [crush/internal/agent/tools/grep.go](file:///Users/mxue/GitRepos/Codebreeze/crush/internal/agent/tools/grep.go) (10KB)

**Actions**:

1. Port optimized ripgrep argument handling
2. Add result truncation logic
3. Implement smart context matching

#### 6.2 Enhance MultiEdit

**Source**: [crush/internal/agent/tools/multiedit.go](file:///Users/mxue/GitRepos/Codebreeze/crush/internal/agent/tools/multiedit.go) (14KB)

**Actions**:

1. Port robust find-and-replace logic
2. Improve indentation handling
3. Add better error recovery

#### 6.3 Add New Tools

| Tool            | Source   | Priority |
| :-------------- | :------- | :------- |
| **Diagnostics** | crush    | HIGH     |
| **References**  | crush    | HIGH     |
| **Batch**       | opencode | MEDIUM   |
| **Download**    | crush    | LOW      |
| **Sourcegraph** | crush    | LOW      |

#### 6.4 AST / Tree-sitter Integration (New)

**Source**: `opencode/packages/opencode/parsers-config.ts`

**Actions**:

1. Port `web-tree-sitter` configuration and WASM loader.
2. Use `opencode`'s configuration which loads language definitions from GitHub (frontend-compatible).
3. Implement `AST` service in `packages/core/src/ast` for safe code modification and symbol extraction.
4. Port robust replacement strategies from `opencode` (`BlockAnchor`, `ContextAware`, etc.) to `packages/core/src/utils/edit-strategies.ts`.

---

### Phase 7: Context Management Optimization (MEDIUM Priority)

**Objective**: Optimize context usage for long-running sessions using summarization and pinning.

**Actions**:

1. **Enhanced Compaction**: Upgrade `compaction.ts` to support:
   - **Summarization**: Use LLM to summarize dropped message blocks.
   - **Pinning**: Add `pinnedIds` to ignore specific messages during compaction.
2. **Session Updates**:
   - Add `summary` and `pinnedMessageIds` to session state.
   - Implement `pinMessage` and `unpinMessage` APIs.
3. **Token Management**: Add `tiktoken` counting for precise budget management.

---

## 6. Verification Plan

### 6.1 Automated Tests

```bash
# Run existing tests
npm run test --workspace=packages/core

# Run specific test suites after migration
npm run test -- --grep "LSP"
npm run test -- --grep "Skills"
npm run test -- --grep "Plugin"
```

### 6.2 Integration Tests

For each migrated feature:

1. **LSP Server Tests**
   - Spawn each language server
   - Verify initialization
   - Test diagnostics
   - Test references/definitions

2. **Plugin System Tests**
   - Load sample plugin
   - Verify hook invocation
   - Test auth flows

3. **Skills Tests**
   - Parse valid SKILL.md
   - Reject invalid skills
   - Test discovery

### 6.3 Manual Verification

1. **CLI Testing**
   - Run interactive session
   - Test each new tool
   - Verify provider switching

2. **VSCode Extension Testing**
   - Install extension
   - Verify LSP integration
   - Test code actions

---

## 7. Risk Assessment

| Risk                           | Impact | Likelihood | Mitigation                                                                        |
| :----------------------------- | :----- | :--------- | :-------------------------------------------------------------------------------- |
| **Bun → Node Polyfill Gaps**   | HIGH   | MEDIUM     | Comprehensive unit tests for adapter; fallback to native Node APIs                |
| **Go → TS Rewrite Complexity** | HIGH   | MEDIUM     | Start with simpler tools; use extensive testing; consider AI-assisted translation |
| **Breaking API Changes**       | MEDIUM | LOW        | Maintain backward compatibility; version bump; deprecation warnings               |
| **Performance Regression**     | MEDIUM | MEDIUM     | Benchmark before/after; optimize critical paths (grep, file I/O)                  |
| **Plugin Compatibility**       | LOW    | LOW        | Design stable plugin API; semantic versioning; deprecation policy                 |
| **Tree-sitter WASM Loading**   | LOW    | LOW        | Pre-bundle common parsers; lazy-load less common ones                             |

---

## 8. Implementation Timeline

> [!TIP]
> **Status: ALL PHASES COMPLETE** (as of 2026-01-15)

| Phase                                | Duration  | Dependencies | Status  | Key Deliverables                      |
| :----------------------------------- | :-------- | :----------- | :------ | :------------------------------------ |
| **Phase 0**: Runtime Compatibility   | 3 days    | None         | ✅ DONE | `bun-adapter.ts`, unit tests          |
| **Phase 1**: LSP Integration         | 2 weeks   | Phase 0      | ✅ DONE | 15+ language servers, LSP tools       |
| **Phase 2**: Plugin System           | 2 weeks   | Phase 0      | ✅ DONE | Plugin SDK, hook system               |
| **Phase 3**: Skills Standardization  | 1 week    | None         | ✅ DONE | agentskills.io compliant parser       |
| **Phase 4**: ACP Enhancement         | 2 weeks   | Phase 2      | ✅ DONE | State machine, compaction             |
| **Phase 5**: Multi-Provider          | 1.5 weeks | Phase 4      | ✅ DONE | Azure, Bedrock, Google, OpenRouter    |
| **Phase 6**: Tool Optimization + AST | 2 weeks   | Phase 1      | ✅ DONE | Optimized grep/multiedit, Tree-sitter |
| **Phase 7**: Context Management      | 1 week    | Phase 6      | ✅ DONE | Summarization, Pinning                |

**Total Estimated Duration**: 12 weeks  
**Actual Duration**: Completed

> [!IMPORTANT]
> **Next Steps**: Architecture consolidation required. See [wiki/architecture/](./architecture/) for the unified architecture proposal to address technical debt from patch-based migration.

---

## 9. Conclusion

This migration plan strategically combines the best features from three codebases:

| From          | What We Keep                                   | What We Port                                              |
| :------------ | :--------------------------------------------- | :-------------------------------------------------------- |
| **qwen-code** | Subagent system, MCP OAuth, Smart Edit, Memory | -                                                         |
| **opencode**  | -                                              | LSP servers, Plugin hooks, ACP agent, Compaction          |
| **crush**     | -                                              | Skills spec, Multi-provider, Grep/MultiEdit optimizations |

By following this phased approach, `qwen-code` will evolve into a comprehensive AI coding assistant with:

- ✅ 15+ language LSP support
- ✅ Extensible plugin architecture
- ✅ agentskills.io compliant skills
- ✅ Robust ACP state machine
- ✅ Multi-provider support (7+ providers)
- ✅ Optimized, production-ready tools

> [!NOTE]
> This is a living document. Update it as implementation progresses and new requirements emerge.
