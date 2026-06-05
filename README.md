# mycode

> 从零开始构建自己的 AI Agent 智能体

基于 TypeScript monorepo 的 AI Agent 框架，提供可复用的 Agent Core 和双前端（CLI + Web）。

## 架构

```
mycode/
├── .mycode/                  # 运行时配置（不打包）
│   ├── mycode.jsonc          # LLM Provider / MCP / Agent 配置
│   └── skills/               # 技能文件（运行时发现）
├── packages/
│   ├── core/                 # Agent 核心逻辑（纯 TS，零 UI 依赖）
│   │   ├── src/
│   │   │   ├── agent.ts      # Agent 主循环, AsyncGenerator<AgentEvent>
│   │   │   ├── event.ts      # AgentEvent discriminated union (15+ 类型)
│   │   │   ├── config.ts     # JSONC 配置文件读取器
│   │   │   ├── llm/          # LLM Provider 适配层 (Vercel AI SDK v6)
│   │   │   │   └── adapter.ts # Provider 抽象（OpenAI/Anthropic 格式）
│   │   │   ├── tools/        # 工具注册 + 内置工具 + MCP 代理
│   │   │   ├── skill/        # 技能扫描与注入
│   │   │   ├── session/      # 会话管理
│   │   │   └── safety/       # 超时/限流/沙箱
│   ├── cli/                  # Ink TUI 终端界面
│   ├── web/                  # Next.js Web 应用 (SSE)
│   └── shared/               # 共享类型和工具函数
```

### 核心设计

- **面向技能事件流**: 技能以 `SKILL.md` 文档形式放入 `.mycode/skills/`，启动时自动扫描注册到 Agent — 作为 system prompt 注入而非模型自主选择
- **异步事件流**: `AsyncGenerator<AgentEvent>` 是 Core 与前端的唯一通信通道
- **事件类型**: 15+ 种 discriminated union 事件（`session_start`、`thinking_delta`、`tool_start`、`tool_delta`、`error` 等）
- **双前端**: Ink (React for terminal) + Next.js，共享同一套 Agent 事件驱动渲染
- **Provider 抽象**: 通过 `packages/core/src/llm/adapter.ts` 封装 Vercel AI SDK，支持 OpenAI 格式和 Anthropic 格式
- **JSONC 配置**: 运行时从 `.mycode/mycode.jsonc` 读取 LLM、MCP、技能、Safety 等配置
- **上下文监测**: StatusBar 实时显示上下文使用率（字符/2 粗估），颜色按使用率渐变
- **会话持久化**: 第一条消息自动分配 sessionId，`.mycode/sessions/` 目录 JSON 文件存储，`mycode -c <sessionId>` 恢复历史会话，`/exit` 显示恢复提示

## 快速开始

### 前置要求

- **Node.js** >= 26
- **pnpm** >= 10.10.0

### 安装

```bash
# 项目根目录
pnpm install
```

### 配置 API Key

编辑 `.mycode/mycode.jsonc`，确保 `llm.providers.<provider>.apiKey` 为有效的 API Key。

API Key 读取优先级：
1. 环境变量 `MYCODE_API_KEY`
2. 配置文件中的 `apiKey` 字段

### 启动 CLI（TUI 模式）

#### 开发模式（tsx 直接运行）

```bash
cd /path/to/mycode
pnpm --filter @my-agent/cli start
```

#### 构建并全局安装

```bash
# 一键构建 + 注册全局命令
bash scripts/install-cli.sh

# 之后可直接运行
mycode
```

启动后出现终端交互界面：
- 直接输入问题按 **Enter** 发送给 Agent
- **Esc** 重置会话
- 支持流式文字渲染和工具调用展示
- 底部状态栏显示上下文占用百分比（如 `15%/30K`），颜色随使用率变化（绿→黄→红）
- `/` 输入命令名称可快速触发命令（按字母序排列，支持连续输入筛选）：
  - `/connect` — 新增 Provider 连接
  - `/exit` — 退出
  - `/mcps` — MCP 服务器状态
  - `/models` — 切换模型
  - `/new` — 开始新对话
  - `/skills` — 查看可用技能
