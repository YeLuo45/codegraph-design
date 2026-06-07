# YeLuo45 Fork

> 跟上游 colbymchenry/codegraph 的差异

## 概述

YeLuo45/codegraph 是上游 colbymchenry/codegraph 的 fork，主要差异：

| 维度 | 上游 | YeLuo45 fork |
|------|------|--------------|
| 版本 | 0.9.9 | 0.9.9 |
| Installer targets | 4 (claude, cursor, codex, opencode) | **8** (claude, cursor, codex, opencode, **hermes**, **gemini**, **antigravity**, **kiro**) |
| MCP server 模式 | stdio only | stdio + **daemon** |
| Framework extractors | 12 | 12 + 推测新增 (mybatis, razor) |
| Non-tree-sitter extractors | 4 (svelte, vue, liquid, dfm) | 4 |
| CLAUDE.md 大小 | 较小 | 30K+ 字符（详尽） |

## 4 个新 Installer Targets

### hermes.ts (39 symbols)
**最大**的 target（vs 上游 4 个平均 ~25 symbols）— 专门为 hermes-agent 设计。

```typescript
class HermesTarget implements AgentTarget {
  readonly id = 'hermes' as const;
  readonly displayName = 'Hermes Agent';
  readonly docsUrl = 'https://hermes-agent.nousresearch.com';

  supportsLocation(loc: Location): boolean {
    return loc === 'global';  // Hermes 只支持 global
  }
  
  install(loc: Location): WriteResult {
    return {
      files: [writeHermesConfig()],
      notes: ['Start a new Hermes session for MCP changes to take effect.'],
    };
  }
}
```

**它做的事**（基于已读源码）：
1. 找到 `$HERMES_HOME/config.yaml`（默认 `~/.hermes/config.yaml`）
2. 调 `upsertCodeGraphMcpServer` 写入 `mcp_servers.codegraph`
3. 调 `upsertCodeGraphToolset` 给 `platform_toolsets.cli` 加 `mcp-codegraph`
4. Atomic write + trailing newline

**重要**：它**只**支持 `global`（hermes 没用 local project config 概念）。

### antigravity.ts (29 symbols)
Antigravity AI 集成（具体行为待 explore）。

### gemini.ts (23 symbols)
Gemini CLI 集成。

### kiro.ts (22 symbols)
Kiro AI 集成。

## Daemon 模式（4 个新文件）

### daemon.ts (53 symbols)
**最大**的 MCP server 文件 — 长生命周期后台进程：

```typescript
// 推测
class CodeGraphDaemon {
  start() {
    // 1. 加载所有 .codegraph/ 项目
    // 2. 起 HTTP server (default port: 9999?)
    // 3. 监听 proxy 连接
  }
  
  registerProject(projectPath: string) {
    // 建索引、加载到内存
  }
  
  handleRequest(req: ProxyRequest) {
    // 路由到正确 project
  }
}
```

### proxy.ts (26 symbols)
客户端代理，转发到 daemon。

### session.ts (28 symbols)
会话管理 — 跟踪每个 client 的 project context。

### ppid-watchdog.ts (3 symbols)
父进程死亡检测（**3 symbols** 但关键）：
- 父进程死了 → daemon 自己退出
- 防止 zombie daemon

## Framework Extractors 推测差异

CLAUDE.md 提到 `mybatis-extractor.ts` 和 `razor-extractor.ts` — 这两个**可能**是 YeLuo45 fork 新增（上游估计没有）。

**MyBatis** — Java SQL 框架，处理 mapper XML + Java interface 映射
**Razor** — ASP.NET view engine，处理 .cshtml

## CLAUDE.md 增强

YeLuo45 fork 的 CLAUDE.md (30K+ 字符) 远详尽于上游：
- 完整 architecture 描述
- Multi-agent installer 设计 rationale
- 性能优化目标（35%/57%/46%）
- Cursor 兼容性 quirk
- Issue references (#529, #137, #207)
- 最近 30 天 benchmark 数字

## 上游同步策略

```bash
# 1. 添加 upstream remote
git remote add upstream https://github.com/colbymchenry/codegraph.git

# 2. fetch
git fetch upstream

# 3. merge 或 rebase
git merge upstream/main  # 或 rebase

# 4. resolve conflicts (主要在 installer/targets/ 因为 YeLuo45 加了 4 个)
# 5. push 到 YeLuo45 fork
```

## 当前 fork 状态

- v0.9.9 与上游同版本号
- 4 个新 target + daemon 模式是**纯增量**
- 任何上游的 db / extraction / graph 改进可 merge 而无冲突（除非改了 installer 框架）

## YeLuo45 fork 的目标

- 跨 8 个 AI agent 平台（不仅 4 个）
- 长期运行的 daemon 服务（多个 project 共享）
- 完整的 hermes-agent 集成（boss 用的 agent）
- 详尽的 CLAUDE.md 文档（让 AI 理解 codegraph 自己）
