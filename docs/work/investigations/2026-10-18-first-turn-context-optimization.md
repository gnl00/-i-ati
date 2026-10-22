# 首轮上下文优化

## 范围与顺序

先压缩工具说明，保持工具能力和参数契约。后续再独立讨论技能目录摘要、
请求组成观测和工具按需加载。本次不修改技能正文、手动激活逻辑、工具暴露条件、
执行器、审批、历史或持久化；不修改 seecode 的源文件和安装副本。

背景数据见 [Ponte 执行对比](2026-10-15-ati-piagent-task-efficiency.md)。
该调查的 806 首轮为 29,958 个提供商输入 token，归档请求包含 51 个工具，
紧凑 JSON 工具定义为 67,918 个字符，技能目录与规则为 32,862 个字符。
这是历史请求，不作为当前源码的同条件基线。字符、token、费用和耗时分别记录。

## 第一批：工具说明压缩

直接编辑 `src/shared/tools/*/definitions.ts` 和共享 reason 字段的说明，
不增加运行时压缩、摘要模型、配置项或替代 schema。

规则：

- 工具级说明表达用途、选择边界和跨字段规则；字段说明表达该字段的语义。
- 删除重复动作清单、冗长示例和可由类型、枚举、必填项、默认值表达的重复文字。
- 保留条件必填、单位、默认行为、分页续读、版本保护、失败恢复、语言要求、
  路径边界、审批与部分成功语义；这些内容不能通过缩短说明丢失。
- `tool_call_reason` 继续必填，保留单句、用户语言、为何现在调用及预期可观察结果。
  使用自包含的短说明，使外部工具和独立子 agent 也获得同一要求。

不修改工具名称、顺序、参数名称、类型、枚举、必填数组、默认值、范围、
`additionalProperties`、组合约束或 action 分支。共享 action schema 的必要描述继续保留。

## 验收

1. 在修改前保存全部导出工具的快照。修改后递归比较，只有 JSON Schema
   的 `description` 值允许变化；工具数量、顺序和全部其他值必须完全相同。
2. 用当前源码的全部导出工具测量紧凑 JSON：
   `tools.map(tool => ({ ...tool.function, source: 'embedded' }))`。
   记录字符数、UTF-8 字节数、说明字符数和共享 reason 的占用；不将本地字符数称为提供商 token。
3. 复用工具定义、注册、条件过滤、专用定义和 prompt 测试，增加工具目录体量预算，
   检查共享 reason 要求、版本保护、审批、脚本解释器与平台变量等关键说明。
4. Lint 修改的 TypeScript，运行 Node/web typecheck 和相关文档路径检查。
5. 本次不自动调用付费模型。真实工具选择、首轮 token、缓存和端到端耗时需要固定任务复测；
   静态体量下降只证明请求说明减少。

## 后续独立范围

技能目录可以增加供发现使用的短摘要，保留完整描述的按需访问；避免机械截断。
工具按需加载需要单独评估增加的发现轮次和请求缓存变化。
动态上下文需依据组成观测处理相关性和重复项，保持现有上下文装配顺序。

## 第一批实施结果（2026-10-18）

已直接压缩 16 组工具定义和共享 reason 的说明，增加目录预算与关键使用边界的测试，
并将精简规则写入 [工具定义工作流](../../guides/development/tool-definition-workflow.md)。
未引入运行时转换或额外模型调用。

以下是同一工作区修改前后的全量源码目录，包含未配置/未暴露工具，
不是某个运行中会话实际暴露的工具集合。紧凑 JSON 字符数按 JavaScript `String.length`
统计，字节数按 UTF-8 统计。

| 指标 | 修改前 | 修改后 | 变化 |
| --- | ---: | ---: | ---: |
| 工具数 | 52 | 52 | 不变 |
| 工具目录 JSON 字符 | 68,552 | 54,557 | -13,995（20.42%） |
| UTF-8 字节 | 68,578 | 54,571 | -14,007（20.42%） |
| 全部 description 正文字符 | 38,872 | 24,883 | -35.99% |
| 共享 reason 描述字符，累计 52 次 | 8,632 | 4,316 | -50.00% |

递归对比修改前后的实际导出定义：221 处 description 字符串变化；
全部其他键、值、数组和对象顺序一致，包括名为 `description` 的业务参数自身的 schema。
该检查直接比较整棵对象，不以删除所有同名键的方式忽略业务参数。

主要压缩来自通用 reason、命令、文件操作、计划/日程、记忆和视觉说明。
条件必填与专用规则仍在字段或工具说明中。例如 read 的 1,500 行/32,000 字符上限、
write 的仅创建/版本保护、edit 的唯一非重叠匹配、脚本的 POSIX/Windows 变量写法、
独立日程 prompt、Telegram 部分送达后的禁止重复发送均保留。

