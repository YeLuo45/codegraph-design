import { defineConfig } from "vitepress";

export default defineConfig({
  title: "codegraph Design (YeLuo45 fork)",
  description:
    "YeLuo45 fork of colbymchenry/codegraph — 本地优先代码智能 MCP server，新增 Hermes/Antigravity/Gemini/Kiro 4 个 installer targets + daemon 模式 + 4 个非 tree-sitter extractors。",
  base: "/codegraph-design/",
  head: [
    ["link", { rel: "icon", href: "/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#0a0a0a" }],
  ],
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Architecture", link: "/architecture" },
      { text: "YeLuo45 Fork", link: "/fork" },
      { text: "Installer", link: "/installer" },
      { text: "MCP", link: "/mcp" },
      { text: "Daemons", link: "/daemons" },
      { text: "Targets", link: "/targets" },
      { text: "Deployment", link: "/deployment" },
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Home", link: "/" },
          { text: "Architecture", link: "/architecture" },
          { text: "YeLuo45 Fork", link: "/fork" },
        ],
      },
      {
        text: "Core",
        items: [
          { text: "Pipeline", link: "/pipeline" },
          { text: "Data Model", link: "/data-model" },
          { text: "Extraction", link: "/extraction" },
        ],
      },
      {
        text: "MCP",
        items: [
          { text: "MCP Server", link: "/mcp" },
          { text: "Tools (8)", link: "/tools" },
          { text: "Daemons", link: "/daemons" },
        ],
      },
      {
        text: "Installer",
        items: [
          { text: "Overview", link: "/installer" },
          { text: "All 8 Targets", link: "/targets" },
          { text: "Hermes Target", link: "/hermes-target" },
        ],
      },
      {
        text: "Build & Ship",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "Deployment", link: "/deployment" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/YeLuo45/codegraph" },
    ],
  },
  markdown: {
    theme: { light: "github-light", dark: "github-dark" },
  },
  lastUpdated: true,
});
