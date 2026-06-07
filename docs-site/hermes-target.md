# Hermes Target (YeLuo45 fork)

> `src/installer/targets/hermes.ts` (39 symbols) — Hermes Agent 集成

## 概述

HermesTarget 是 YeLuo45 fork **最大**的 installer target，专门为 hermes-agent 设计。

```typescript
class HermesTarget implements AgentTarget {
  readonly id = 'hermes' as const;
  readonly displayName = 'Hermes Agent';
  readonly docsUrl = 'https://hermes-agent.nousresearch.com';
  
  supportsLocation(loc: Location): boolean {
    return loc === 'global';
  }
  // ...
}
```

## 关键设计

### 只支持 `global`

```typescript
supportsLocation(loc: Location): boolean {
  return loc === 'global';
}

install(loc: Location, _opts: InstallOptions): WriteResult {
  if (loc !== 'global') {
    return {
      files: [],
      notes: ['Hermes Agent uses $HERMES_HOME/config.yaml; re-run with --location=global.'],
    };
  }
  return {
    files: [writeHermesConfig()],
    notes: ['Start a new Hermes session for MCP changes to take effect.'],
  };
}
```

**为什么？** Hermes 没用 project-local config 的概念 — 单一 `~/.hermes/config.yaml`。

### 配置文件位置

```typescript
function hermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.hermes');
}

function configPath(): string {
  return path.join(hermesHome(), 'config.yaml');
}
```

**优先级**:
1. `$HERMES_HOME` env var
2. `~/.hermes/` (default)

### Detection

```typescript
detect(loc: Location): DetectionResult {
  if (loc !== 'global') {
    return { installed: false, alreadyConfigured: false };
  }
  const file = configPath();
  const content = readText(file);
  const installed = fs.existsSync(hermesHome()) || fs.existsSync(file);
  return {
    installed,
    alreadyConfigured: hasCodeGraphMcpServer(content),
    configPath: file,
  };
}
```

`hasCodeGraphMcpServer` 检查 `mcp_servers.codegraph` block 是否已存在。

### Install

```typescript
function writeHermesConfig(): WriteResult['files'][number] {
  const file = configPath();
  const existed = fs.existsSync(file);
  const before = readText(file);
  const afterMcp = upsertCodeGraphMcpServer(before);
  const after = upsertCodeGraphToolset(afterMcp);
  
  if (after === before) {
    return { path: file, action: 'unchanged' };
  }
  atomicWriteFileSync(file, ensureTrailingNewline(after));
  return { path: file, action: existed ? 'updated' : 'created' };
}
```

**两阶段**:
1. `upsertCodeGraphMcpServer` — 写入 `mcp_servers.codegraph` 块
2. `upsertCodeGraphToolset` — 写入 `platform_toolsets.cli` 加 `mcp-codegraph`

### Upsert Logic

**`upsertCodeGraphMcpServer`**:
- 检查 `mcp_servers:` block 存不存在
  - 不存在 → append
  - 存在但没 `codegraph:` → 加 entry
  - 存在且有 `codegraph:` → update in place

**`upsertCodeGraphToolset`**:
- 找 `platform_toolsets:` block
- 找 `cli:` sub-block
- 加 `- mcp-codegraph`（如果不在 list 里）

### Uninstall

```typescript
uninstall(loc: Location): WriteResult {
  if (loc !== 'global') return { files: [] };
  const file = configPath();
  if (!fs.existsSync(file)) {
    return { files: [{ path: file, action: 'not-found' }] };
  }

  const before = readText(file);
  const after = removeCodeGraphToolset(removeCodeGraphMcpServer(before));
  if (after === before) {
    return { files: [{ path: file, action: 'not-found' }] };
  }
  atomicWriteFileSync(file, ensureTrailingNewline(after));
  return { files: [{ path: file, action: 'removed' }] };
}
```

`removeCodeGraphMcpServer` 删除 `mcp_servers.codegraph` entry。
`removeCodeGraphToolset` 从 `platform_toolsets.cli` list 移除 `mcp-codegraph`。

### Print Config (for README)