目录预算设为 56,000 字符，保留约 1,443 字符余量。新增能力如需超出预算，
应同时审查说明体量并明确更新预算；不在运行时硬截断工具定义。

### 验证记录

执行命令：

```sh
pnpm exec vitest run src/shared/tools src/main/hosts/chat/preparation/request/__tests__/ToolListBuilder.test.ts src/shared/prompts/__tests__/index.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
pnpm run check:main-doc-paths
pnpm run check:renderer-doc-paths
pnpm exec eslint src/shared/tools/{command,computerUse,fileOperations,history,knowledgebase,memory,plan,schedule,skills,soul,subagent,telegram,todo,userInfo,vision,workContext}/definitions.ts src/shared/tools/definitions-utils.ts src/shared/tools/__tests__/definitions.test.ts
```

- 定向测试：15 个文件、75 项通过，覆盖完整定义、注册、条件过滤、专用定义和 prompt。
- Node/web 类型检查、两项文档路径检查通过。
- 标准 ESLint 有既有阻塞：`definitions-utils.ts` 中 5 处 `no-explicit-any` 错误，
  对 HEAD 原文通过同一路径的 `--stdin --stdin-filename` 检查可复现；本次未新增 `any`。
  现有文件风格同时触发 Prettier 格式警告，本次保留单引号/无分号的相邻写法，未整文件格式化。
  同一文件列表仅关闭 `prettier/prettier` 与 `@typescript-eslint/no-explicit-any` 后的定向 ESLint 通过；
  标准检查的既有错误仍保留，不将其记为标准 lint 通过。
- 未执行 Electron 交互或付费模型验收。工具选择质量、提供商 token、缓存率及实际耗时仍待固定任务复测。

历史 806 的 51 工具请求与当前 52 工具源码目录分别保留口径。
本批可确认的是静态说明体量下降，不能据此声称整个首轮输入或耗时下降 20.42%。

## 第二批：技能来源与生命周期收敛（2026-10-18）

第三方短摘要方案取消。采用 [ADR-0047](../../decisions/0047-source-folder-skills.md)：
启动和配置变更时扫描 added source folders，直接读取原始 description 和源文件；
保留 embedded 与手动激活语义。删除副本安装、URL/压缩包导入、缓存和恢复链路，
旧副本不再发现、不迁移、不自动删除。完整实现见 [Skills](../../integrations/skills.md)。

该批收益主要是删除文件同步/恢复生命周期和过时目录来源；若技能集合相同，
目录 description 体量也保持相同，不宣称首轮 token 随之下降。

### 第二批验证记录

- `pnpm test:coverage`：367 个测试文件通过、6 个跳过；2,928 项通过、30 项跳过。
  V8 全仓覆盖率为语句 71.86%、分支 64.56%、函数 66.22%、行 72.88%。
  结果对应当前工作区，包含此前已有的其他任务修改。
- `pnpm build`（包含 Node/web typecheck 与 Electron/Vite bundle）通过；最终再次
  `pnpm run typecheck` 验证当前源码。
- `pnpm run check:main-boundaries`、`pnpm run test:main-architecture`、
  `pnpm run check:main-doc-paths`、`pnpm run check:renderer-boundaries`、
  `pnpm run test:renderer-architecture`、`pnpm run check:renderer-doc-paths` 通过。
- 变更文件定向 ESLint 已执行。标准检查仍有 6 个文件中的 37 处既有错误；
  对各文件 HEAD 原文以相同文件路径 stdin 检查，错误规则与消息计数一致，未新增错误。
  Prettier 默认规则与仓库相邻风格的警告未通过整文件格式化扩大处理。
- `git diff --check` 和变更文档的 82 个本地链接检查通过。
- 使用隔离 userData 启动构建后的 Electron，未配置模型、未发送模型请求。
  原生文件选择器添加测试源，界面显示 3 个 embedded + 1 个源技能；
  同名遮蔽和非法 SKILL.md 分别显示来源提示。源描述修改后 Refresh 立即可见。
  暂时移走测试源后，配置仍保留、列表剩余 3 个 embedded；移回后移除配置，
  源文件保持存在，userData/skills 始终没有创建。Light/Dark 设置页截图已在本次会话捕获，
  检查窗口为 870×925 逻辑像素。验收实例随后关闭。
- 跨重启重新扫描由服务测试覆盖；独立子进程集成测试通过实际源目录注册和真实 shell
  执行验证相邻资源、workspace I/O、指定 cwd、超时与取消。Windows 原生命令执行与
  其他窗口尺寸未在本机验收。

