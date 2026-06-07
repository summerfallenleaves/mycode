# AGENTS.md

## 项目指南

- **每次开始开发前，必须先完整阅读根目录下的 `开发记录.md`，了解当前进度和待办事项。注意开发过程中根据开发进度及时更新`开发记录.md`**
- 本仓库使用 pnpm workspaces monorepo 结构。
- 默认分支是 `main`。
- 始终在适用时使用并行工具。
- 优先自动化：除非因缺少信息或安全性/不可逆操作而受阻，否则直接执行请求的操作，无需确认。
- 使用 Biome 进行格式化和 lint，不要使用 ESLint 或 Prettier。
- 开发时使用 `tsx` 直接运行 TypeScript，构建时使用 `tsup` 打包。
- 构建产物输出到各包的 `dist/` 目录。

## Commits 和 PR 标题

使用 conventional commit 风格的消息和 PR 标题：`type(scope): summary`。

有效类型为 `feat`、`fix`、`docs`、`chore`、`refactor` 和 `test`。作用域是可选的；可在有帮助时使用受影响的包或领域，例如 `core`、`cli`、`web`、`shared` 或 `docs`。

示例：`feat(core): add MCP tool registry`、`fix(cli): handle terminal resize flicker`、`chore: bump Vercel AI SDK to v6.1`。

## 风格指南

### 通用原则

- 除非需要组合或复用，否则将内容保持在一个函数中。
- 不要提前提取一次性的辅助函数。在调用处内联逻辑，除非该辅助函数被复用、隐藏了真正复杂的边界、或有清晰的独立名称能改进调用方。
- 尽可能避免 `try`/`catch`，优先返回 Result 类型或使用 Effect 的 `Option`/`Either`。
- 避免使用 `any` 类型；使用 `unknown` 配合类型守卫或 Zod schema 进行窄化。
- 尽可能依赖类型推断；除非导出或清晰性需要，否则避免显式类型注解或接口。
- 优先使用函数式数组方法（`flatMap`、`filter`、`map`、`reduce`）而非 for 循环；在 `filter` 上使用类型守卫以保持下游的类型推断。
- Agent Event 类型使用 discriminated union（`{ type: 'event_name'; ... }`），用 `switch` 穷举处理。

通过内联来减少变量总数，当某个值只使用一次时。

```ts
// Good
const result = await generateText({ model, prompt, tools })

// Bad
const model = openai("gpt-5.2")
const tools = getTools()
const result = await generateText({ model, prompt, tools })
```

### 解构

避免不必要的解构。使用点号表示法以保留上下文。

```ts
// Good
event.type
event.turnId
event.delta

// Bad
const { type, turnId, delta } = event
```

### 变量

优先使用 `const` 而非 `let`。使用三元表达式或提前返回来替代重新赋值。

```ts
// Good
const name = condition ? "agent" : "tool"

// Bad
let name
if (condition) name = "agent"
else name = "tool"
```

### 控制流

避免 `else` 语句。优先使用提前返回。

```ts
// Good
function validateTool(tool: Tool) {
  if (!tool.name) return { ok: false, error: "missing name" }
  if (!tool.execute) return { ok: false, error: "missing execute" }
  return { ok: true, tool }
}

// Bad
function validateTool(tool: Tool) {
  if (tool.name) {
    if (tool.execute) {
      return { ok: true, tool }
    } else {
      return { ok: false, error: "missing execute" }
    }
  } else {
    return { ok: false, error: "missing name" }
  }
}
```

### 复杂逻辑

当一个函数有多个验证分支或辅助细节时，使主函数读起来像快乐路径，并将辅助细节移到其下方的小型辅助函数中。

```ts
// Good
export async function* runAgent(input: string) {
  const config = requireConfig()
  const tools = await loadTools(config)
  const result = executeLoop(input, tools)
  return result
}

function requireConfig() {
  ...
}

async function loadTools(config: Config) {
  ...
}
```

- 将辅助函数保持在其支持的代码附近，放在主导出下方（当这能提高可读性时）。
- 不要将简单表达式过度抽象为多个一次性辅助函数；仅在它命名了一个真实概念时才提取。
- 为非显而易见的约束和令人意外的行为添加注释，而非为显而易见的赋值或控制流。
- Agent Event 的 handler 使用 `switch` 穷举，不要使用 `if/else if` 链。

```ts
// Good
for await (const event of agent.run(input)) {
  switch (event.type) {
    case 'thinking_delta': renderThinking(event.delta); break
    case 'tool_start':     renderToolCall(event.toolName, event.args); break
    case 'tool_end':       renderToolResult(event.result); break
    case 'answer_delta':   renderAnswer(event.delta); break
    case 'error':          renderError(event); break
    // TypeScript 会检查是否穷举
  }
}
```

### Resource 与 Session 管理

