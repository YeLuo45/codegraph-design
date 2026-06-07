# Extraction

> 多语言代码提取架构

## 23+ Languages

### Tree-sitter WASM languages
| Lang | Symbol |
|------|--------|
| TypeScript | `tree-sitter-typescript` |
| JavaScript | `tree-sitter-javascript` |
| Python | `tree-sitter-python` |
| Go | `tree-sitter-go` |
| Rust | `tree-sitter-rust` |
| Java | `tree-sitter-java` |
| C | `tree-sitter-c` |
| C++ | `tree-sitter-cpp` |
| C# | `tree-sitter-c-sharp` |
| Ruby | `tree-sitter-ruby` |
| PHP | `tree-sitter-php` |
| Swift | `tree-sitter-swift` |
| Kotlin | `tree-sitter-kotlin` |
| Scala | `tree-sitter-scala` |
| Bash | `tree-sitter-bash` |
| Lua | `tree-sitter-lua` |
| Elixir | `tree-sitter-elixir` |
| Haskell | `tree-sitter-haskell` |
| OCaml | `tree-sitter-ocaml` |
| Zig | `tree-sitter-zig` |
| Elisp | `tree-sitter-elisp` |
| Markdown | `tree-sitter-markdown` |
| YAML | (推测 via yaml parser) |

### Non-tree-sitter extractors (4)
- **svelte-extractor.ts** — Svelte 单文件组件
- **vue-extractor.ts** — Vue 单文件组件 (.vue)
- **liquid-extractor.ts** — Shopify Liquid 模板
- **dfm-extractor.ts** — Delphi forms

## Tree-sitter 集成

```typescript
// src/extraction/grammars.ts
import { Parser, Language } from 'web-tree-sitter';

const GRAMMARS: Record<string, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  // ...
};

let parser: Parser;

async function getParser(): Promise<Parser> {
  if (!parser) {
    await Parser.init();
    parser = new Parser();
  }
  return parser;
}

export async function parseWASM(code: string, lang: string): Promise<Tree> {
  const parser = await getParser();
  const wasmPath = GRAMMARS[lang];
  const language = await Language.load(wasmPath);
  parser.setLanguage(language);
  return parser.parse(code);
}
```

## Per-Language Extractor Pattern

```typescript
// src/extraction/languages/typescript.ts
import { Tree, SyntaxNode } from 'web-tree-sitter';
import { Node, Edge } from '../../types';

export const typescript: Extractor = {
  name: 'typescript',
  
  walk(tree: Tree, filePath: string): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const fileNode = this.createFileNode(filePath);
    nodes.push(fileNode);
    
    // Walk top-level
    this.walkNode(tree.rootNode, fileNode.id, nodes, edges);
    
    return { nodes, edges };
  },
  
  walkNode(
    node: SyntaxNode,
    parentId: number,
    nodes: Node[],
    edges: Edge[],
  ): number | null {
    let myId: number | null = null;
    
    switch (node.type) {
      case 'class_declaration':
        myId = this.createClassNode(node, parentId, nodes);
        // Walk body for methods
        for (const child of node.children) {
          if (child.type === 'class_body') {
            this.walkClassBody(child, myId, nodes, edges);
          }
        }
        break;
        
      case 'function_declaration':
      case 'method_definition':
        myId = this.createFunctionNode(node, parentId, nodes);
        // Walk body for calls
        this.walkFunctionBody(node, myId, edges);
        break;
        
      case 'import_statement':
        myId = this.createImportNode(node, parentId, nodes);
        break;
        
      case 'interface_declaration':
        myId = this.createInterfaceNode(node, parentId, nodes);
        break;
        
      case 'type_alias_declaration':
        myId = this.createTypeAliasNode(node, parentId, nodes);
        break;
    }
    
    return myId;
  },
  
  // ... helpers
};
```

## Non-TS Extractor Pattern

