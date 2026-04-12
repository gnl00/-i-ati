# Logging System

当前项目已经引入基于 `pino` 的日志基础设施，目标是把 main / renderer 的运行时日志统一落到本地文件，并逐步替换散落的 `console.*` 为结构化日志。

## 目录与文件

日志文件写入 Electron `userData` 目录下的 `logs/`：

```text
<userData>/logs/app-YYYY-MM-DD.log
<userData>/logs/perf-YYYY-MM-DD.log
```

例如：

```text
~/Library/Application Support/at-i-app/logs/app-2026-03-20.log
~/Library/Application Support/at-i-app/logs/perf-2026-03-20.log
```

设置页 `Tools -> Logs -> Open Logs` 可以直接打开这个目录。

其中：

- `app-YYYY-MM-DD.log`
  - 常规运行日志
  - 按天切分
- `perf.log`
- `perf-YYYY-MM-DD.log`
  - 启动性能日志
  - 主要记录 `[Startup]` 和 renderer startup mark
  - 用于排查 app 启动慢、首屏加载慢、renderer ready 延迟等问题

## 文件格式

- 当前日志按行写入
- 每条日志是结构化 JSON
- 主要字段包括：
  - `time`
  - `level`
  - `scope`
  - `process`
  - `msg`
  - `context`
  - `err`

推荐优先按 `scope + msg` 排查，再看 `context`。

## 轮转、压缩与清理

日志策略由 [LogFileManager.ts](/Users/gnl/Workspace/code/-i-ati/src/main/logging/LogFileManager.ts) 管理：

- 当天日志保持明文 `.log`
- 前一天及更早的 `.log` 会自动压缩成 `.log.gz`
- 超过保留期的旧日志会自动删除
- `perf-YYYY-MM-DD.log` 和普通日志一样按天切分，并参与压缩与清理

当前保留策略：

- 保留最近 7 天日志

清理时机：

- app 启动时
- 日期切换到新日志文件时

## 进程边界

### main

main 是唯一文件落盘者。

核心入口：

- [LogService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/logging/LogService.ts)
- [console-capture.ts](/Users/gnl/Workspace/code/-i-ati/src/main/logging/console-capture.ts)

行为：

- main 启动时初始化日志目录和当天日志文件
- capture 现有 `console.log / warn / error / debug`
- 新代码优先通过 `createLogger(scope)` 输出结构化日志
- 启动性能链通过 `createPerfLogger(scope)` 单独写入 `perf.log`

### renderer

renderer 不直接写文件。

核心入口：

- [rendererLogger.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/services/logging/rendererLogger.ts)
- [logging.ts](/Users/gnl/Workspace/code/-i-ati/src/main/ipc/logging.ts)

行为：

- renderer 侧 `console.*` 会被 capture
- 日志通过 IPC `log:write` 发送到 main
- 推荐在 renderer 代码里使用 `createRendererLogger(scope)`

## 已迁移模块

当前已经迁到结构化 logger 的高价值模块包括：

- `SchedulerService`
- request 主链
- `McpRuntimeService`
- `CommandProcessor`
- `FileOperationsProcessor`
- `MemoryService`
- `AgentStepLoop`
- `DatabaseService`
- `ipc/tools`
- `ChatSheetComponent`
- `appConfig`

其余未迁移的 `console.*` 仍然会通过 console capture 进入日志文件，但后续应逐步替换成结构化 logger。

### perf.log

当前已经进入 `perf.log` 的主要内容：

- main `StartupTracer`
- `src/main/index.ts` 中转发的 renderer startup marks
- 关键启动节点，例如：
  - `boot.start`
  - `app.ready`
  - `db.init.start/end`
  - `memory.init.start/end`
  - `ipc.init.start/end`
  - `window.create.start/end`
  - `window.did-finish-load`
  - `renderer.ready`

## 开发约定

新增日志时，优先使用：

### main

```ts
import { createLogger, createPerfLogger } from '@main/logging/LogService'

const logger = createLogger('MyService')
const perfLogger = createPerfLogger('Startup')

logger.info('task.started', { taskId, chatUuid })
logger.warn('task.skipped', { reason: 'chat_busy' })
logger.error('task.failed', error)
perfLogger.info('mark', { label: 'boot.start', offsetMs: 0 })
```

### renderer

```ts
import { createRendererLogger } from '@renderer/services/logging/rendererLogger'

const logger = createRendererLogger('MyComponent')

logger.info('panel.opened', { chatUuid })
logger.error('load_failed', error)
```

约定：

- `scope` 使用模块名或组件名
- `message` 使用稳定事件名，优先 `noun.verb` 或 `domain.event`
- 大对象放进 `context`
- 错误优先直接传 `Error`

## 脱敏与截断

日志清洗逻辑在：

- [redact.ts](/Users/gnl/Workspace/code/-i-ati/src/main/logging/redact.ts)

默认会处理：

- `authorization`
- `apiKey`
- `api_key`
- `token`
- `cookie`
- `set-cookie`

同时会对超长字符串、超长数组和过深对象做截断，避免：

- 把整段 stream chunk 原样写满日志
- 把大请求体或响应体全部塞进日志文件

## 测试

当前 logging 基础设施测试：

- [redact.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/logging/__tests__/redact.test.ts)
- [LogFileManager.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/logging/__tests__/LogFileManager.test.ts)

覆盖：

- 脱敏
- 截断
- 错误序列化
- 压缩清理

## 后续建议

- 继续迁移剩余高噪音模块到结构化 logger
- 视需要补 dev-only pretty console transport
- 如果后面需要远程诊断，再考虑导出日志或 zip 打包能力