- Session ID 使用 `crypto.randomUUID()` 生成。
- MCP 客户端连接使用 `AbortSignal` 控制生命周期，确保 in-flight 请求随会话取消而中止。
- 文件路径操作使用 `path.join()` 而非字符串拼接，使用 `path.resolve()` 获取绝对路径。
- 上下文使用率估算使用 `messages` 全部内容 + system prompt 按 2字符≈1 token 粗估，不引入 tokenizer 依赖。

### LLM Provider 抽象

- 通过 `packages/core/src/llm/adapter.ts` 封装 Vercel AI SDK，避免 core 中直接引用 `ai` 包。
- Provider 切换通过修改 adapter 中的 model import 行完成，不需要改动 agent 循环逻辑。

### AsyncGenerator 约定

- Agent Core 对外暴露 `AsyncGenerator<AgentEvent>`，永远不直接返回 Promise。
- 工具执行函数同样返回 `AsyncGenerator<ToolEvent, ToolResult, undefined>`，以支持流式进度报告。
- Generator 中产生的每一个事件都应有 `turnId` 字段用于追踪。
- 内置工具应当在 `execute` 中 `yield progress` 和 `yield data` 事件，使结果能通过 `tool_delta` 在 UI 实时显示。

### 事件缓冲

- `use-agent-stream.ts` 的 `run()` 方法对 Agent 事件进行 50ms 间隔缓冲，避免高频 `thinking_delta` 导致 Ink 每帧重绘产生的闪烁。
- 流结束后强制 flush 剩余事件。

### 技能命令处理

- 用户输入 `/skill-name 额外参数` 时，按第一个空格分割：`skillToken` 用于匹配技能名称，`skillArgs` 追加到 LLM 消息中。
- 自动补全也使用首 token 匹配，确保 `/skill-cr 文本` 仍能显示 `/skill-creator` 作为候选。

### MCP 工具约定

- MCP tool 的 `execute` 方法必须 `yield data` 事件将结果推送到 UI（与内置工具行为一致）。
- MCP 工具结果超过 200 字符时截断显示，完整结果通过 `tool_end.result` 返回给 LLM。

## 上下文占用

- Agent 提供 `getContextUsage()` 方法，从 `this.messages` + `resolvedSystemPrompt` 的内容长度估算 token 使用量。
- 估算方法：所有文本的字符数 ÷ 2（中英文混合粗估），不依赖 tokenizer 库。
- 展示格式：`{percentage}%/{used}`，`used < 1000` 时显示原始数值，否则显示 K 单位。
- 显示颜色：< 70% 绿色，70–90% 黄色，≥ 90% 红色。
- 上下文上限通过 `AgentConfig.maxContextTokens` 配置，默认 200_000，从 `mycode.jsonc` 的 `agent.maxContextTokens` 字段读取。

## 测试

- 尽可能避免 mock；使用真实的 LLM 调用（设置 `maxSteps: 1`、选择便宜模型）或录制回放。
- 测试实际实现，不要将逻辑重复到测试中。
- Core 包的测试不需要 UI 环境，纯 Node.js 可运行。
- 使用 `vitest` 作为测试运行器（兼容 Bun）。
- 从各包目录运行测试，不要从仓库根目录运行。
- 名称约定：`*.test.ts` 放在 `__tests__/` 目录中或与源文件同目录。

## 类型检查

- 在包目录（如 `packages/core`）运行 `pnpm typecheck`。
- 包级 `tsconfig.json` 使用 `project references` 引用根级 `tsconfig.base.json`。
- AgentEvent union type 必须有 `never` 穷举检查（TypeScript 5.7+ 的 `switch` 穷举特性）。

## 包开发命令

```bash
# 根目录
pnpm install                   # 安装所有包依赖
pnpm build                     # 构建所有包
pnpm typecheck                 # 对所有包执行类型检查

# 单个包
pnpm --filter @my-agent/core dev     # core 开发模式
pnpm --filter @my-agent/cli dev      # cli 开发模式
pnpm --filter @my-agent/web dev      # web 开发模式

# 测试
pnpm --filter @my-agent/core test    # 运行 core 测试

# 发布
pnpm publish -r --access public     # 发布所有公开包
```

## CLI 界面布局

终端界面采用**左右分栏**布局，整体分为 `工作区`（左）和 `侧边栏`（右）：

```
┌─────────────────────────────────┬──────────────┐
│                                 │              │
│          交互历史区              │              │
│  （消息记录 / 工具执行记录 /     │   侧边栏     │
│    面板 / 欢迎提示等）           │  （Todo列表） │
│                                 │              │
├─────────────────────────────────┤              │
│          消息输入区              │              │
│  > 用户输入（固定底部）          │              │
├─────────────────────────────────┤              │
│          状态栏                  │              │
│  上下文占用 / 运行状态 / 模型    │              │
└─────────────────────────────────┴──────────────┘
```