```typescript
// src/extraction/svelte-extractor.ts
// Svelte 用正则 + 自定义 parser（不靠 tree-sitter）

export const svelte: Extractor = {
  name: 'svelte',
  
  walk(fileContent: string, filePath: string): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    
    // 1. Split into <script>, <style>, <template> blocks
    const scriptMatch = fileContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    const templateMatch = fileContent.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    
    // 2. File node
    nodes.push(this.createFileNode(filePath));
    
    // 3. Parse <script> as TypeScript (via tree-sitter)
    if (scriptMatch) {
      const tsExtractor = require('./languages/typescript').typescript;
      const tsResult = tsExtractor.walk(
        parseWASM(scriptMatch[1], 'typescript'),
        filePath,
      );
      nodes.push(...tsResult.nodes);
      edges.push(...tsResult.edges);
    }
    
    // 4. Extract Svelte-specific ($$props, $state, on:click, etc.)
    if (templateMatch) {
      this.extractSvelteTemplate(templateMatch[1], nodes, edges);
    }
    
    return { nodes, edges };
  },
  
  extractSvelteTemplate(content: string, nodes: Node[], edges: Edge[]) {
    // Event handlers
    const eventMatches = content.matchAll(/on:(\w+)=/g);
    for (const m of eventMatches) {
      nodes.push({
        kind: 'method',
        name: `on:${m[1]}`,
        // ...
      });
    }
    
    // Stores ($storeName)
    const storeMatches = content.matchAll(/\$([a-zA-Z_]\w*)/g);
    for (const m of storeMatches) {
      nodes.push({
        kind: 'variable',
        name: m[1],
        // ...
      });
    }
  },
};
```

## Framework Detection (12)

```typescript
// src/resolution/frameworks/express.ts
export const express: FrameworkPattern = {
  name: 'express',
  
  detect(nodes: Node[]): Node[] {
    const routeNodes: Node[] = [];
    
    // Express: app.get('/path', handler)
    for (const node of nodes) {
      if (node.kind !== 'method' || !node.signature) continue;
      
      // Check for `app.METHOD('PATH', ...)` pattern
      const match = node.signature.match(/^(\w+)\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/);
      if (match) {
        const [, appName, method, path] = match;
        const routeNode: Node = {
          kind: 'route',
          name: `${method.toUpperCase()} ${path}`,
          file_path: node.file_path,
          start_line: node.start_line,
          signature: `${method.toUpperCase()} ${path}`,
          doc: `Express route on ${appName}`,
          parent_id: node.parent_id,
          metadata: { framework: 'express', method, path },
        };
        routeNodes.push(routeNode);
      }
    }
    
    return routeNodes;
  },
};
```

**12 frameworks** (CLAUDE.md 提到):
- Express, Laravel, Rails, FastAPI, Django, Flask
- Spring, Gin, Axum, ASP.NET
- Vapor, React Router, SvelteKit, Vue/Nuxt
- Cargo workspaces

## Parse Worker

```typescript
// src/extraction/parse-worker.ts
// Off-main-thread parsing (避免阻塞 MCP request)

import { Worker } from 'worker_threads';

class ParseWorker {
  private workers: Worker[] = [];
  private nextIdx = 0;
  
  constructor(concurrency = 4) {
    for (let i = 0; i < concurrency; i++) {
      this.workers.push(new Worker('./parse-worker-impl.js'));
    }
  }
  
  async parseGroup(lang: string, files: SourceFile[]): Promise<ExtractionResult> {
    // Distribute to next worker
    const worker = this.workers[this.nextIdx];
    this.nextIdx = (this.nextIdx + 1) % this.workers.length;
    
    return new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.postMessage({ type: 'parse', lang, files });
    });
  }
}
```

## Performance

| 阶段 | 1k LOC | 10k LOC | 100k LOC |
|------|--------|---------|----------|
| Tree-sitter parse | ~50ms | ~500ms | ~5s |
| AST walk + extract | ~30ms | ~300ms | ~3s |
| Total extraction | ~80ms | ~800ms | ~8s |
| **With parse-worker** (4 workers) | **~20ms** | **~200ms** | **~2s** |

## 已知限制

- 每个 tree-sitter grammar 都是一个 .wasm 文件（~1-2MB）
- 总 grammar 包大小 ~30MB（首次 install 慢）
- 增量更新：单 file 改 → 重 extract 该 file
- 大 file (>10k LOC) 慢（未来 web-worker in MCP）
