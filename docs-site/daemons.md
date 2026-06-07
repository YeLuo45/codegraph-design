# Daemons (YeLuo45 fork 新增)

> `src/mcp/daemon.ts` (53 symbols) — 长生命周期后台进程

## 动机

上游 colbymchenry/codegraph 用 **stdio per-MCP-server** 模式：
- 每个 AI agent 启动时，codegraph 都 spawn 一个新进程
- 每个进程独立 open SQLite、独立建索引
- 多个 agent 用同一项目时 → 多个进程读同一 db（lock contention）

YeLuo45 fork 加了 **daemon 模式**：
- 一个 codegraph daemon 进程长期运行
- 多个 client (agent) 通过 proxy 连接 daemon
- daemon 持有所有 project 状态、缓存

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  AI Agent #1 (project A)                                 │
│  └─ codegraph (stdio mode) ──┐                          │
│                              │ proxy                   │
│  AI Agent #2 (project B)     ├→ codegraph daemon       │
│  └─ codegraph (stdio mode) ──┤   (port 9999)           │
│                              │   ├─ project A: .codegraph/A.db
│  AI Agent #3 (project A)     │   ├─ project B: .codegraph/B.db
│  └─ codegraph (stdio mode) ──┘   └─ project C: .codegraph/C.db
└─────────────────────────────────────────────────────────┘
```

## 4 个新文件

| File | Symbols | 角色 |
|------|---------|------|
| `daemon.ts` | 53 | 主 daemon 进程 |
| `proxy.ts` | 26 | client → daemon 转发 |
| `session.ts` | 28 | session 管理 |
| `ppid-watchdog.ts` | 3 | 父进程死亡检测 |

## Daemon 主流程

```typescript
// src/mcp/daemon.ts (53 symbols, 推测)
class CodeGraphDaemon {
  private port: number = 9999;
  private projects: Map<string, CodeGraph> = new Map();
  private sessions: Map<string, Session> = new Map();
  private httpServer: Server;
  
  async start() {
    // 1. Setup HTTP server
    this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
    
    // 2. Watch filesystem for new .codegraph/ dirs
    this.startFilesystemWatcher();
    
    // 3. Start PPID watchdog
    startPpidWatchdog(() => this.shutdown());
    
    // 4. Listen
    this.httpServer.listen(this.port, () => {
      console.log(`codegraph daemon listening on :${this.port}`);
    });
  }
  
  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const sessionId = req.headers['x-session-id'] as string;
    const session = this.getOrCreateSession(sessionId);
    
    // Parse MCP request
    const mcpReq = await parseMCPRequest(req);
    
    // Find target project
    const project = this.projects.get(session.projectPath);
    if (!project) {
      // Auto-load
      this.projects.set(session.projectPath, await CodeGraph.open(session.projectPath));
    }
    
    // Handle tool call
    const result = await this.handleToolCall(mcpReq, project);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }
  
  private async handleToolCall(req: MCPRequest, project: CodeGraph) {
    const tool = TOOLS.find(t => t.name === req.method);
    return tool.handler(req.params, project);
  }
  
  private async shutdown() {
    // Close all projects
    for (const p of this.projects.values()) {
      await p.close();
    }
    
    // Close HTTP server
    this.httpServer.close();
    
    process.exit(0);
  }
}
```

## Proxy

```typescript
// src/mcp/proxy.ts (26 symbols, 推测)
class CodeGraphProxy {
  private daemonUrl: string = 'http://localhost:9999';
  private sessionId: string;
  
  constructor(daemonUrl?: string) {
    this.daemonUrl = daemonUrl ?? process.env.CODEGRAPH_DAEMON_URL ?? 'http://localhost:9999';
    this.sessionId = process.env.CODEGRAPH_SESSION_ID ?? randomUUID();
  }
  
  async handleRequest(mcpReq: MCPRequest): Promise<MCPResponse> {
    // Forward to daemon
    const resp = await fetch(this.daemonUrl + '/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': this.sessionId,
      },
      body: JSON.stringify(mcpReq),
    });
    
    return resp.json();
  }
}
```

## Session

```typescript
// src/mcp/session.ts (28 symbols, 推测)
interface Session {
  id: string;
  projectPath: string;
  startedAt: number;
  lastActiveAt: number;
  callCount: number;
  agentName: string;          // 'claude' | 'cursor' | 'hermes' | ...
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private maxAge: number = 24 * 60 * 60 * 1000;  // 24h
  
  getOrCreate(id: string): Session {
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        id,
        projectPath: process.cwd(),
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
        callCount: 0,
        agentName: process.env.CODEGRAPH_AGENT ?? 'unknown',
      });
    } else {
      const s = this.sessions.get(id)!;
      s.lastActiveAt = Date.now();
      s.callCount++;
    }
    return this.sessions.get(id)!;
  }
  
  gc() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastActiveAt > this.maxAge) {
        this.sessions.delete(id);
      }
    }
  }
}
```

## PPID Watchdog

```typescript
// src/mcp/ppid-watchdog.ts (3 symbols)
function startPpidWatchdog(onDead: () => void) {
  setInterval(() => {
    if (process.ppid === 1) {
      // Parent died (reparented to init)
      onDead();
    }
  }, 1000);
}
```

**关键**：只有 3 symbols 但**至关重要**。如果父进程死掉，daemon 必须自己退出，否则会变 zombie。

## 部署模式

### Standalone（默认，无 daemon）

```bash
# 直接调 codegraph MCP server
codegraph serve --mcp
```

每个 agent 启动一个独立进程。

### Daemon 模式（YeLuo45 fork 新增）

```bash
# 1. Start daemon (once)
codegraph daemon start

# 2. Agents connect via proxy
codegraph serve --mcp --daemon-url=http://localhost:9999

# Or set env
export CODEGRAPH_DAEMON_URL=http://localhost:9999
codegraph serve --mcp
```

## 优势

| 维度 | Standalone | Daemon |
|------|------------|--------|
| 启动延迟 | ~500ms (open db) | ~10ms (proxy) |
| 内存 | N × ~100MB | ~100MB total + N × 几 MB |
| DB lock | 独立 | 共享（更高效） |
| Index sharing | 各自重新索引 | 共享（1 次索引） |
| 适用 | 1 agent | 多 agent 并发 |

## 已知限制

- Daemon 模式需手动启动（`codegraph daemon start`）
- 没做 auth（任何 localhost 都能连 — 仅适合本地）
- session gc 是 O(n) linear scan

## 与上游对比

| 维度 | 上游 | YeLuo45 fork |
|------|------|--------------|
| Standalone MCP | ✓ | ✓ |
| Daemon mode | ✗ | ✓ |
| Proxy | ✗ | ✓ |
| Session tracking | ✗ | ✓ |
| PPID watchdog | ✗ | ✓ |
| Multi-project | ✓ (one at a time) | ✓ (concurrent) |
