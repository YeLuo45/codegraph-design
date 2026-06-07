# All 8 Targets

> 8 个 AI agent installer targets 详细对比

## 总览

| Target | 状态 | Symbols | Locations | Config 格式 |
|--------|------|---------|-----------|-------------|
| Claude Code | upstream | 29 | global + local | JSON (mcp.json) |
| Cursor | upstream | 24 | global + local | JSON (mcp.json) |
| Codex CLI | upstream | 26 | global only | TOML |
| opencode | upstream | 29 | global + local | JSONC |
| **Hermes Agent** | **YeLuo45 fork** | 39 | global only | YAML |
| **Gemini CLI** | **YeLuo45 fork** | 23 | (推测) global | (推测) JSON |
| **Antigravity** | **YeLuo45 fork** | 29 | (推测) | (推测) |
| **Kiro** | **YeLuo45 fork** | 22 | (推测) | (推测) |

## Claude Code

**File**: `src/installer/targets/claude.ts` (29 symbols)

**Config locations**:
- Global: `~/.claude/mcp.json`
- Local: `./.claude/mcp.json`

**Config**:
```json
{
  "mcpServers": {
    "codegraph": {
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

**Permissions** (if autoAllow):
```json
{
  "permissions": {
    "allow": ["mcp__codegraph__*"]
  }
}
```

## Cursor

**File**: `src/installer/targets/cursor.ts` (24 symbols)

**特殊**:
- 注入 `--path`（修复 Cursor cwd quirk）
- Local: 绝对路径；Global: `${workspaceFolder}`

**Config**:
```json
// Cursor: ~/.cursor/mcp.json
{
  "mcpServers": {
    "codegraph": {
      "command": "codegraph",
      "args": ["serve", "--mcp", "--path", "${workspaceFolder}"]
    }
  }
}
```

## Codex CLI

**File**: `src/installer/targets/codex.ts` (26 symbols)

**特殊**:
- TOML 而非 JSON
- **Only global**（Codex 无 project-local config）
- 用 hand-rolled TOML serializer

**Config**:
```toml
# ~/.codex/config.toml
[mcp_servers.codegraph]
command = "codegraph"
args = ["serve", "--mcp"]
```

## opencode

**File**: `src/installer/targets/opencode.ts` (29 symbols)

**Config**:
```jsonc
// opencode.jsonc
{
  "$schema": "...",
  "mcp": {
    "codegraph": {
      "type": "local",
      "command": ["codegraph", "serve", "--mcp"]
    }
  }
}
```

**特殊**: `jsonc-parser` 保留用户注释和格式。

## Hermes Agent (YeLuo45 fork)

**File**: `src/installer/targets/hermes.ts` (39 symbols)

**最大**的 target（39 vs 上游 4 个平均 ~25）。

**Config**:
```yaml
# $HERMES_HOME/config.yaml (default: ~/.hermes/config.yaml)
mcp_servers:
  codegraph:
    command: codegraph
    args: [serve, --mcp]

platform_toolsets:
  cli:
    - hermes-cli
    - mcp-codegraph
```

**关键行为**:
- 只支持 `global`（hermes 无 project-local config）
- 用 atomic write
- Self-heal on upgrade（自动清理 legacy）

详见 `/hermes-target` 页。

## Gemini CLI (YeLuo45 fork)

**File**: `src/installer/targets/gemini.ts` (23 symbols)

**推测** config 位置: `~/.gemini/settings.json` 或 `~/.config/gemini-cli/config.json`

## Antigravity (YeLuo45 fork)

**File**: `src/installer/targets/antigravity.ts` (29 symbols)

**推测** 是 Google 的另一个 IDE 或 AI 工具（待 confirm）。

## Kiro (YeLuo45 fork)

**File**: `src/installer/targets/kiro.ts` (22 symbols)

**推测** 是 AWS 推出的 AI IDE（待 confirm）。

## 升级一个 target 的流程

1. 在 `src/installer/targets/<id>.ts` 写新 target
2. 在 `src/installer/targets/registry.ts` 加 entry
3. 在 `src/installer/targets/types.ts` 加 TargetId union member
4. 写 test cases in `__tests__/installer-targets.test.ts`
5. 更新 README + docs

## 共用 utilities

```typescript
// src/installer/targets/shared.ts (11 symbols)
function atomicWriteFileSync(path: string, content: string) { ... }
function readJsonFile(path: string): any { ... }
function writeJsonFile(path: string, data: any) { ... }
function splitLines(content: string): string[] { ... }
function ensureTrailingNewline(text: string): string { ... }
```

## 测试覆盖

`__tests__/installer-targets.test.ts`:
- ~47 个 parameterized tests
- 覆盖所有 8 个 targets
- 测试场景：
  - 首次 install
  - 二次 install（idempotent）
  - Uninstall reverses install
  - Sibling preservation（sibling MCP servers 不动）
  - Byte-equal re-runs return `unchanged`
  - Partial-state recovery