- **工作区**（左侧，占 ~80% 宽度，≥50 列）：垂直方向由上到下分为三层——`交互历史区`（消息交互记录、工具执行记录、各类面板）、`消息输入区`（用户输入框，固定在工作区底部）、`状态栏`（模型提供商、上下文占用百分比、运行状态）
- **侧边栏**（右侧，占 ~20% 宽度，≥20 列）：显示 Todo 列表，终端宽度 < 70 列时自动隐藏
- **分隔线**：工作区与侧边栏之间 1 列宽灰色竖线

布局计算由 `packages/cli/src/lib/terminal-layout.ts` 的 `calculateLayout()` 函数完成。

## 目录结构提醒

```
.mycode/            # 运行时配置目录（不打包）
  mycode.jsonc      # Agent 配置（LLM / MCP / 技能 / 安全）
  skills/           # 技能文件（运行时发现）
  sessions/         # 会话持久化（JSON 文件）
  memory/           # Project Memory 存储（phase1c+）
packages/
  core/     # Agent 核心逻辑（纯 TS，零 UI 依赖）
    src/
      memory/       # Memory 系统（manager/extractor/compressor/types）
      runtime/      # 运行时组件（session-store, memory-store）
  cli/      # Ink 终端界面
  web/      # Next.js Web 应用
  shared/   # 共享类型和工具函数
```

Core 包不应依赖 cli 或 web 中的任何内容。Shared 包可被 core、cli、web 三方引用。

## 运行时配置

- Agent 启动时从 `.mycode/mycode.jsonc` 读取配置。
- `mycode.jsonc` 使用 JSONC 格式（支持注释）。
- API Key 优先通过环境变量 `MYCODE_API_KEY` 读取，其次读配置文件。
- 技能采用 **SKILL.md 文档式**：目录中的每个子目录包含 `SKILL.md`（YAML frontmatter + Markdown 指令体），启动时自动扫描注册到 Agent。技能以 `## Available Skills` 块注入 system prompt，不由模型自主选择使用。
- 每个技能自动注册为 `/skill-name` CLI 命令，用户可通过该命令附带额外参数触发。
- MCP 服务器地址和参数在 `mycode.jsonc` 的 `mcpServers` 字段中配置。MCP 工具通过 `MCPClientManager` 连接到 ToolRegistry。
- 上下文窗口上限通过 `agent.maxContextTokens` 配置。
- 所有源码文件必须包含文件级 `@fileoverview` JSDoc 注释作为文件说明。

## Memory 系统操作约定

- **MYCODE.md**（人工规则）：放置于 `~/.mycode/MYCODE.md`（全局）和项目根 `./MYCODE.md`（项目级），合并为 `## Project Rules` 注入 system prompt。用于静态、长期不变的约定。
- **会话持久化**（动态回溯）：通过 `FileSessionStore` 自动保存到 `.mycode/sessions/<sessionId>/messages.json`。每次 run 结束后自动触发，无需手动干预。
- **Project Memory**（结构化记忆）：通过 `memoryTool`（search/add/list）或 CLI 命令（`/remember` `/forget`）操作。记忆存储于 `.mycode/memory/memory.json`（project 级）和 `~/.mycode/memory/memory.json`（global 级）。自动注入到 system prompt（前 4000 字符）。
- **注入顺序**（由前到后覆盖）：`systemPrompt` → `MYCODE.md` → `memory context` → `skillPrompt`
- **记忆类型**（5 种）：`convention`（规范）、`decision`（决策）、`fact`（事实）、`preference`（偏好）、`lesson`（经验教训）
- **内容过滤器**：Memory 写入时自动拒绝密钥格式（sk-、AKIA、ghp_ 等），避免敏感信息泄漏
- **Memory 文件版本化**：`MemoryFile` 包含 `version: 1` 字段，便于未来迁移

## 上下文压缩

- **自动压缩**：当 `getContextUsage()` 百分比超过 `contextCompressionThreshold`（默认 70%）时触发，保留最近 2 轮用户对话完整，对更早内容由 LLM 生成摘要（300 字以内，`assistant` 角色插入）。
- **冷却机制**：自动压缩后需间隔 `minCompressionInterval` 轮（默认 3）才能再次触发，避免频繁消耗 token。
- **工具结果裁剪**：压缩完成后自动执行 `pruneToolResults()`，将序列化长度超过 `maxToolResultLength`（默认 2000 字符）的工具结果截断，释放内存。
- **LLM 失败回退**：LLM 摘要返回空或抛异常时，自动回退到仅做工具结果裁剪，不静默失败。
- **手动压缩**：CLI 输入 `/compact` 可绕过冷却期手动触发完整压缩流程，结果在状态栏显示。
- **压缩事件**：`context_compressed` 事件携带 `before`/`after`（消息条数）、`beforeTokens`/`afterTokens`（估算 token）、`compressionType`（auto/manual）、`prunedToolResults` 字段。`before`/`after` 为必填保持向后兼容。


## GitHub提交规则

- 在commit中总结本次变更的主要内容，注意使用中文。