# CLI

> `src/bin/codegraph.ts` — codegraph 命令行接口

## Subcommands

| Subcommand | 用途 |
|------------|------|
| `install` | 配置 AI agents（8 targets） |
| `init` | 在当前项目创建 `.codegraph/` 目录 + 初始索引 |
| `uninit` | 移除 `.codegraph/` 目录 |
| `index` | 重建索引（不建 daemon） |
| `sync` | 增量同步（基于 file watcher） |
| `status` | 显示 backend / db / counts |
| `query` | CLI 端 search (无 MCP) |
| `files` | 显示项目文件树 |
| `context` | 导出 context 为 markdown/JSON |
| `affected` | 列出被改文件影响的 callers |
| `serve --mcp` | 启动 MCP server (stdio) |
| `daemon start/stop` | 启动/停止 daemon (YeLuo45 fork) |

## install

```bash
# Interactive
$ codegraph install

# Non-interactive
$ codegraph install --target claude --location global --yes
$ codegraph install --target hermes --location global --yes

# Multiple targets
$ codegraph install --target claude --target cursor --target hermes --yes

# All targets
$ codegraph install --target all --yes

# Check status
$ codegraph install --check
# Output:
# claude: configured at ~/.claude/mcp.json
# cursor: configured at ~/.cursor/mcp.json
# hermes: configured at ~/.hermes/config.yaml
# gemini: NOT configured
# ...

# Dry run
$ codegraph install --target all --dry-run

# Uninstall
$ codegraph install --uninstall --target claude
```

## init

```bash
# Default (current dir)
$ codegraph init
# Creates .codegraph/codegraph.db + initial index

# Specific path
$ codegraph init /path/to/project

# Force re-init
$ codegraph init --force

# Index after init
$ codegraph init -i
```

## index

```bash
# Full re-index
$ codegraph index

# Specific path
$ codegraph index src/

# Skip LLM enrichment
$ codegraph index --no-llm

# Verbose
$ codegraph index --verbose
```

## sync

```bash
# Watch + incremental update
$ codegraph sync

# Background mode (detach)
$ codegraph sync --detach

# One-shot (no watch)
$ codegraph sync --once
```

## status

```bash
$ codegraph status
backend: better-sqlite3
db path: /home/hermes/projects/foo/.codegraph/codegraph.db
size: 12.3 MB
nodes: 3456
edges: 8901
files: 234
last indexed: 2026-06-07 03:00:00 (2 min ago)
watcher: active (3 files in queue)
daemon: not running
```

## query

```bash
# Free text
$ codegraph query "validate"
# Returns: list of matching symbols

# With filters
$ codegraph query "validate" --kind function --limit 5

# JSON output
$ codegraph query "validate" --format json | jq
```

## files

```bash
# All files
$ codegraph files
# Tree output

# Subdirectory
$ codegraph files src/cli

# With node counts
$ codegraph files --with-counts
```

## context

```bash
# Build context for a symbol
$ codegraph context "parseArgs"
# Returns markdown

# JSON
$ codegraph context "parseArgs" --format json
```

## affected

```bash
# Find affected by file change
$ codegraph affected src/db/connection.ts
# Returns: callers + tests of changed symbols

# Specific commit
$ codegraph affected --since HEAD~1
```

## serve --mcp

```bash
# stdio (default)
$ codegraph serve --mcp

# HTTP
$ codegraph serve --mcp --http --port 9998

# With daemon URL (YeLuo45 fork)
$ CODEGRAPH_DAEMON_URL=http://localhost:9999 codegraph serve --mcp
```

## daemon

```bash
# Start
$ codegraph daemon start

# Stop
$ codegraph daemon stop

# Status
$ codegraph daemon status
```

## Node version check

```bash
$ codegraph --version
# v0.9.9
```

**Hard exit on Node 25.x** (see `src/bin/node-version-check.ts`):
```typescript
// node-version-check.ts
if (major === 25) {
  console.error('CodeGraph does not support Node 25.x. Use Node 18-24.');
  process.exit(1);
}
```

## 卸载

```bash
$ codegraph install --uninstall --target all
# Reverse: removes codegraph from all targets
```

## Global flags

| Flag | 用途 |
|------|------|
| `--help` | help |
| `--version` | version |
| `--verbose` / `-v` | verbose logging |
| `--quiet` / `-q` | quiet |
| `--json` | JSON output |
| `--config <path>` | config file override |
| `--no-color` | disable color |

## Exit codes

| Code | 含义 |
|------|------|
| 0 | success |
| 1 | generic error |
| 2 | invalid args |
| 3 | install failure |
| 4 | not in git repo |
| 5 | no permission |

## 性能

| 命令 | 启动时间 |
|------|----------|
| `codegraph --version` | ~50ms |
| `codegraph status` | ~100ms (open db) |
| `codegraph query` | ~150ms |
| `codegraph install` (one target) | ~200ms |
| `codegraph install --target all` | ~1s |

## 与 npm script 集成

codegraph 设计成能在 npm script 中调用：

```json
// package.json
{
  "scripts": {
    "cg:status": "codegraph status",
    "cg:init": "codegraph init",
    "cg:sync": "codegraph sync --detach"
  }
}
```
