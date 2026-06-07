# Pipeline

> codegraph 完整 4 阶段 pipeline

## 4 阶段概览

```
files (source code)
   ↓
[1] ExtractionOrchestrator (tree-sitter)
   ↓
[2] ReferenceResolver
   ↓
[3] GraphQueryManager / GraphTraverser
   ↓
[4] ContextBuilder
   ↓
result (markdown / JSON for AI)
```

## Stage 1: Extraction

```typescript
// src/extraction/ExtractionOrchestrator.ts
class ExtractionOrchestrator {
  private wasmGrammars: Map<string, Language>;
  
  async extractFiles(files: SourceFile[]): Promise<ExtractionResult> {
    // 1. Group files by language
    const groups = groupBy(files, f => detectLanguage(f.path));
    
    // 2. For each language, parse in parallel (off-main-thread)
    const results = await Promise.all(
      groups.map(([lang, group]) => this.parseWorker.parseGroup(lang, group))
    );
    
    // 3. Merge to nodes + edges
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    for (const r of results) {
      nodes.push(...r.nodes);
      edges.push(...r.edges);
    }
    
    return { nodes, edges };
  }
}
```

**Per-file Extraction**:
```typescript
async function extractFile(file: SourceFile): Promise<ExtractionResult> {
  // 1. Read file
  const code = await fs.readFile(file.path, 'utf-8');
  
  // 2. Detect language
  const lang = detectLanguage(file.path);
  if (!lang) return { nodes: [], edges: [] };
  
  // 3. Pick extractor
  const extractor = getExtractor(lang);
  
  // 4. Parse with tree-sitter (or non-TS extractor)
  const tree = parseWASM(code, lang);
  
  // 5. Walk AST → extract nodes/edges
  const { nodes, edges } = extractor.walk(tree, file.path);
  
  return { nodes, edges };
}
```

## Stage 2: Reference Resolution

```typescript
// src/resolution/ReferenceResolver.ts
class ReferenceResolver {
  async resolve(nodes: Node[], edges: Edge[]): Promise<ResolvedGraph> {
    // 1. Import resolution
    const imports = await this.importResolver.resolve(nodes);
    
    // 2. Name matching (for symbols imported as alias)
    const matches = await this.nameMatcher.match(nodes, imports);
    
    // 3. Framework patterns
    const frameworkEdges = await this.frameworks.detect(nodes);
    
    // 4. Merge
    return {
      nodes,
      edges: [
        ...edges,                    // from extraction
        ...imports,                  // resolved imports
        ...matches,                  // name-based matches
        ...frameworkEdges,           // framework-detected
      ],
    };
  }
}
```

**Import Resolver** (with tsconfig path aliases):
```typescript
class ImportResolver {
  async resolve(nodes: Node[]): Promise<Edge[]> {
    const edges: Edge[] = [];
    
    for (const node of nodes.filter(n => n.kind === 'import')) {
      // 1. Parse import path
      const importPath = node.metadata.path;
      
      // 2. Apply tsconfig path aliases
      const resolved = this.applyAliases(importPath, node.file);
      
      // 3. Find target file
      const target = await this.resolveToFile(resolved, node.file);
      if (!target) continue;
      
      // 4. Find target symbols
      for (const sym of node.metadata.symbols) {
        const targetSym = await this.findSymbol(target, sym);
        if (targetSym) {
          edges.push({
            kind: 'imports',
            source: node.id,
            target: targetSym.id,
          });
        }
      }
    }
    
    return edges;
  }
}
```

## Stage 3: Graph Queries

