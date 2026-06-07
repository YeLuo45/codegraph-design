# Deployment

> codegraph 部署 + 发行

## NPM 发行

```bash
# Local
npm run build           # tsc + copy schema.sql + *.wasm into dist/
npm test                # vitest
npm publish

# Version bump (sync 4 files per CLAUDE.md)
1. package.json              # "version" field
2. src/version.ts            # VERSION + type union
3. src/mcp/version.ts         # server version
4. install.sh / install.ps1   # (if any)
```

## Binary Distribution

### npm install
```bash
npm install -g @colbymchenry/codegraph
# → codegraph CLI available globally
```

### npx (no install)
```bash
npx @colbymchenry/codegraph init
npx @colbymchenry/codegraph serve --mcp
```

### install.sh / install.ps1

```bash
# Mac/Linux
$ curl -fsSL https://codegraph.dev/install.sh | bash

# Windows
$ iwr https://codegraph.dev/install.ps1 | iex
```

（推测 — 这两个文件在 `src/bin/install.sh` 存在）

## MCP Server Distribution

```bash
# Stdio (most common)
$ codegraph serve --mcp
# Agent spawns this as subprocess

# HTTP (YeLuo45 fork daemon mode)
$ codegraph daemon start
# Daemon listens on :9999
# Agent connects via proxy
```

## Per-Project .codegraph/

```bash
# Initialize
$ codegraph init
# Creates:
# .codegraph/
# ├── codegraph.db         — SQLite (per-project, gitignored)
# ├── codegraph.db-wal     — write-ahead log
# ├── extraction-cache/    — parse cache
# └── meta.json

# Status
$ codegraph status
# Shows backend, size, counts

# Re-index
$ codegraph index

# Watch (background)
$ codegraph sync --detach
```

**.gitignore** (auto-added by `codegraph init`):
```
.codegraph/
```

## Tree-sitter Grammar Files

```bash
# src/extraction/wasm/*.wasm
# Total ~30 MB
# Copied to dist/extraction/wasm/ on build
# Loaded at runtime via web-tree-sitter
```

**Distribution concern**: WASM 文件大，npm package size ~30MB。future 优化：按需下载。

## SQLite Backend

```typescript
// src/db/DatabaseConnection.ts
try {
  // 1. better-sqlite3 (native, fast)
  const Database = require('better-sqlite3');
  return new NativeDatabase(path, Database);
} catch (e) {
  // 2. node-sqlite3-wasm (WASM, slow)
  const { Database } = require('node-sqlite3-wasm');
  return new WasmDatabase(path, Database);
}
```

`codegraph status` 显示哪个 backend 实际用：
```bash
$ codegraph status
backend: better-sqlite3
# or
backend: node-sqlite3-wasm (slow path)
```

## CI/CD

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: [v*]

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*
```

## 8 个 Agent Targets 自动配置

```bash
# 一次性给所有 agent 配
$ codegraph install --target all --yes

# 验证
$ codegraph install --check
```

输出（推测）:
```
✓ claude: configured at ~/.claude/mcp.json
✓ cursor: configured at ~/.cursor/mcp.json  
✓ codex: configured at ~/.codex/config.toml
✓ opencode: configured at ~/.config/opencode/opencode.jsonc
✓ hermes: configured at ~/.hermes/config.yaml
✓ gemini: configured at ~/.gemini/settings.json
✓ antigravity: configured at ~/.antigravity/mcp.json
✓ kiro: configured at ~/.kiro/config.json
```

## 监控 (YeLuo45 fork daemon)

```bash
# Daemon status
$ codegraph daemon status
# daemon: running (PID 12345)
# port: 9999
# projects: 5 loaded
# sessions: 3 active
# uptime: 2 hours

# Logs
$ tail -f ~/.codegraph/daemon.log
```

## 性能目标

| 指标 | 目标 | 实际 |
|------|------|------|
| cold start (MCP) | <500ms | ~300ms |
| warm query | <50ms p95 | ~30ms |
| codegraph install | <2s for 8 targets | ~1s |
| index 1k LOC | <30s | ~10s |
| incremental sync | <100ms | ~50ms |
| daemon idle memory | <100MB | ~80MB |

## 备份

```bash
# .codegraph/ 目录备份
$ tar -czf codegraph-backup.tgz .codegraph/

# 跨机迁移
$ scp codegraph-backup.tgz new-host:~/
$ ssh new-host 'cd project && tar -xzf ~/codegraph-backup.tgz'
```

## 升级

```bash
# 1. Bump version (4 files per CLAUDE.md)
# 2. Build
$ npm run build
# 3. Test
$ npm test
# 4. Reinstall (installer self-heals legacy)
$ npm install -g @colbymchenry/codegraph@latest
$ codegraph install --target all --yes
```

## 已知限制

- Node.js 18-24 only（hard exit on 25）
- WASM grammar 包 ~30MB
- 单 SQLite db 上限 ~140TB（理论值，实践 100GB 够用）
- Daemon 无 auth（仅 localhost）
