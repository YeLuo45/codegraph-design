---
layout: home

hero:
  name: "codegraph"
  text: "Local-First Code Intelligence"
  tagline: "YeLuo45 fork of colbymchenry/codegraph — 把任何代码库变成可搜索的代码图，暴露给 8 个 AI agent。新增 Hermes / Antigravity / Gemini / Kiro 4 个 installer targets + daemon 模式。"
  actions:
    - theme: brand
      text: Architecture
      link: /architecture
    - theme: alt
      text: GitHub
      link: https://github.com/YeLuo45/codegraph

features:
  - icon: 🧠
    title: 8 MCP Tools
    details: search / callers / callees / impact / node / explore / status / files — 让 agent 零 Read/Grep 答代码问题
  - icon: 🪝
    title: 8 Installer Targets
    details: claude / cursor / codex / opencode / **hermes** / **gemini** / **antigravity** / **kiro** — `codegraph install` 一键配置
  - icon: 🕸️
    title: Knowledge Graph
    details: 23 NodeKind × 12 EdgeKind — file / class / function / method / calls / imports / extends / implements / etc.
  - icon: ⚡
    title: 35% cost · 57% tokens · 46% tools saved
    details: 与无 codegraph 的 baseline 相比（README 7 repo A/B 中位数）
  - icon: 🌐
    title: 23+ Languages
    details: tree-sitter WASM — TS/JS/Py/Go/Rust/Java/C++/C#/Ruby/PHP/Swift/Kotlin/Scala/...
  - icon: 🔌
    title: Daemon Mode
    details: YeLuo45 fork 新增 — daemon / proxy / session / ppid-watchdog，跨项目共享 codegraph 实例
---

## 项目定位

> **"Local-first code intelligence for AI agents"**

codegraph 让 AI 代理回答**结构/调用流**类问题（"X 怎么调到 Y"、trace、impact、callers），用少量 **fast** codegraph 调用 + **零** Read/Grep。

## 关键数据（v0.9.9）

| 指标 | 数值 |
|------|------|
| 成本节省 | 35% |
| Token 节省 | 57% |
| 工具调用减少 | 46% |
| 仓库文件 | 290 |
| Codegraph nodes | 3,420 |
| Codegraph edges | 9,753 |
| MCP tools | 8 |
| Installer targets | 8 (vs upstream 4) |
| Languages | 23+ tree-sitter + 4 非 tree-sitter (svelte/vue/liquid/dfm) |

## YeLuo45 Fork 关键差异

相比上游 colbymchenry/codegraph：

1. **4 个新 installer targets** — antigravity / **hermes** / gemini / kiro
2. **完整 daemon 模式** — daemon.ts (53 symbols) / proxy.ts / session.ts / ppid-watchdog.ts
3. **更详细的 CLAUDE.md** — 30K 字符（vs 上游较小）
4. **更多 framework extractors** — mybatis + razor（推测）

## 与 codegraph-design 站

本站基于 codegraph indexed **3,420 nodes / 9,753 edges** 真实代码探索。
