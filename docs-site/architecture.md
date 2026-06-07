# Architecture

> codegraph 系统架构（3,420 nodes / 9,753 edges indexed）

## 1. 概览

codegraph 是 **local-first 代码智能库**，用 tree-sitter 解析代码，把 symbols/edges/files 存 SQLite (FTS5)，通过 MCP 暴露给 AI 代理。

```
┌────────────────────────────────────────────────────────────────────┐
│                AI Agent (8 platforms)                              │
│   Claude Code / Cursor / Codex / OpenCode / Hermes / Gemini /     │
│   Antigravity / Kiro                                              │
└─────────────────┬──────────────────────────────────────────────────┘
                  │ MCP (stdio)
                  ▼
┌────────────────────────────────────────────────────────────────────┐
│         codegraph MCP server (tools.ts 83 symbols)                │
│         + daemon mode (YeLuo45 fork 新增)                          │
└─────────────────┬──────────────────────────────────────────────────┘
                  │ CodeGraph class
                  ▼
┌────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ExtractionOrchestrator (tree-sitter)                       │  │
│  │  ↓ 23+ languages + 4 non-tree-sitter extractors             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ReferenceResolver                                           │  │
│  │  - import-resolver + path-aliases                            │  │
│  │  - name-matcher                                              │  │
│  │  - 12 framework patterns (Express, Laravel, Rails, ...)      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  GraphQueryManager / GraphTraverser                          │  │
│  │  - BFS/DFS, impact radius, path finding                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ContextBuilder — markdown/JSON for AI                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────┬──────────────────────────────────────────────────┘
                  │ SQLite (FTS5) — .codegraph/codegraph.db
                  ▼
┌────────────────────────────────────────────────────────────────────┐
│         Local project .codegraph/ directory                        │
│         (per-project data, gitignored)                             │
└────────────────────────────────────────────────────────────────────┘
```

## 2. 分层 Pipeline

```
files (source code)
   ↓
[1] ExtractionOrchestrator
    - tree-sitter WASM parse (per-language)
    - extract: nodes + edges
    - 23+ languages
    - 4 non-tree-sitter extractors (svelte / vue / liquid / dfm)
   ↓
[2] ReferenceResolver
    - import-resolver (with tsconfig path aliases)
    - name-matcher (heuristic symbol resolution)
    - 12 framework patterns (route detection)
   ↓
[3] GraphQueryManager / GraphTraverser
    - callers(node) — who calls this
    - callees(node) — what this calls
    - impact(node) — what breaks if I change this
    - explore(query) — BFS from query-matched seeds
   ↓
[4] ContextBuilder
    - format as markdown or JSON
    - send back to AI agent
```

## 3. Module 结构

```
src/
├── index.ts                    — CodeGraph class (public API)
├── bin/                        — CLI
│   ├── codegraph.ts            — main (commander)
│   ├── node-version-check.ts   — hard exit on Node 25.x
│   └── uninstall.ts
├── db/
│   ├── DatabaseConnection.ts
│   ├── QueryBuilder.ts
│   └── schema.sql
├── extraction/
│   ├── ExtractionOrchestrator.ts
│   ├── parse-worker.ts         — off-thread parsing
│   ├── grammars.ts
│   ├── extraction-version.ts
│   ├── generated-detection.ts
│   ├── svelte-extractor.ts
│   ├── vue-extractor.ts
│   ├── liquid-extractor.ts
│   ├── dfm-extractor.ts        — Delphi
│   ├── mybatis-extractor.ts    — YeLuo45 fork 新增
│   ├── razor-extractor.ts      — YeLuo45 fork 新增
│   └── languages/              — 23+ per-language extractors
├── resolution/
│   ├── ReferenceResolver.ts
│   ├── import-resolver.ts
│   ├── path-aliases.ts
│   ├── name-matcher.ts
│   └── frameworks/             — 12 framework patterns
├── graph/
│   ├── GraphTraverser.ts
│   └── GraphQueryManager.ts
├── context/
│   └── ContextBuilder.ts
├── search/
│   └── FTS5 query helpers
├── sync/
│   ├── FileWatcher.ts          — FSEvents/inotify/RDCW
│   └── git-hook helpers
├── mcp/                        — 11 files (vs upstream 6)
│   ├── server-instructions.ts
│   ├── tools.ts                — 83 symbols
│   ├── engine.ts
│   ├── transport.ts
│   ├── index.ts
│   ├── daemon.ts               — YeLuo45 fork 新增 (53 symbols)
│   ├── proxy.ts                — YeLuo45 fork 新增
│   ├── session.ts              — YeLuo45 fork 新增
│   ├── ppid-watchdog.ts        — YeLuo45 fork 新增
│   ├── daemon-paths.ts
│   └── version.ts
├── installer/                  — 12 files (vs upstream 5)
│   ├── index.ts                — orchestrator
│   ├── config-writer.ts
│   ├── instructions-template.ts
│   ├── clack.d.ts
│   └── targets/                — 8 targets
│       ├── claude.ts           — Claude Code
│       ├── cursor.ts           — Cursor
│       ├── codex.ts            — Codex CLI
│       ├── opencode.ts
│       ├── hermes.ts           — Hermes Agent (YeLuo45 fork)
│       ├── gemini.ts           — Gemini CLI (YeLuo45 fork)
│       ├── antigravity.ts      — Antigravity (YeLuo45 fork)
│       ├── kiro.ts             — Kiro (YeLuo45 fork)
│       ├── registry.ts
│       ├── types.ts
│       ├── shared.ts
│       └── toml.ts
├── types.ts                    — NodeKind / EdgeKind enum
└── ui/                         — terminal UI
```

