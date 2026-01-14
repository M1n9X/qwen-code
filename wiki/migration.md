# Migration Guide: Enhancing qwen-code with Features from opencode and crush

## 1. Introduction

This migration guide details the strategic plan to elevate the **qwen-code** repository by transplanting superior feature implementations from **opencode** (TypeScript) and **crush** (Go).

**Goal**: Transform `qwen-code` into a robust, feature-rich coding assistant monorepo that combines:

* `qwen-code`'s existing CLI and VSCode foundation.
* `opencode`'s advanced LSP integration, Agent Client Protocol (ACP) robustness, and MCP server management.
* `crush`'s industry-standard Skills implementation and highly optimized Tool logic.

---

## 2. Feature Comparison & Source of Truth

The following table identifies the "Gold Standard" implementation for each core feature and the source repository to port from.

| Feature Area | qwen-code (Target) | opencode (Source A) | crush (Source B) | **Migration Strategy** |
| :--- | :--- | :--- | :--- | :--- |
| **Language Stack** | TypeScript (Node.js) | TypeScript (Node.js) | Go | Maintain TS stack. Port TS logic directly; rewrite Go logic to TS. |
| **UI Framework** | **Ink** (React) | **OpenTUI** (SolidJS) | **Bubbletea** (Go) | **Rewrite Required**: Adapt `opencode` UI logic from SolidJS signals to React hooks for Ink. |
| **LSP Client** | Generic VSCode API | **Standalone Client** (Stdio) | Go Client | **High Priority**: Port `opencode`'s `lsp/client.ts` to `packages/core`. |
| **MCP Management** | Basic Command | **Full Lifecycle** (OAuth/Env) | Native Tools | Port `opencode`'s Manager class for server handling. |
| **Agent Protocol** | Loose Coupling | **Strict ACP** Implementation | Task Orchestrator | Port `opencode`'s `acp/agent.ts` state machine. |
| **Skills** | Custom Parser | Standard | **Complete Spec** | Validate `qwen-code` against `crush`'s strict `SKILL.md` rules. |
| **Tools** | Shell/File | Web/Code Search | **Grep/Diff** (Optimized) | Port `crush`'s `grep` and `multiedit` logic to TypeScript. |

---

## 3. Detailed Migration Plan

### Phase 1: Core Architecture & LSP

**Objective**: Establish a robust communication layer with Language Servers and LLM Providers.

1. **LSP Client Integration**:
    * **Source**: `opencode/packages/opencode/src/lsp/client.ts`
    * **Action**: Create `packages/core/src/lsp`. Port the `LSPClient` class.
    * **Key Features**:
        * Stdio transport (using `vscode-jsonrpc`).
        * Universal server spawning (not just JS/TS).
        * Event bus for diagnostics (`textDocument/publishDiagnostics`).
        * Zod schema validation for initialization options.
2. **Multi-LLM Provider Abstraction**:
    * **Source**: `opencode/packages/opencode/src/provider` and `opencode/packages/sdk-java` (concepts).
    * **Action**: Refactor `packages/core/src/config` to support a plugin-able `Provider` interface.
    * **Goal**: seamless switching between OpenAI, Anthropic, and local models.

### Phase 2: Agent Protocol (ACP) & MCP

**Objective**: Harden the agent's ability to execute complex tasks and manage tools.

1. **ACP State Machine**:
    * **Source**: `opencode/packages/opencode/src/acp/agent.ts`
    * **Action**: Refactor `qwen-code`'s session loop to strictly adhere to ACP states:
        * `pending` -> `running` -> `completed` / `error`.
        * Handle `tool_call` updates with rich metadata (progress bars, status updates).
2. **MCP Server Manager**:
    * **Source**: `opencode/packages/opencode/src/mcp`
    * **Action**: Enhance `packages/cli` commands to:
        * Install/Remove MCP servers.
        * Manage configurations (environment variables) securely.
        * Handle OAuth flows (if generic OAuth via terminal is needed).

### Phase 3: Tools & Skills Refinement

**Objective**: Equip the agent with powerful, reliable capabilities.

1. **Skill Validation (agentskills.io)**:
    * **Source**: `crush/internal/skills/skills.go`
    * **Action**: Update `qwen-code`'s `SkillManager` to strictly validate `SKILL.md` against the official spec (name format, frontmatter structure).
2. **High-Performance Tools**:
    * **Source**: `crush/internal/agent/tools`
    * **Action**: Port the logic of:
        * `grep`: Using `ripgrep` (binary or node binding) for large-scale search.
        * `multiedit`: Robust find-and-replace logic that handles indentation and context matching better than simple diffs.

### Phase 4: UI/TUI Modernization

**Objective**: Provide a rich, interactive terminal experience.

1. **UI Logic Adaption**:
    * **Challenge**: `opencode` uses SolidJS (signals). `qwen-code` uses Ink (React hooks).
    * **Action**:
        * Map `opencode`'s `DialogProvider` (Solid) to a React Context in Ink.
        * Rewrite `DialogMcp`, `DialogAgent`, and `DialogStatus` components using Ink's `<Box>`, `<Text>`, and input hooks.
    * **Result**: A TUI that feels like `opencode` but runs natively in `qwen-code`'s React environment.

---

## 4. Key Differences & Implementation Notes

### UI Framework

* **opencode**: Uses `@opentui/solid`, a custom renderer for SolidJS. This offers fine-grained reactivity but is niche.
* **qwen-code**: Uses `ink`, the industry standard for React CLIs.
* **Decision**: **Stick with Ink**. It has a larger ecosystem and is already integrated. We will "port concepts, not code" for the UI layer.

### Configuration Security

* **opencode**: likely uses system keychain or encrypted local storage for OAuth tokens.
* **qwen-code**: currently relies on `.env` or simple config files.
* **Plan**: Adopt `opencode`'s credential management approach if it uses a standard library (like `keytar` or similar) to secure API keys.

### Telemetry

* `opencode` has extensive telemetry events defined in `sdk/src/telemetry`.
* `qwen-code` has basic telemetry.
* **Plan**: Ensure `qwen-code`'s telemetry respects user privacy but captures granular Agent performance metrics (tool success rates, skill usage) similar to `opencode`.

## 5. Conclusion

This migration is not a simple copy-paste. It involves:

1. **Direct Porting**: For pure logic (LSP, ACP state machine).
2. **Logic Rewriting**: For Tools (Go -> TS).
3. **Concept Adaptation**: For UI (Solid -> React).

By following this plan, `qwen-code` will inherit the "best of breed" features from both repositories, becoming a state-of-the-art AI coding assistant.
