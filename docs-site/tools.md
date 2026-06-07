# Tools (8 MCP Tools)

> `src/mcp/tools.ts` (83 symbols) — codegraph 8 个 MCP 工具详细文档

## 8 个工具概览

| Tool | 用途 | 主要参数 |
|------|------|----------|
| `codegraph_search` | 搜 symbols | query, limit, kind, file |
| `codegraph_callers` | 谁调用 X | node, maxDepth |
| `codegraph_callees` | X 调用谁 | node, maxDepth |
| `codegraph_impact` | 改 X 影响什么 | node, maxDepth |
| `codegraph_node` | 单个 node 详情 | node |
| `codegraph_explore` | 多跳探索 | query, maxDepth |
| `codegraph_status` | 索引状态 | (no params) |
| `codegraph_files` | 项目文件结构 | path (optional) |

## 1. codegraph_search

**FTS5-powered symbol search**

```typescript
{
  name: 'codegraph_search',
  description: 'Search code symbols by name, signature, or doc. FTS5-powered.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', default: 20 },
      kind: { type: 'string' },  // NodeKind
      file: { type: 'string' },   // restrict to file
    },
    required: ['query'],
  },
}
```

**Example calls**:
```
"find all async functions"         → kind=function + signature LIKE '%async%'
"User class in models/user.ts"     → query="User" + file="models/user.ts"
"anything about validation"        → query="validation" (FTS5 search)
```

**Performance**:
- FTS5 query: ~5ms (100k nodes)
- Rerank + filter: ~20ms total
- Default limit: 20

## 2. codegraph_callers

**BFS for incoming edges**

```typescript
{
  name: 'codegraph_callers',
  description: 'Find all functions/methods that call the given symbol.',
  inputSchema: {
    type: 'object',
    properties: {
      node: { type: 'string' },  // symbol name or ID
      maxDepth: { type: 'number', default: 3 },
    },
    required: ['node'],
  },
}
```

**Example calls**:
```
"who calls parseArgs?"        → callers(parseArgs, depth=3)
"transitive callers of X"     → callers(X, depth=10)
```

**Edge kinds considered**: `calls`, `imports`, `references`, `instantiates`, `overrides`

**Performance**:
- Depth 1: ~5ms
- Depth 3: ~30ms
- Depth 10: ~200ms

## 3. codegraph_callees

**BFS for outgoing edges** (mirror of callers)

```typescript
{
  name: 'codegraph_callees',
  description: 'Find all functions/methods that the given symbol calls.',
  inputSchema: {
    type: 'object',
    properties: {
      node: { type: 'string' },
      maxDepth: { type: 'number', default: 3 },
    },
    required: ['node'],
  },
}
```

**Example calls**:
```
"what does parseArgs call?"     → callees(parseArgs, depth=3)
"trace of main()"               → callees(main, depth=10)
```

## 4. codegraph_impact

**Transitive impact analysis**

```typescript
{
  name: 'codegraph_impact',
  description: 'Find what would break if the given symbol changed (callers + their tests).',
  inputSchema: {
    type: 'object',
    properties: {
      node: { type: 'string' },
      maxDepth: { type: 'number', default: 5 },
    },
    required: ['node'],
  },
}
```

**Example calls**:
```
"if I change validate(), what breaks?"  → impact(validate)
"blast radius of API class"             → impact(API, depth=10)
```

**Returns**:
```json
{
  "callers": [...],  // all callers (transitive)
  "testCallers": [...],  // tests of those callers
  "totalCount": 23,
}
```

## 5. codegraph_node

**Single node detail**

```typescript
{
  name: 'codegraph_node',
  description: 'Get detailed information about a single node (signature, doc, related).',
  inputSchema: {
    type: 'object',
    properties: {
      node: { type: 'string' },
    },
    required: ['node'],
  },
}
```

