# Installer

> `src/installer/` — 多 agent 一键配置

## 概览

`codegraph install` 自动化配置 8 个 AI agent 平台：
- 写入 `mcp_servers.codegraph`
- 写入 platform-specific permissions
- 处理 legacy cleanup

## 4 层架构

```
src/installer/
├── index.ts                — orchestrator (主入口)
├── config-writer.ts        — JSON 写入 helper
├── instructions-template.ts — CLAUDE.md markers (现在不写内容)
├── clack.d.ts              — terminal UI types
└── targets/                — 8 个 target
    ├── claude.ts           — Claude Code
    ├── cursor.ts           — Cursor
    ├── codex.ts            — Codex CLI
    ├── opencode.ts
    ├── hermes.ts           — Hermes Agent (YeLuo45 fork)
    ├── gemini.ts           — Gemini CLI (YeLuo45 fork)
    ├── antigravity.ts      — Antigravity (YeLuo45 fork)
    ├── kiro.ts             — Kiro (YeLuo45 fork)
    ├── registry.ts
    ├── types.ts            — AgentTarget interface
    ├── shared.ts
    └── toml.ts             — hand-rolled TOML serializer
```

## AgentTarget Interface

```typescript
// src/installer/targets/types.ts
interface AgentTarget {
  readonly id: TargetId;
  readonly displayName: string;
  readonly docsUrl?: string;
  
  supportsLocation(loc: 'global' | 'local'): boolean;
  detect(loc: Location): DetectionResult;
  install(loc: Location, opts: InstallOptions): WriteResult;
  uninstall(loc: Location): WriteResult;
  printConfig(loc: Location): string;
  describePaths(loc: Location): string[];
}

type TargetId = 
  | 'claude' | 'cursor' | 'codex' | 'opencode'
  | 'hermes' | 'gemini' | 'antigravity' | 'kiro';

interface DetectionResult {
  installed: boolean;             // best-effort heuristic
  alreadyConfigured: boolean;     // codegraph wired in?
  configPath?: string;
}

interface InstallOptions {
  autoAllow: boolean;             // write permissions?
}

interface WriteResult {
  files: Array<{
    path: string;
    action: 'created' | 'updated' | 'unchanged' | 'removed' | 'not-found' | 'kept';
  }>;
  notes?: string[];
}
```

## 8 个 Target 一览

| Target | File | Symbols | Status |
|--------|------|---------|--------|
| Claude Code | `claude.ts` | 29 | upstream |
| Cursor | `cursor.ts` | 24 | upstream |
| Codex CLI | `codex.ts` | 26 | upstream |
| opencode | `opencode.ts` | 29 | upstream |
| **Hermes Agent** | `hermes.ts` | 39 | **YeLuo45 fork** |
| **Gemini CLI** | `gemini.ts` | 23 | **YeLuo45 fork** |
| **Antigravity** | `antigravity.ts` | 29 | **YeLuo45 fork** |
| **Kiro** | `kiro.ts` | 22 | **YeLuo45 fork** |

## `codegraph install` CLI

```bash
# Interactive (clack TUI)
$ codegraph install
? Which agents do you want to configure? 
  ☑ Claude Code (detected at ~/.claude/)
  ☑ Cursor (detected)
  ☐ Codex CLI
  ☐ Hermes Agent
  ☐ Gemini CLI
  ☐ Antigravity
  ☐ Kiro
  ☐ opencode
? Install location? (global | local)
? Auto-allow permissions? (yes | no)

# Non-interactive
$ codegraph install --target claude --location global --yes
$ codegraph install --target hermes --location global --yes

# Dry run
$ codegraph install --target all --dry-run

# Check status
$ codegraph install --check
```

## Claude Code Target (29 symbols)

```typescript
// src/installer/targets/claude.ts
class ClaudeCodeTarget implements AgentTarget {
  readonly id = 'claude' as const;
  
  supportsLocation(_loc: Location): boolean {
    return true;  // Claude supports both global + local
  }
  
  detect(loc: Location): DetectionResult {
    const mcpPath = mcpJsonPath(loc);
    const config = readJsonFile(mcpPath);
    return {
      installed: fs.existsSync(mcpPath),
      alreadyConfigured: !!config.mcpServers?.codegraph,
      configPath: mcpPath,
    };
  }
  
  install(loc: Location, opts: InstallOptions): WriteResult {
    const files: WriteResult['files'] = [];
    
    // 1. Write MCP server entry to mcp.json
    files.push(writeMcpEntry(loc));
    
    // 1b. Migrate legacy .claude.json
    if (loc === 'local') {
      files.push(cleanupLegacyLocalMcp());
    }
    
    // 2. Write permissions (if autoAllow)
    if (opts.autoAllow) {
      files.push(writePermissionsEntry(loc));
    }
    
    // 2b. Clean legacy auto-sync hooks
    const hookCleanup = cleanupLegacyHooks(loc);
    if (hookCleanup.action === 'removed') files.push(hookCleanup);
    
    // 3. CLAUDE.md instructions — NOT written anymore (issue #529)
    // Server instructions are the single source of truth
    
    return { files };
  }
}
```

