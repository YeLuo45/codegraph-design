# MCP Server

> `src/mcp/` — 11 files, codegraph 的 MCP 协议实现

## 文件结构

```
src/mcp/
├── tools.ts                83 — 8 个 MCP tool 全部实现
├── index.ts                44 — server 主入口
├── transport.ts            44 — stdio/HTTP transport
├── engine.ts               27 — CodeGraph 引擎包装
├── daemon.ts               53 — 长生命周期后台进程 (YeLuo45 fork)
├── proxy.ts                26 — client → daemon 代理
├── session.ts              28 — session 跟踪
├── server-instructions.ts   2 — MCP `initialize` 返回内容
├── daemon-paths.ts         12 — daemon 路径常量
├── ppid-watchdog.ts         3 — 父进程死亡检测
└── version.ts               5 — version export
```

## 8 个 MCP Tools

| Tool | 描述 |
|------|------|
| `codegraph_search` | 搜 symbols（FTS5 + BM25） |
| `codegraph_callers` | 谁调用了 X |
| `codegraph_callees` | X 调用了谁 |
| `codegraph_impact` | 改 X 影响什么（callers + tests） |
| `codegraph_node` | 取单个 node 详情 |
| `codegraph_explore` | 从 query-matched seeds 做 BFS |
| `codegraph_status` | 索引状态（node/edge 数、上次索引时间） |
| `codegraph_files` | 项目文件结构 |

## Tool 实现示例

```typescript
// src/mcp/tools.ts (83 symbols)
import { CodeGraph } from '../index';

export const TOOLS = [
  {
    name: 'codegraph_search',
    description: 'Search code symbols by name, signature, or doc. FTS5-powered.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 20 },
        kind: { type: 'string', description: 'Filter by NodeKind' },
        file: { type: 'string', description: 'Restrict to file path' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      const cg = await getCodeGraph();
      const results = await cg.searchNodes(args.query, {
        limit: args.limit,
        kind: args.kind,
        file: args.file,
      });
      return { content: [{ type: 'text', text: formatResults(results) }] };
    },
  },
  
  {
    name: 'codegraph_callers',
    description: 'Find all functions/methods that call the given symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Symbol name or ID' },
        maxDepth: { type: 'number', default: 3 },
      },
      required: ['node'],
    },
    handler: async (args) => {
      const cg = await getCodeGraph();
      const node = await cg.resolveSymbol(args.node);
      const callers = await cg.getCallers(node.id, { maxDepth: args.maxDepth });
      return { content: [{ type: 'text', text: formatResults(callers) }] };
    },
  },
  
  // ... 6 more tools
];
```

## Server Instructions

```typescript
// src/mcp/server-instructions.ts
export const SERVER_INSTRUCTIONS = `# CodeGraph MCP Server

You have access to 8 codegraph tools that let you answer structural/flow questions about the codebase WITHOUT Read/Grep.

## When to use

- **Caller/callee questions** ("who calls X?", "what does X call?"): use \`codegraph_callers\` / \`codegraph_callees\`
- **Impact analysis** ("if I change X, what breaks?"): use \`codegraph_impact\`
- **Search by name** ("find the function that does X"): use \`codegraph_search\`
- **Symbol detail** ("show me the signature of X"): use \`codegraph_node\`
- **Multi-hop exploration** ("trace from X to Y"): use \`codegraph_explore\`
- **Project overview** ("how big is this project?"): use \`codegraph_status\`
- **File structure** ("what's in folder X?"): use \`codegraph_files\`

## Best practices

- Prefer codegraph over Read/Grep for structural questions (faster + cheaper)
- Use \`codegraph_search\` before \`codegraph_node\` (search to find, node to detail)
- Use \`maxDepth: 1-3\` for most questions (deeper gets noisy)
- When in doubt, use \`codegraph_explore\` with a query — it does the BFS for you
`;
```

这是 **single source of truth** — installer **不**再写 `## CodeGraph` 到 `CLAUDE.md` (issue #529 修复)。

## Transport

```typescript
// src/mcp/transport.ts (44 symbols)
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class MCPTransport {
  private server: Server;
  private transport: StdioServerTransport | HTTPTransport;
  
  async start(mode: 'stdio' | 'http', options?: HTTPOptions) {
    this.server = new Server({
      name: 'codegraph',
      version: '0.9.9',
    }, {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
    });
    
    // Register tools
    for (const tool of TOOLS) {
      this.server.setRequestHandler('tools/list', () => ({ tools: TOOLS }));
      this.server.setRequestHandler('tools/call', (req) => this.handleCall(req));
    }
    
    if (mode === 'stdio') {
      this.transport = new StdioServerTransport();
    } else {
      this.transport = new HTTPTransport(options);
    }
    
    await this.server.connect(this.transport);
  }
  
  private async handleCall(req: CallRequest) {
    const tool = TOOLS.find(t => t.name === req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    return tool.handler(req.params.arguments);
  }
}
```

## Cursor cwd Quirk

Cursor 启动 MCP subprocess 时有问题：
- 错的 cwd
- 不传 `rootUri` in `initialize`

**codegraph 修复**：
- 接受 `--path` CLI arg
- `codegraph install` 给 Cursor 注入 `--path`（绝对路径 / `${workspaceFolder}`）

```typescript
// 在 MCP server 启动时
if (process.argv.includes('--path')) {
  const pathIdx = process.argv.indexOf('--path');
  const projectPath = process.argv[pathIdx + 1];
  chdir(projectPath);  // 修正 cwd
}
```

**不要破坏这个修复**！

## Engine 包装

```typescript
// src/mcp/engine.ts (27 symbols)
import { CodeGraph } from '../index';

class MCPEngine {
  private cg?: CodeGraph;
  
  async ensureOpen(): Promise<CodeGraph> {
    if (this.cg) return this.cg;
    this.cg = await CodeGraph.open(process.cwd());
    return this.cg;
  }
  
  async ensureIndexed(): Promise<void> {
    const cg = await this.ensureOpen();
    const status = await cg.status();
    if (status.nodes === 0 || isOutdated(status)) {
      await cg.indexAll();
    }
  }
  
  async handleSearch(args) {
    const cg = await this.ensureOpen();
    await this.ensureIndexed();
    return cg.searchNodes(args.query, args);
  }
}
```

## Index.ts (44 symbols)

```typescript
// src/mcp/index.ts — main entry
#!/usr/bin/env node
import { MCPTransport } from './transport';

const mode = process.argv.includes('--http') ? 'http' : 'stdio';
const transport = new MCPTransport();
transport.start(mode).catch(console.error);
```

## Version

```typescript
// src/mcp/version.ts
export const VERSION = '0.9.9';
export const COMPATIBLE_MCP_VERSION = '2024-11-05';
```

## Performance

| Tool | p50 | p95 |
|------|-----|-----|
| `codegraph_search` | ~10ms | ~50ms |
| `codegraph_callers` (depth 2) | ~20ms | ~100ms |
| `codegraph_impact` (depth 5) | ~80ms | ~300ms |
| `codegraph_explore` (multi-hop) | ~50ms | ~200ms |
| `codegraph_status` | <1ms | ~5ms |
| `codegraph_files` | ~5ms | ~30ms |
| `codegraph_node` | <1ms | ~5ms |

## 与上游 MCP 对比

| 维度 | 上游 | YeLuo45 fork |
|------|------|--------------|
| MCP files | 6 | 11 |
| Daemon mode | ✗ | ✓ (4 files) |
| Server instructions | ✓ | ✓ (2 symbols) |
| Performance | good | similar |
