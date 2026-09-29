# 跨 host 工具审批验证记录

日期：2026-09-29。实现和契约见 [审批生命周期](../../architecture/command-confirmation-flow.md) 与 [ADR-0026](../../decisions/0026-main-owned-tool-confirmation-lifecycle.md)。

## 自动化检查

- `pnpm test:coverage --coverage.reportOnFailure true`：323 个测试文件通过，5 个跳过；2160 项通过，20 项跳过，1 项失败。已生成 V8 覆盖率报告，总体 statement 66.10%、branch 57.98%。
- 唯一失败为 `src/shared/tools/__tests__/definitions.test.ts` 的工具数量断言，预期 63，实际 49。通过 `git archive HEAD src/shared` 隔离导出并构建 HEAD 工具定义，同样得到 49；审批改动未修改工具定义。
- 最后补充的 IPC、Telegram 和工具行验证：`pnpm exec vitest run src/main/ipc/__tests__/chat.test.ts src/main/services/telegram/__tests__/TelegramGatewayService.test.ts src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallResult.test.tsx`，3 个文件、41 项通过。
- `pnpm run typecheck:web` 通过。`pnpm run typecheck:node` 剩余错误为未改动的 `src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352`：`engine` 可能为 undefined；该文件与 HEAD 相同。
- `pnpm exec electron-vite build` 通过。此命令完成生产 bundle，不包含类型检查或平台安装包验收。
- `pnpm run check:main-boundaries`、`pnpm run test:main-architecture`、`pnpm run check:main-doc-paths`、`pnpm run check:renderer-boundaries`、`pnpm run test:renderer-architecture`、`pnpm run check:renderer-doc-paths` 均通过。
- 任务范围 ESLint 检查仍有已有规则错误。对 42 个本次源文件逐一以相同配置比较 HEAD 和当前内容，error 从 109 降至 103，rule/message 数量比较未增加。没有对已有格式问题做整仓 autofix。
- `git diff --check` 通过。

## Electron 观察

使用独立 userData 的真实 Electron 窗口，加载本次真实 Renderer 组件、preload/IPC 与 Main 审批管理器。Telegram 决策由 Main 的 Telegram 提交入口注入，网络 adapter 不连接真实 bot。执行状态由 fixture 驱动，没有执行 shell 命令。

已检查：

1. Light/Dark 下 960 和 480 DIP 窗口：等待审批时保留卡片，远端批准后卡片立即关闭，工具行显示 approved。
2. 执行进入 running 后，执行展示接管审批展示。
3. 切离会话后回到原会话，pending 审批通过快照恢复。
4. Renderer reload 后 pending 审批恢复。
5. 远端拒绝关闭卡片并显示 denied；桌面 Execute 按钮通过真实 IPC 完成批准。
6. required/resolved 每轮各一次，共六轮；没有依靠执行结果事件关闭卡片。

截图和 fixture JSON 作为本次任务附件保存，避免在仓库中记录本机路径。

## 尚待真实集成验收

真实 Telegram 网络、实际 bot 消息编辑和完整聊天中的工具执行尚未在本次环境连接验证。自动化覆盖 send/edit 竞态、网络失败重试、gateway 暂停恢复、竞争 callback、过期按钮、peer/topic 拒绝；Electron fixture 覆盖真实 IPC 与显示，不能替代 Telegram 端到端验收。

实际验收使用 Telegram 发起、桌面同时打开的同一会话，从两端分别批准和拒绝，再验证超时、取消、重复点击及 bot 暂停恢复。Main 进程重启后旧授权失效，不恢复可执行审批。

## 桌面发起路由与投递历史补齐

同日补充：

- 新增 Main 审批观察订阅，按创建审批时冻结的 active Telegram 绑定投递，各 peer/topic 有独立的消息投影；取消、超时或任何一端批准/拒绝会更新全部投影。
- 新投递记录使用 telegram_delivery；既有无模型身份的 outbound 副本通过同一历史投影规则兼容，普通请求和压缩输入均排除投递副本。
- 对“排查 approve 工具是否存在”的真实数据库历史做只读复现：原先请求构建失败；本次投影修复后，完整历史构建成功，17 条模型消息。没有删除或改写原始记录。
- 针对 Main 目标解析、审批管理器、RunManager、Telegram gateway、发送工具、请求构建器和压缩服务，7 个测试文件、69 项通过。
- 再次完整覆盖率：324 个文件通过、5 个跳过；2169 项通过、20 项跳过；仍只有原有 63/49 工具数量断言失败。statement 66.13%、branch 58.04%。
- Node 类型检查仍只有原有 webToolsUnits.test.ts:352 错误；Web 类型检查、生产 bundle、Main/Renderer 架构与文档路径检查通过。
- ESLint 对 53 个任务源文件的同配置 HEAD 对比：137 个已有 error，当前 130 个；rule/message 数量未增加。

真实 Telegram 用户点击与桌面状态闭环仍需要在加载本次最终代码的应用中完成。投递路由不再要求从 Telegram 发起；桌面会话须有 active Telegram 绑定，且 gateway 配置允许目标。

最终补充同步 sink 即刻解决审批的回归用例；最终代码启动时观察到重复开发实例造成 Telegram polling 冲突；已关闭工具启动的重复验证实例，保留用户的开发实例。真实 TG 用户点击仍待手动验收。

22:03:02 运行日志再次确认 Telegram start.completed / polling.started，冲突后连接已恢复。