保留原有工作区未提交改动，未做 Git commit/push；未更改任何第三方 skill 正文或 seecode 副本。

## 第三批：按技能选择上下文（2026-10-18）

Available Skills 的行操作区新增默认开启的 Switch。全局配置保存
`skills.disabledNames`；关闭后从系统目录、激活提示及 `/sk:` 候选中排除。
Main 的 load/read/run 同时检查状态，避免从其他技能入口重新注入正文。
设置页仍显示该技能，并允许 Reveal 或重新开启。源文件和每会话选择记录保留。
重新开启后可恢复原有选择提示；保存失败保留原状态。

配置变化不触发文件重扫。正文已经进入的历史消息和已准备的运行快照保持原样；
该偏好作用于后续新运行的上下文，以及保存后的新技能加载。

### 第三批验证记录

- 定向测试 `pnpm exec vitest run` 覆盖技能服务、工具、IPC、prompt、Settings 和
  `/sk:`：18 个文件、149 项通过。原生验收发现 Refresh 返回原始扫描结果、丢失
  `enabled` 显示状态后，修正为返回附带保存偏好的完整结果，相关 3 个文件、20 项复验通过。
- 最终 `pnpm test:coverage`：367 个文件通过、6 个跳过；2,933 项通过、30 项跳过。
  V8 覆盖率为语句 71.89%、分支 64.61%、函数 66.26%、行 72.91%。
- 最终 `pnpm build` 通过，包含 Node/web 类型检查和构建。Main/renderer 的
  `check:*-boundaries`、`test:*-architecture`、`check:*-doc-paths` 均通过。
- 变更文件定向标准 ESLint 已执行；仅 `src/types/index.d.ts` 有 9 处既有
  `no-explicit-any` 错误，与 HEAD 基线的规则及消息计数一致。本次未新增错误；
  保留相邻格式，未通过整文件格式化扩大改动。
- 构建后的 Electron 使用隔离 userData 验收：默认开启、关闭显示 Disabled、
  Refresh 后仍关闭、退出并重启后仍关闭、重新开启均通过。Light/Dark 的设置页截图
  已在会话捕获并检查，窗口为 870×925 逻辑像素。保存失败与并发保存由自动化测试覆盖。
  验收实例已关闭，未配置模型或发送请求；其他窗口尺寸与 Windows 未做原生验收。
- 本批不修改 skill 源文件；保留已有历史与会话选择。未做 Git commit/push。

### 操作区视觉修整

技能行右侧从 66×52px 纵向操作组改为 68×28px 横向居中组。
开关可见尺寸从约 40×22px 收为 32×18px，去掉 thumb 投影；Reveal 保留 14px 图标，
点击区域从 24×24px 增至 28×28px，与开关间隔 8px。键盘进入该行时 Reveal 同样可见。
只调整 SkillsManager 这一处使用位置，共享 Switch 和技能行为保持原样。

验证：`pnpm exec vitest run src/renderer/src/features/settings/__tests__/SkillsManager.test.tsx`
10 项通过；`pnpm run typecheck:web`、`pnpm exec electron-vite build`、
`pnpm exec eslint src/renderer/src/features/settings/skills/SkillsManager.tsx` 和
`git diff --check` 通过，lint 仅有既有格式警告。隔离 Electron 检查了 870×925 的
Light/Dark、开启/关闭与文件夹键盘焦点，以及 720×825 的 Light 紧凑窗口；截图已在会话捕获。
操作区尺寸和垂直中心在不同描述长度下保持一致。未运行模型请求。

### 单项保存时的开关闪动修复

原因是 `savingSkill !== null` 会锁定所有行的 Switch，共享组件的
`disabled:opacity-50` 使其他行也在保存开始/结束时由全亮变半透明再恢复。
保留全局保存锁和原生 disabled 语义，仅对其他行在该保存期间覆盖为 opacity 1；
正在保存的行仍显示禁用反馈。共享 Switch 与刷新期间的禁用样式保持原样。
设置页相同 `savingSkill` 条件的 Switch 使用位置只有这一处。

延迟保存的回归测试先复现失败，再验证其他行保持 checked 和正常透明度、并发点击
不会产生第二次保存、保存失败后状态恢复。上述 SkillsManager 测试 10 项通过，
web typecheck、Electron/Vite 构建、定向 ESLint（0 errors，既有格式 warnings）和
`git diff --check` 通过。隔离 Electron 的 Light/Dark 单项关闭与重新开启已检查并截图；
保存中的短暂状态由延迟 Promise 的自动化测试覆盖，未录制逐帧原生视频。