```typescript
// src/graph/GraphTraverser.ts
class GraphTraverser {
  // BFS for callers
  async getCallers(nodeId: string, options?: { maxDepth?: number }) {
    return this.bfs(nodeId, {
      direction: 'incoming',
      edgeKinds: ['calls', 'imports', 'references'],
      maxDepth: options?.maxDepth ?? 5,
    });
  }
  
  // BFS for callees
  async getCallees(nodeId: string, options?: { maxDepth?: number }) {
    return this.bfs(nodeId, {
      direction: 'outgoing',
      edgeKinds: ['calls', 'imports', 'references'],
      maxDepth: options?.maxDepth ?? 5,
    });
  }
  
  // Impact analysis
  async getImpactRadius(nodeId: string, options?: { maxDepth?: number }) {
    // 1. Find all callers (transitive)
    const callers = await this.getCallers(nodeId, { maxDepth: 10 });
    
    // 2. Find all tests of those callers
    const testCallers = await this.findTestCallers(callers);
    
    return { callers, testCallers };
  }
  
  // BFS implementation
  private async bfs(startId: string, opts: BFSOptions): Promise<Node[]> {
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
    const results: Node[] = [];
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      
      const node = await this.getNode(id);
      if (depth > 0) results.push(node);  // skip start node
      
      // Find edges
      const edges = await this.getEdges(id, opts.direction, opts.edgeKinds);
      for (const edge of edges) {
        const next = opts.direction === 'incoming' ? edge.source : edge.target;
        if (!visited.has(next) && depth < opts.maxDepth) {
          queue.push({ id: next, depth: depth + 1 });
        }
      }
    }
    
    return results;
  }
}
```

## Stage 4: Context Building

```typescript
// src/context/ContextBuilder.ts
class ContextBuilder {
  buildContext(query: string, results: GraphResult[], opts: ContextOptions): string {
    if (opts.format === 'markdown') {
      return this.formatMarkdown(query, results, opts);
    } else {
      return JSON.stringify(results, null, 2);
    }
  }
  
  private formatMarkdown(query: string, results: GraphResult[], opts: ContextOptions): string {
    const lines: string[] = [];
    
    lines.push(`# CodeGraph Results: "${query}"`);
    lines.push('');
    lines.push(`Found ${results.length} matches in ${opts.tookMs}ms`);
    lines.push('');
    
    for (const r of results.slice(0, opts.limit ?? 20)) {
      lines.push(`## ${r.node.kind}: ${r.node.name}`);
      lines.push(`File: ${r.node.file_path}:${r.node.start_line}-${r.node.end_line}`);
      if (r.node.signature) lines.push('```');
      if (r.node.signature) lines.push(r.node.signature);
      if (r.node.signature) lines.push('```');
      if (r.node.doc) lines.push(r.node.doc);
      lines.push('');
    }
    
    return lines.join('\n');
  }
}
```

## 性能特征（v0.9.9）

| 操作 | 1k nodes | 10k nodes | 100k nodes |
|------|----------|-----------|------------|
| 初始 extraction | ~2s | ~20s | ~3min |
| Search (BM25) | ~5ms | ~30ms | ~200ms |
| Get callers (depth 2) | ~10ms | ~50ms | ~300ms |
| Get impact (depth 10) | ~50ms | ~300ms | ~2s |
| Context build | ~5ms | ~20ms | ~100ms |
| Watcher file change | ~50ms | ~50ms | ~50ms |

## SQLite 索引

```sql
-- 关键 indexes
CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_nodes_file ON nodes(file_path);
CREATE INDEX idx_nodes_name ON nodes(name);

CREATE INDEX idx_edges_source ON edges(source_id, kind);
CREATE INDEX idx_edges_target ON edges(target_id, kind);

-- FTS5 virtual table
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  name, signature, doc,
  content='nodes',
  tokenize='porter unicode61'
);
```

## 增量更新（sync）

```typescript
// src/sync/FileWatcher.ts
class FileWatcher {
  private watchers: FSWatcher[] = [];
  
  watch(path: string, onChange: (file: string) => void) {
    if (process.platform === 'darwin') {
      this.watchers.push(fsevents.watch(path, (file) => onChange(file)));
    } else if (process.platform === 'linux') {
      this.watchers.push(inotify.watch(path, (file) => onChange(file)));
    } else {
      // Windows RDCW
    }
  }
  
  onChange = (file: string) => {
    // Debounce
    this.debounce(() => this.handleChange(file), 100);
  };
  
  private handleChange(file: string) {
    // 1. Re-extract single file
    const { nodes, edges } = await extractFile(file);
    
    // 2. Diff with DB
    const oldNodes = await db.getNodesForFile(file);
    const toRemove = diff(oldNodes, nodes);
    
    // 3. Apply delta
    await db.transaction(() => {
      db.removeNodes(toRemove);
      db.insertNodes(nodes);
      db.insertEdges(edges);
    });
  }
}
```