- `/skill-name 额外参数` 会触发指定技能并传入参数

### 启动 Web 界面

```bash
pnpm --filter @my-agent/web dev
# 访问 http://localhost:3000
```

## 开发命令

```bash
# 类型检查（所有包）
pnpm typecheck

# 构建所有包
pnpm build

# 单包开发模式
pnpm --filter @my-agent/core dev     # core 监听构建
pnpm --filter @my-agent/cli start    # CLI 直接运行
pnpm --filter @my-agent/web dev      # Next.js 开发服务器

# 测试
pnpm --filter @my-agent/core test
```

## 配置文件

`.mycode/mycode.jsonc` 使用 JSONC 格式（支持注释），主要字段：

| 字段 | 说明 |
|---|---|
| `llm.defaultProvider` | 当前默认 LLM Provider 名称 |
| `llm.providers` | Provider 列表（支持 openai/anthropic 格式） |
| `mcpServers` | MCP 服务器配置（支持 stdio/http 类型） |
| `agent.systemPrompt` | Agent 系统提示词 |
| `agent.maxContextTokens` | 上下文窗口上限（默认 200000） |
| `agent.maxSteps` | Agent 最大推理步骤数 |
| `agent.sessionTimeoutMs` | 会话超时时间 |
| `skills` | 技能目录开关和路径 |
| `safety` | 工具超时、限流、命令白名单 |

### 配置示例

```jsonc
{
  "llm": {
    "defaultProvider": "deepseek-openai",
    "providers": {
      "deepseek-openai": {
        "format": "openai",
        "baseUrl": "https://api.deepseek.com",
        "apiKey": "sk-xxx",
        "model": "deepseek-v4-flash"
      }
    }
  },
  "mcpServers": {
    "web-search-prime": {
      "type": "http",
      "url": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer xxx"
      }
    }
  }
}
```

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Node.js 26+, pnpm 10.10.0 |
| 语言 | TypeScript 5.9 |
| LLM SDK | Vercel AI SDK v6 (`@ai-sdk/openai`, `@ai-sdk/anthropic`) |
| CLI 前端 | Ink 7 (React for terminal) |
| Web 前端 | Next.js 15, React 19 |
| 构建 | tsup, Next.js |
| Lint/Format | Biome |
| 测试 | vitest |

## 项目状态

✅ 项目骨架搭建完成，CLI / Web 均可启动  
✅ 配置文件读取器（JSONC 解析、环境变量覆盖、多 Provider）  
✅ 全项目类型检查通过，构建成功  
✅ 所有源码文件添加文件级 JSDoc 注释  
✅ 内置工具（read_file、edit、write、bash、grep、glob、question）已实现实际执行  
✅ MCP 工具代理与结果流式输出（yield data → UI tool_delta 实时显示）  
✅ 技能系统：SKILL.md 文档式扫描注册、`/skill-name` 命令触发（支持附带参数）  
✅ 上下文占用实时检测（StatusBar 显示百分比/数值，颜色渐变）  
✅ 界面防闪烁（50ms 事件缓冲 flush）  
✅ 问答正确分组（user_message 分隔）+ 左右布局（用户右对齐，AI 左对齐）  
✅ Q&A 模式 — 多项配置/操作通过交互式选择完成  
✅ Session 持久化 — FileSessionStore（JSON 文件存储）、`/resume` 列出恢复历史会话、`mycode -c <sessionId>` 命令行恢复、`/exit` 显示恢复提示  
❌ 速率限制与上下文压缩待集成  
❌ 测试覆盖率待补充

详见 [开发记录.md](./开发记录.md) 了解详细进度。