**Config it writes**:
```json
// ~/.claude.json (global) or ./.claude.json (local)
{
  "mcpServers": {
    "codegraph": {
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  },
  "permissions": {
    "allow": [
      "mcp__codegraph__*"
    ]
  }
}
```

## Cursor Target (24 symbols)

**特殊**：Cursor 启动 MCP subprocess 时用了错的 cwd + 不传 `rootUri`。

**修复**：installer 注入 `--path` 到 args。

```typescript
class CursorTarget implements AgentTarget {
  install(loc: Location): WriteResult {
    const configPath = path.join(configDir(loc), 'mcp.json');
    const config = readJsonFile(configPath);
    
    // Inject --path for the Cursor cwd quirk
    config.mcpServers = config.mcpServers || {};
    config.mcpServers.codegraph = {
      command: 'codegraph',
      args: loc === 'global' 
        ? ['serve', '--mcp', '--path', '${workspaceFolder}']  // variable
        : ['serve', '--mcp', '--path', process.cwd()],          // absolute
    };
    
    writeJsonFile(configPath, config);
    return { files: [{ path: configPath, action: 'updated' }] };
  }
}
```

## Codex Target (26 symbols)

**特殊**：用 TOML 配置（不是 JSON）。

```typescript
// src/installer/targets/codex.ts
import { writeTomlMcpServer } from './toml';

class CodexTarget implements AgentTarget {
  install(loc: Location): WriteResult {
    // Codex: ~/.codex/config.toml
    const configPath = path.join(homedir(), '.codex', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf-8');
    
    const updated = writeTomlMcpServer(content, {
      name: 'codegraph',
      command: 'codegraph',
      args: ['serve', '--mcp'],
    });
    
    fs.writeFileSync(configPath, updated);
    return { files: [{ path: configPath, action: 'updated' }] };
  }
}
```

**TOML serializer** (`src/installer/targets/toml.ts`, 8 symbols): 
- Hand-rolled（不引外部依赖）
- Scope: `[mcp_servers.codegraph]`
- 保留 sibling tables + `[[array_of_tables]]` 不动

## Hermes Target (YeLuo45 fork, 39 symbols)

**最大**的 target，详见 `/hermes-target` 页。

## Gemini / Antigravity / Kiro Targets (YeLuo45 fork)

**新增** target，symbol count 22-29。具体实现待 explore。

## Registry

```typescript
// src/installer/targets/registry.ts (15 symbols)
const TARGETS: Record<TargetId, AgentTarget> = {
  claude: new ClaudeCodeTarget(),
  cursor: new CursorTarget(),
  codex: new CodexTarget(),
  opencode: new OpencodeTarget(),
  hermes: new HermesTarget(),
  gemini: new GeminiTarget(),
  antigravity: new AntigravityTarget(),
  kiro: new KiroTarget(),
};

export function getTarget(id: TargetId): AgentTarget {
  return TARGETS[id];
}

export function getAllTargets(): AgentTarget[] {
  return Object.values(TARGETS);
}
```

## Idempotency

`codegraph install` 是**幂等**的：
- 跑两次结果相同
- 不会破坏已有配置
- 只 update codegraph 自己的 block

```typescript
function isUnchanged(file: WriteResult['files'][number]): boolean {
  return file.action === 'unchanged';
}

// "X is already up-to-date" log line if all files unchanged
```

## Test Coverage

`__tests__/installer-targets.test.ts` 包含 **~47 个 parameterized 合同测试**：
- install idempotency
- sibling preservation
- uninstall reverses install
- byte-equal re-runs return `unchanged`
- partial-state recovery (Codex)

## 关键问题修复（issue references）

| Issue | 修复 |
|-------|------|
| **#529** | installer 不再写 `## CodeGraph` 到 CLAUDE.md（重复 MCP initialize） |
| **#137** | Claude-locked installer（现在 8 targets） |
| **#207** | legacy `.claude.json` 迁移到 `.mcp.json` |

## Self-Healing

Installer 自动清理 legacy 代码：
- `sync-if-dirty` hook（旧版 auto-sync，已废弃）
- `## CodeGraph` instructions block
- legacy `.claude.json` MCP config

这意味着升级 codegraph 旧版本是**自动修复**的。
