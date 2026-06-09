# mycode

> 从零开始构建自己的 AI Agent 智能体

基于 TypeScript monorepo 的 AI Agent 框架，使用 LangChain.js 编排 Agent 循环，提供可复用的 Agent Core 和双前端（CLI + Web）。

## 架构

```
mycode/
├── .mycode/                  # 运行时配置（不打包）
│   ├── mycode.jsonc          # LLM Provider / MCP / Agent 配置
│   ├── skills/               # 技能文件（运行时发现）
│   └── sessions/             # 会话持久化（SessionFile v2）
├── packages/
│   ├── core/                 # Agent 核心逻辑（纯 TS，零 UI 依赖）
│   │   ├── src/
│   │   │   ├── agent.ts      # Agent 类, AsyncGenerator<AgentEvent>
│   │   │   ├── event.ts      # AgentEvent discriminated union (15+ 类型)
│   │   │   ├── config.ts     # JSONC 配置文件读取器
│   │   │   ├── llm/
│   │   │   │   └── adapter.ts # ChatModel 工厂（OpenAI/Anthropic/DeepSeek）
│   │   │   ├── tools/        # 工具注册 + 内置工具 + MCP 代理
│   │   │   ├── memory/       # Memory 系统（三层架构）
│   │   │   ├── session/      # 会话持久化（SessionFile v2 Turn 格式）
│   │   │   ├── skill/        # SKILL.md 文档式技能
│   │   │   └── safety/       # 超时/限流/沙箱
│   ├── cli/                  # @unblessed/node TUI 终端界面
│   ├── web/                  # Next.js Web 应用 (SSE)
│   └── shared/               # 共享类型和工具函数
```

### 核心设计

- **LangChain.js Agent 编排**: 使用 `createReactAgent`（基于 LangGraph）管理 ReAct 循环，`streamEvents` v2 驱动流式输出
- **异步事件流**: `AsyncGenerator<AgentEvent>` 是 Core 与前端的唯一通信通道，CLI/Web 无需修改
- **事件类型**: 15+ 种 discriminated union 事件（`session_start`、`thinking_delta`、`tool_start`、`tool_delta`、`error` 等）
- **工具事件桥接**: mycode 工具的 `AsyncGenerator<ToolEvent>` 通过 `toLangChainTools()` 包装为 LangChain `tool()` 格式，保留 progress/data 流式事件
- **双前端**: @unblessed/node（命令式 TUI）+ Next.js（React SSR），共享 Agent 事件驱动渲染
- **Provider 抽象**: `createChatModel()` 工厂函数，原生支持 OpenAI / Anthropic / DeepSeek 三种格式
- **JSONC 配置**: 运行时从 `.mycode/mycode.jsonc` 读取 LLM、MCP、技能、Safety 等配置
- **会话持久化**: SessionFile v2（Turn 分组格式，支持 user/thinking/tool_call/tool_result/answer 五种消息类型）
- **上下文管理**: 内建上下文压缩（LLM 摘要 + 工具结果裁剪）、Checkpointing（MemorySaver + thread_id）
- **上下文监测**: StatusBar 实时显示上下文使用率（字符/2 粗估），颜色按使用率渐变

## 快速开始

### 前置要求

- **Node.js** >= 26
- **pnpm** >= 10.10.0

### 安装

```bash
pnpm install
```

### 配置 API Key

编辑 `.mycode/mycode.jsonc`，支持三种 Provider 格式：

```jsonc
{
  "llm": {
    "defaultProvider": "deepseek-openai",
    "providers": {
      "deepseek-openai": { "format": "openai", "baseUrl": "https://api.deepseek.com", "model": "deepseek-v4-flash" },
      "deepseek-native": { "format": "deepseek", "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat" },
      "deepseek-anthropic": { "format": "anthropic", "baseUrl": "https://api.deepseek.com/anthropic", "model": "deepseek-v4-pro" }
    }
  }
}
```

### 启动 CLI（TUI 模式）

```bash
bash scripts/install-cli.sh
mycode
```

### 启动 Web 界面

```bash
pnpm --filter @my-agent/web dev
```

## 开发命令

```bash
pnpm typecheck                    # 类型检查
pnpm build                        # 构建所有包
pnpm --filter @my-agent/core dev  # core 监听构建
pnpm --filter @my-agent/cli start # CLI 直接运行
pnpm --filter @my-agent/core test # 测试
```

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js 26+, pnpm 10.10.0 |
| 语言 | TypeScript 5.9 |
| LLM 框架 | LangChain.js 1.4.x + LangGraph 1.3.x |
| Provider | `@langchain/openai` / `@langchain/anthropic` / `@langchain/deepseek` |
| CLI 前端 | @unblessed/node（blessed 风格命令式 TUI） |
| Web 前端 | Next.js 15, React 19 |
| 构建 | tsup, Next.js |
| Lint/Format | Biome |
| 测试 | vitest |

## 项目状态

✅ LangChain.js 迁移完成（Vercel AI SDK → createReactAgent + streamEvents v2）  
✅ 全项目 typecheck + build 通过  
✅ 会话持久化升级为 SessionFile v2（Turn 分组格式）  
✅ 内置工具（9 个）全部测试通过  
✅ 上下文压缩 / Checkpointing / Memory 系统完整  
✅ CLI / Web 均可启动  

详见 [开发记录.md](./开发记录.md) 和 [测试记录.md](./测试记录.md)。