## 4. 关键抽象

### NodeKind (23)
`file` / `module` / `class` / `struct` / `interface` / `trait` / `protocol` / `function` / `method` / `property` / `field` / `variable` / `constant` / `enum` / `enum_member` / `type_alias` / `namespace` / `parameter` / `import` / `export` / `route` / `component`

### EdgeKind (12)
`contains` / `calls` / `imports` / `exports` / `extends` / `implements` / `references` / `type_of` / `returns` / `instantiates` / `overrides` / `decorates`

### AgentTarget interface

```typescript
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

type TargetId = 'claude' | 'cursor' | 'codex' | 'opencode' 
             | 'hermes' | 'gemini' | 'antigravity' | 'kiro';
```

## 5. 数据流：一次 `mcp_codegraph_search` 调用

```
1. Agent calls MCP tool "codegraph_search" with { query, limit, ... }
2. mcp/tools.ts: handle "codegraph_search" case
3. CodeGraph.searchNodes(query):
   a. FTS5 search on nodes.name + content
   b. rank by BM25 + fuzzy
   c. enrich with edges + related nodes
4. Return: { nodes: [...], total: N, tookMs: M }
```

## 6. 关键设计原则（CLAUDE.md 原文）

- **Local-first** — per-project `.codegraph/` 目录，gitignored
- **Deterministic extraction** — derived from AST, **not** LLM-summarized
- **Wall-clock latency + tool-call count** — 优化目标，**不**是 token cost
- **Multi-agent installer** — 8 个 targets, 一个文件一个 target
- **Single source of truth** — `server-instructions.ts` 是 MCP `initialize` 返回的内容；installer **不**再写 `## CodeGraph` 块到 `CLAUDE.md` (issue #529)
- **Self-healing** — install 时清理 legacy 旧版块（`sync-if-dirty` hook 之类）

## 7. SQLite 后端

```sql
-- nodes table
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  signature TEXT,
  doc TEXT,
  content_hash TEXT
);

-- edges table
CREATE TABLE edges (
  source_id INTEGER,
  target_id INTEGER,
  kind TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (source_id, target_id, kind)
);

-- FTS5 index on nodes
CREATE VIRTUAL TABLE nodes_fts USING fts5(name, signature, doc, content='nodes');
```

**Backend 选择**：
- 主：`better-sqlite3`（native，速度快）
- Fallback：`node-sqlite3-wasm`（WASM，慢路径）
- `codegraph status` 显示当前 backend

## 8. Daemon 模式（YeLuo45 fork 新增）

```
client1 (project A) ─┐
client2 (project B) ─┼─→ codegraph daemon (single process, port YYY)
client3 (project C) ─┘     ↓
                          SQLite (per-project .codegraph/ files)
```

- 避免每个 agent 启动一个 MCP server
- daemon 持有所有 project 状态
- client proxy (`mcp/proxy.ts`) 转发到 daemon
- session 跟踪（`mcp/session.ts`）
- `ppid-watchdog` 检测父进程死亡 → 清理

## 9. Cursor 兼容性 quirk

Cursor 启动 MCP subprocess 时：
- 用了错误的 cwd
- 不传 `rootUri` in `initialize`

**修复**：`codegraph install` 给 Cursor MCP args 注入 `--path`：
- local install: 绝对路径
- global install: `${workspaceFolder}`

这是关键修复，**不要破坏**！
