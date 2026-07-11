# Skills 实现方式对比

本文对比本仓库当前 Skills 实现与 `/Users/gnl/Workspace/code/claude-code-analysis/src/skills` 中 Claude Code Skills 实现。

## 核心结论

本仓库采用“安装到应用目录 + Available Skills 常驻提示 + `load_skill` 激活 + hidden context 注入全文”的实现。它适合桌面应用里的长期配置、可视化管理、低 prompt 载荷的技能发现，以及压缩后的技能上下文重建。

Claude Code 采用“Skill 即 Prompt Command + SkillTool 按需调用”的实现。它适合命令驱动的编码代理，能把技能内容延迟到调用时展开，并把参数、权限、模型、hooks、子代理执行整合进同一套 command 机制。

两者的关键差异在于运行时边界：本仓库把 Skill 作为内置工具驱动的按需上下文管理；Claude Code 把 Skill 作为 command runtime 管理。

## 架构对比

| 维度 | 本仓库实现 | Claude Code 实现 |
|---|---|---|
| 核心抽象 | `SkillMetadata` + `chat_skills` 激活状态 + hidden skill context | `Command`，且 `type: 'prompt'` |
| 代码入口 | [SkillService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/skills/SkillService.ts:1)、[SkillToolsProcessor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/skills/SkillToolsProcessor.ts:1)、[SkillsManager.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/features/settings/skills/SkillsManager.tsx:1) | `/Users/gnl/Workspace/code/claude-code-analysis/src/skills/loadSkillsDir.ts`、`bundledSkills.ts`、`mcpSkillBuilders.ts`、`tools/SkillTool/SkillTool.ts` |
| 存储方式 | 复制到 Electron `userData/skills/<skill-name>` | 从 managed/user/project/additional 目录读取；bundled skill 可懒提取引用文件 |
| 激活方式 | `load_skill` 校验已安装 skill，写入当前 chat 的 `chat_skills`，并返回轻量状态；runtime 注入 hidden context | 模型通过 `SkillTool` 调用具体 skill |
| Prompt 载荷 | 每次请求只注入已安装技能列表；已激活全文通过隐藏 user message 注入请求消息 | 常驻 prompt 只放预算内技能索引，全文在调用时展开 |
| UI 管理 | Settings 面板管理 watched folders、安装列表、删除、重扫 | CLI command/SkillTool 体系，技能更像命令资源 |
| 冲突处理 | 导入文件夹时按名称冲突重命名 | command 顺序、realpath 去重、动态发现优先级 |
| 权限模型 | skill 工具本身有 risk metadata；`allowed-tools` 作为提示信息注入 | `allowedTools` 会在调用时修改 command 权限上下文 |
| 参数能力 | `load_skill` 当前只接收 skill name | frontmatter 参数解析，调用时替换参数 |
| 执行模式 | 主聊天 run 内通过 tool result 提供指导文本 | inline 展开或 fork 子代理执行 |
| 动态发现 | Settings 文件夹和启动重扫 | 项目层级发现、nested `.claude/skills` 动态发现、path 条件激活 |
| 扩展来源 | 本地路径、URL、archive、Settings 文件夹 | 文件系统 skills、legacy commands、bundled、plugin、MCP、远程搜索实验能力 |

## 本仓库实现流程

本仓库的实现主线是安装、发现、按需加载。

```text
安装/导入
  -> SkillService.loadSkill() 或 importSkillsFromFolder()
  -> 解析 SKILL.md frontmatter
  -> 校验 name/description/compatibility
  -> 复制到 userData/skills/<skill-name>
  -> 写入 .skill-source.json
  -> 刷新 metadata cache
```

```text
按需加载
  -> model 调用 load_skill
  -> processLoadSkill()
  -> 校验 userData/skills/<name>/SKILL.md
  -> DatabaseService.addSkill(chat.id, name)
  -> 返回 { success, name, loaded, contextInjected }
  -> chat_skills 记录 load_order 和 loaded_at，用于已加载状态追踪
```

```text
请求注入
  -> SkillsPromptProvider.build(_chatId)
  -> SkillService.listSkills()
  -> buildSkillsPrompt()
  -> buildSkillsSystemPrompt()
  -> 拼入 provider request system prompt，只包含 Available Skills
  -> LoadedSkillsContextProvider 读取 chat_skills
  -> 将已激活 SKILL.md 组装成 source=skills_context 的隐藏 user message
  -> RequestMessageBuilder 插入到 latest user message 之前
```

这种方式的优点是状态和载荷边界清晰：skill 被安装到应用目录，系统提示只暴露可用技能索引，具体技能正文通过可重建的隐藏上下文进入模型请求。Settings UI 能围绕文件夹扫描、安装列表和删除形成稳定体验。

主要工程关注点是 `chat_skills` 的持久语义和隐藏上下文生命周期。当前 `processLoadSkill()` 会在写入前检查同名 skill，避免通过工具重复插入；底层表结构仍可以通过唯一约束或 upsert 进一步收敛。

## Claude Code 实现流程

Claude Code 的实现主线是发现、注册为 command、按需调用。

