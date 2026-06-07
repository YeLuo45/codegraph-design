# Data Model

> codegraph 核心数据模型

## 顶层

```typescript
interface Node {
  id: number;                  // SQLite rowid
  kind: NodeKind;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  signature?: string;           // e.g. "(x: number) => number"
  doc?: string;                // JSDoc / doc comment
  content_hash?: string;       // for incremental sync
  parent_id?: number;          // for contains edge
  metadata: Record<string, unknown>;
}

interface Edge {
  id?: number;
  source_id: number;
  target_id: number;
  kind: EdgeKind;
  weight?: number;             // 0..1 (default 1.0)
  metadata?: Record<string, unknown>;
}
```

## NodeKind (23 values)

```typescript
type NodeKind =
  | 'file'           // source file
  | 'module'         // module / package
  | 'class'          // class
  | 'struct'         // C struct / Rust struct
  | 'interface'      // Type/Java interface
  | 'trait'          // Rust trait
  | 'protocol'       // Swift protocol
  | 'function'       // top-level function
  | 'method'         // class method
  | 'property'       // class property
  | 'field'          // struct/class field
  | 'variable'       // local var
  | 'constant'       // const
  | 'enum'           // enum
  | 'enum_member'    // enum value
  | 'type_alias'     // type alias
  | 'namespace'      // namespace
  | 'parameter'      // function parameter
  | 'import'         // import statement
  | 'export'         // export statement
  | 'route'          // HTTP route (Express/Laravel/etc)
  | 'component';     // React/Vue/Svelte component
```

## EdgeKind (12 values)

```typescript
type EdgeKind =
  | 'contains'       // file -> module, class -> method
  | 'calls'          // function -> function
  | 'imports'        // file -> file
  | 'exports'        // file -> symbol
  | 'extends'        // class -> class
  | 'implements'     // class -> interface
  | 'references'     // file -> symbol (route detection)
  | 'type_of'        // var -> type
  | 'returns'        // function -> return type
  | 'instantiates'   // var -> class
  | 'overrides'      // method -> method
  | 'decorates';     // function -> function (decorator)
```

## SQLite Schema

```sql
-- Nodes table
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  end_line INTEGER,
  signature TEXT,
  doc TEXT,
  content_hash TEXT,
  parent_id INTEGER,
  metadata TEXT,  -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Edges table
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  metadata TEXT,
  FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE (source_id, target_id, kind)
);

-- FTS5 virtual table
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  name, signature, doc,
  content='nodes',
  tokenize='porter unicode61'
);

-- FTS5 triggers (keep in sync)
CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, name, signature, doc)
  VALUES (new.id, new.name, new.signature, new.doc);
END;

CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.id;
END;

CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE rowid = old.id;
  INSERT INTO nodes_fts(rowid, name, signature, doc)
  VALUES (new.id, new.name, new.signature, new.doc);
END;

-- Indexes
CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_nodes_file ON nodes(file_path);
CREATE INDEX idx_nodes_name ON nodes(name);
CREATE INDEX idx_nodes_parent ON nodes(parent_id);

CREATE INDEX idx_edges_source ON edges(source_id, kind);
CREATE INDEX idx_edges_target ON edges(target_id, kind);

-- Metadata
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- File tracking
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  last_indexed TIMESTAMP,
  size INTEGER,
  mtime INTEGER
);
```

## Backend 选项

```typescript
// src/db/DatabaseConnection.ts
class DatabaseConnection {
  static async open(path: string): Promise<DatabaseConnection> {
    try {
      // 1. Try better-sqlite3 (native)
      const Database = require('better-sqlite3');
      return new NativeDatabase(path, Database);
    } catch (e) {
      // 2. Fallback to node-sqlite3-wasm (WASM)
      const { Database } = require('node-sqlite3-wasm');
      return new WasmDatabase(path, Database);
    }
  }
}

// `codegraph status` 显示当前
$ codegraph status
backend: better-sqlite3
db path: /path/to/.codegraph/codegraph.db
size: 12.3 MB
nodes: 3456
edges: 8901
last indexed: 2 min ago
```

## 索引策略

### B-tree Indexes
- `idx_nodes_kind` — 查询 `kind=function` 等
- `idx_nodes_file` — 查询某 file 的所有 nodes
- `idx_edges_source/target` — graph traversal

### FTS5 Index
- `nodes_fts(name, signature, doc)` — search query

## 完整 .codegraph/ 目录

```
.codegraph/
├── codegraph.db         — main SQLite db
├── codegraph.db-wal     — WAL (write-ahead log)
├── codegraph.db-shm     — shared memory
├── schema.sql           — schema snapshot
├── extraction-cache/    — parse cache (per file hash)
└── meta.json            — last indexed time, version, etc.
```

## Node Examples

```typescript
// 1. function node
{
  id: 1,
  kind: 'function',
  name: 'parseArgs',
  file_path: 'src/cli/args.ts',
  start_line: 10,
  end_line: 25,
  signature: 'parseArgs(argv: string[]): Args',
  doc: 'Parse CLI arguments',
  content_hash: 'sha256:abc...',
  parent_id: 5,  // file node
  metadata: { exported: true, async: false },
}

// 2. class node
{
  id: 2,
  kind: 'class',
  name: 'CodeGraph',
  file_path: 'src/index.ts',
  start_line: 50,
  end_line: 150,
  doc: 'Main API class',
  parent_id: 5,
  metadata: { abstract: false, generic: false },
}

// 3. import node
{
  id: 3,
  kind: 'import',
  name: 'better-sqlite3',
  file_path: 'src/db/connection.ts',
  start_line: 1,
  end_line: 1,
  parent_id: 6,
  metadata: { type: 'default', alias: 'Database' },
}
```

## Edge Examples

```typescript
// 1. contains (file -> class)
{
  source_id: 5,  // file node
  target_id: 2,  // CodeGraph class
  kind: 'contains',
  weight: 1.0,
}

// 2. calls (function -> function)
{
  source_id: 1,  // parseArgs function
  target_id: 7,  // parseFlag function
  kind: 'calls',
  weight: 1.0,
  metadata: { line: 15 },  // callsite line
}

// 3. extends
{
  source_id: 2,  // CodeGraph class
  target_id: 8,  // BaseClass
  kind: 'extends',
  weight: 1.0,
}
```