```typescript
printConfig(loc: Location): string {
  if (loc !== 'global') {
    return '# Hermes Agent uses $HERMES_HOME/config.yaml; use --location=global.\n';
  }
  return [
    `# Add to ${configPath()}`,
    '',
    renderCodeGraphMcpBlock().join('\n'),
    '',
    'platform_toolsets:',
    '  cli:',
    '    - hermes-cli',
    '    - mcp-codegraph',
    '',
  ].join('\n');
}
```

生成**给 README 用的**配置示例。

## 写入的 config diff

```diff
# ~/.hermes/config.yaml
 mcp_servers:
+  codegraph:
+    command: codegraph
+    args: [serve, --mcp]
 
 platform_toolsets:
   cli:
     - hermes-cli
+    - mcp-codegraph
```

**Minimal** — 不动其他 sections（sibling toolset / model / mcp_servers 里的其他 server）。

## 安装流程

```bash
# 1. Detect Hermes
$ codegraph install --target hermes

# Output:
# ✓ Hermes Agent config updated: /home/hermes/.hermes/config.yaml
# 
# To complete setup:
#   1. Start a new Hermes session for MCP changes to take effect.
#   2. Verify with: hermes (or your Hermes client)
```

## 验收测试（推测）

```typescript
// __tests__/installer-targets.test.ts
describe('HermesTarget', () => {
  it('installs on global', async () => {
    const target = new HermesTarget();
    const result = target.install('global', { autoAllow: true });
    expect(result.files[0].path).toBe('/home/hermes/.hermes/config.yaml');
    expect(result.files[0].action).toBe('created');
  });
  
  it('rejects local', async () => {
    const target = new HermesTarget();
    const result = target.install('local', { autoAllow: true });
    expect(result.files).toHaveLength(0);
    expect(result.notes).toContain('Hermes Agent uses $HERMES_HOME/config.yaml; re-run with --location=global.');
  });
  
  it('is idempotent', async () => {
    const target = new HermesTarget();
    target.install('global', { autoAllow: true });
    const result2 = target.install('global', { autoAllow: true });
    expect(result2.files[0].action).toBe('unchanged');
  });
  
  it('uninstall reverses install', async () => {
    const target = new HermesTarget();
    target.install('global', { autoAllow: true });
    const uninstall = target.uninstall('global');
    expect(uninstall.files[0].action).toBe('removed');
  });
  
  it('preserves other mcp servers', async () => {
    // Pre-populate config with another mcp server
    // Install
    // Verify other server still there
  });
  
  it('preserves other platform toolsets', async () => {
    // Pre-populate with telegram toolset
    // Install
    // Verify telegram toolset still there
  });
});
```

## 与手动配置对比

**手动**（之前我做的）:
```bash
# Read current config
config = read ~/.hermes/config.yaml

# Check mcp_servers.codegraph
if not exists:
    add mcp_servers.codegraph

# Check platform_toolsets.cli
if 'mcp-codegraph' not in cli:
    add 'mcp-codegraph'

# Write back
write config
```

**codegraph install** 做的事完全一样，但：
- Idempotent（`unchanged` action）
- Atomic write
- Self-healing
- 8 个 targets 一次搞定
- Test 覆盖

**结论**：应该用 `codegraph install --target hermes` 而不是手动 patch。

## Open Questions

1. **profile 支持**：hermes-agent 有 multiple profiles (default/onepc/vedio)。HermesTarget 是不是只改 default？应该是 — 跟其他 profile 是独立的。但 boss 可能想给所有 profile 安装。
2. **install 8 个 platforms**：codegraph 一次只 install 一个 target。要给所有 8 个 install 用 `--target all`。
3. **update on upgrade**：CLAUDE.md 提到 self-healing，但具体行为待 explore。

## 设计亮点

- **YAML parsing without dependency** — 用正则手动 parse（避免引入 `js-yaml`）
- **Atomic write** — 临时文件 + rename（避免 partial writes）
- **Idempotent** — 二次 install 不会破坏
- **Self-healing** — 旧版块自动清理
- **Surgical** — 只改 codegraph 自己的 block，sibling config 完整保留