```text
发现
  -> getSkillDirCommands(cwd)
  -> 并行读取 managed/user/project/additional/legacy commands
  -> loadSkillsFromSkillsDir()
  -> parseFrontmatter()
  -> parseSkillFrontmatterFields()
  -> createSkillCommand()
  -> 返回 Command[]
```

```text
调用
  -> model 调用 SkillTool({ skill, args })
  -> 校验 command 存在且为 prompt command
  -> 检查 SkillTool 权限
  -> context: fork 时进入子代理
  -> inline 时 processPromptSlashCommand()
  -> getPromptForCommand(args, context)
  -> 展开 skill prompt 并应用 allowedTools/model/effort
```

```text
动态能力
  -> discoverSkillDirsForPaths(filePaths, cwd)
  -> 发现 nested .claude/skills
  -> addSkillDirectories()
  -> activateConditionalSkillsForPaths()
  -> 根据 paths frontmatter 激活条件 skill
```

这种方式把 skill 深度并入 command 系统。Skill 可以声明参数、模型、effort、hooks、执行上下文和 path 条件，调用时再展开正文，常驻 prompt 成本更低。

主要工程代价是复杂度集中在 discovery、permission、command registry、dynamic cache 和 invocation context 上。它要求 command 系统本身足够成熟。

## 设计取舍

### 状态模型

本仓库把状态落在应用数据层和请求构建层：安装目录表示可用技能，`chat_skills` 表记录当前聊天曾加载的技能，隐藏 user context 承载本轮真正可执行的技能正文。这使用户可以在桌面设置里管理长期技能集合，同时控制每次请求的 prompt 载荷。

Claude Code 把状态落在 command registry 和运行时上下文：技能是可发现、可过滤、可调用的 prompt command。这使技能能自然参与 slash command、SkillTool、权限和子代理流程。

### Prompt 成本

本仓库在每次请求中注入所有 installed skills 的 available 列表。技能全文只在模型调用 `load_skill` 后进入 `chat_skills` 激活集合，再由 hidden context message 注入当前请求。系统提示词规模主要随安装技能数量增长，请求消息规模随当前 chat 已激活技能数量增长。

Claude Code 只把技能索引放入 SkillTool prompt，并按上下文窗口做字符预算。技能全文在调用时进入消息流，适合拥有大量技能的项目。

### 权限与工具约束

本仓库记录 `allowed-tools` 并展示到 prompt 和 UI。它当前更偏向“让模型知道 skill 建议使用哪些工具”。

Claude Code 在调用 skill 时把 `allowedTools` 合并到 permission context。它更偏向“skill 运行期可以改变工具允许规则”。

### 扩展性

本仓库的扩展点主要围绕安装源和 Settings UI：URL、archive、本地文件夹、启动重扫。

Claude Code 的扩展点围绕 command：bundled、plugin、MCP、legacy commands、path 条件技能、fork 子代理、hooks、model override。

## 适用场景

本仓库实现更适合：

- 桌面应用内的可视化技能管理
- 用户长期维护一组全局技能文件夹
- 模型按需显式加载技能全文
- 技能内容稳定、数量可逐步增长
- 实现路径偏产品化和可理解性

Claude Code 实现更适合：

- 编码代理中的项目级技能发现
- 大量技能按需调用
- skill 需要参数、权限、hooks、模型或子代理执行
- 项目目录内技能随文件操作动态出现
- command 系统已经承担主要交互入口

## 可借鉴改进

本仓库可以优先吸收这些设计：

1. 给 `chat_skills(chat_id, skill_name)` 加唯一约束或在 `addSkill()` 中做 upsert，强化已加载状态的一致性。
2. 将 available skills 列表做预算裁剪，优先保留名称、description 和 allowed-tools。
3. 将 hidden skills context 纳入请求 token 预算和截断策略。
4. 让 `allowed-tools` 参与实际工具权限上下文。
5. 支持 `arguments`、`argument-hint`、`when_to_use` 等 frontmatter，提升模型选择和调用质量。
6. 增加 `paths` frontmatter，让技能在工作区文件匹配时自动进入可用候选。
7. 增加更明确的 `invoke_skill` 或 skill invocation 层，把“读取技能说明”和“按技能执行任务”拆成两个能力。
8. 在 invocation 模型成熟后，再引入 `model`、`effort`、`context: fork` 和 skill-scoped hooks。

推荐演进顺序：

```text
状态一致性
  -> 预算化 available skills
  -> hidden skills context 预算化
  -> allowed-tools 权限联动
  -> arguments/when_to_use
  -> paths 条件激活
  -> invoke_skill / skill invocation
  -> fork/model/hooks 高级能力
```

## 结论

本仓库的实现是产品管理型 Skills：安装稳定、可发现列表常驻、全文按需激活、hidden context 可重建、UI 可管理。Claude Code 的实现是 command runtime 型 Skills：发现灵活、调用按需、执行上下文更强。短期改进应围绕状态一致性、available 列表预算、hidden context 预算和权限联动；长期可以逐步向完整 skill invocation 演进。