**Returns**:
```json
{
  "id": 123,
  "kind": "function",
  "name": "parseArgs",
  "file_path": "src/cli/args.ts",
  "start_line": 10,
  "end_line": 25,
  "signature": "parseArgs(argv: string[]): Args",
  "doc": "Parse CLI arguments from process.argv",
  "callers": [...],   // direct callers
  "callees": [...],   // direct callees
  "related": [...]    // imports, exports
}
```

## 6. codegraph_explore

**Multi-hop graph exploration**

```typescript
{
  name: 'codegraph_explore',
  description: 'Multi-hop graph exploration from query-matched seeds.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      maxDepth: { type: 'number', default: 2 },
      direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'] },
    },
    required: ['query'],
  },
}
```

**Example calls**:
```
"trace authentication flow"     → explore("authenticate", depth=3)
"how does the request reach X" → explore("X", direction="incoming")
```

**Algorithm**:
1. FTS5 search for query-matched nodes (seeds)
2. BFS from seeds (configurable direction)
3. Return all reached nodes with paths

## 7. codegraph_status

**Index health**

```typescript
{
  name: 'codegraph_status',
  description: 'Get index status (backend, size, counts, last indexed).',
  inputSchema: { type: 'object', properties: {} },
}
```

**Returns**:
```json
{
  "backend": "better-sqlite3",
  "dbPath": "/path/to/.codegraph/codegraph.db",
  "size": "12.3 MB",
  "nodes": 3456,
  "edges": 8901,
  "files": 234,
  "lastIndexed": "2026-06-07T03:00:00Z",
  "indexedAge": "2 hours",
  "watcherActive": true
}
```

## 8. codegraph_files

**Project file tree**

```typescript
{
  name: 'codegraph_files',
  description: 'Get the project file structure as a tree.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Subdirectory to start from' },
    },
  },
}
```

**Returns**:
```json
{
  "files": [
    { "path": "src/index.ts", "kind": "file", "nodeCount": 23 },
    { "path": "src/cli/", "kind": "directory", "files": [...] }
  ]
}
```

## 性能综合

| Tool | p50 | p95 | Notes |
|------|-----|-----|-------|
| `codegraph_search` | ~10ms | ~50ms | FTS5 |
| `codegraph_callers` (depth 3) | ~30ms | ~100ms | BFS |
| `codegraph_callees` (depth 3) | ~30ms | ~100ms | BFS |
| `codegraph_impact` (depth 5) | ~80ms | ~300ms | BFS + test lookup |
| `codegraph_node` | <1ms | ~5ms | Direct lookup |
| `codegraph_explore` | ~50ms | ~200ms | FTS5 + BFS |
| `codegraph_status` | <1ms | ~5ms | DB stats |
| `codegraph_files` | ~5ms | ~30ms | Tree query |

## 使用模式

### 问题 → Tool 映射

| 问题 | 工具 |
|------|------|
| "What's the function that does X?" | `codegraph_search` |
| "Show me the signature of X" | `codegraph_node` |
| "Who calls X?" | `codegraph_callers` |
| "What does X call?" | `codegraph_callees` |
| "If I change X, what breaks?" | `codegraph_impact` |
| "How does X reach Y?" | `codegraph_explore` |
| "Is this project big?" | `codegraph_status` |
| "What files are in folder X?" | `codegraph_files` |

### 调用模式

```typescript
// 1. Search first
const results = await mcp.call('codegraph_search', { query: 'validate', limit: 5 });

// 2. Get detail for top result
const detail = await mcp.call('codegraph_node', { node: results[0].id });

// 3. Get impact
const impact = await mcp.call('codegraph_impact', { node: results[0].id, maxDepth: 5 });
```

## Token 节省

| 模式 | 不用 codegraph | 用 codegraph | 节省 |
|------|----------------|--------------|------|
| "找 X 函数" | Read 5-10 files | search + node | 70% |
| "X 调用谁" | Grep + Read | callees | 80% |
| "X 影响范围" | Manual trace | impact | 90% |

总体：**35% cost · 57% tokens · 46% tool calls** saved (README A/B benchmark)