## 第四批：Awake 活动线索与结构精简（2026-10-18）

采用 [ADR-0048](../../decisions/0048-bounded-awake-activity-context.md)。近期活动上限改为
3 条，默认只有标题与日期等定位字段；真实任务主题或当前聊天命中的活动才附完整短句摘要，
上限 120 字符。上下文不足的问候跳过活动语义搜索；“继续”仍结合当前工作状态和压缩上下文。
日志读取跨日期最近记录，活动去重后保留相似度排序，过滤低于 0.6 的语义命中。
去掉重复 session_meta 和空 work_context，输出紧凑 JSON；长期记忆选取、正文和 emotion 保持原样。

回放 chat 825 的归档 `yo` 请求，通过生产 AwakeSnapshotService 和 AwakeContextProvider：

| 指标 | 修改前 | 修改后 | 变化 |
| --- | ---: | ---: | ---: |
| awake_state 字符（含标签） | 6,310 | 3,000 | -52.46% |
| cl100k_base 本地估算 token | 3,025 | 1,301 | -56.99% |
| 活动线索 | 5 | 3 | 无主题时仅标题线索 |
| 长期记忆 | 3 | 3 | 输出逐项一致 |

该回放使用归档样本作为源数据，通过当前生产投影代码执行；不代表新一次真实模型请求，
不推算提供商 token、缓存率或耗时收益。含个人内容的临时回放测试已移除，度量日志留在临时目录。

### 第四批验证记录

- `pnpm exec vitest run src/main/services/awake src/main/services/activityJournal src/main/hosts/chat/preparation/__tests__/ChatPreparationPipeline.test.ts src/main/agent/runtime/context/__tests__/ContextRequest.test.ts src/main/hosts/chat/preparation/request/__tests__/buildContextMessages.test.ts`：
  6 个文件、62 项通过，覆盖跨日期三条线索、弱主题、短句连续性、语义阈值与排序、
  英文/中文完整句、无摘要回退、来源失败和实际请求准备。跨日期查询使用真实 SQLite 验证。
- 最终 `pnpm test:coverage`：368 个文件通过、6 个跳过；2,940 项通过、30 项跳过。
  V8 覆盖率：语句 71.93%、分支 64.70%、函数 66.30%、行 72.94%。
- `pnpm run typecheck`、`pnpm run check:main-boundaries`、`pnpm run test:main-architecture`、
  `pnpm run check:main-doc-paths` 通过。
- 变更文件定向 ESLint 有既有阻塞：AwakeSnapshotService 4 处、ChatPreparationPipeline 测试
  48 处错误，按同文件路径 stdin 检查 HEAD 原文，规则和消息计数一致，未新增错误。
  格式警告保留，未整文件重排既有代码。
- 本批没有可见 UI 修改；未发送模型请求，未执行 Electron 原生交互验收或平台打包。
  历史记录与数据库 schema 保持原样，作用于后续新准备的请求。未做 Git commit/push。

## 阶段提交验收（2026-10-22）

从拟提交的 Git tree 导出隔离目录验证，复用现有依赖，未带入 CLI/评测文档、原型或本地临时文件。
pnpm 11 默认尝试在隔离目录安装依赖，因网络和非交互环境退出；验证命令改用
`pnpm_config_verify_deps_before_run=false npm_config_update_notifier=false`，只关闭运行前自动安装检查，
不修改项目配置或依赖，不跳过类型、构建和测试步骤。

- 隔离 `pnpm build` 通过，包含 Node/web 类型检查和 Electron/Vite bundles。
- Main/renderer 的 `check:*-boundaries`、`test:*-architecture` 和 `check:*-doc-paths` 共六项通过。
- 隔离 `pnpm test:coverage`：2,944 项通过、30 项跳过、1 项失败。
  失败为未修改的 EmbeddingService.test.ts 第 130 行写死本机仓库路径；原始 HEAD 的独立导出目录
  运行该文件同样复现，另 33 项通过。全量检查有此基线阻塞，不记为通过。
- 67 个变更 TypeScript 文件执行标准 ESLint：11 个文件共 174 处错误。
  对原始 HEAD 逐文件以同路径 stdin 验证，错误规则与消息计数一致，没有新增错误；格式警告保留。
- 暂存文档 191 个本地链接存在，新增内容未检出机器绝对路径或疑似凭据。
  暂存 whitespace 检查通过，ADR 中三处 Markdown 行尾空格改为显式换行。
- 本次仅本地 checkpoint，不推送或发布。长期记忆相关性文档仍为 Proposed，
  阈值过滤和跨聊天召回运行逻辑尚未实施。
