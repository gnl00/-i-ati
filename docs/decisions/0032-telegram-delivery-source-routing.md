# ADR 0032: Telegram 推送归属与入站绑定分离

状态：已采纳

## 背景

`telegram_send_message` 曾用收件人的 Telegram 入站绑定同时选择发送目标和本地
记录归属。一个普通 chat 向已有 Telegram 私聊发送提醒时，正文副本因此进入该
私聊绑定的另一个 chat。直接新增或切换入站绑定会使随后收到的普通消息改变归属。

## 决策

- `chat_host_bindings` 继续拥有普通 Telegram 入站消息的会话路由。
- `chat_telegram_targets` 按来源 chat 保存一个推送目标，包含 bot、peer、topic
  和收件人元数据。多个 chat 可以使用同一个目标。查询仅接受当前 bot 的关联。
- 发送目标按显式 `target_chat_uuid`、显式 `chat_id`、当前 chat 已保存的推送目标、
  当前 chat 入站绑定的顺序解析。没有以上目标时，按 peer/topic 去重；只有一个
  活跃目标才自动关联，多个目标要求用户选择，零目标返回前置条件。
- 发送前保存推送关联；发送失败保留该关联，正文和成功回执仅在发送成功后保存。
  正文副本作为 `telegram_delivery` 写入来源 chat，不进入模型对话历史。
- `telegram_delivery_receipts` 按 bot、peer、topic、TG 消息编号关联本地消息。
  回复推送时通过该记录进入来源 chat；未知记录、缺失来源、普通消息和命令
  使用原入站路径。回复路由仅对本次 run 生效，不重绑普通入站会话。
- Chat 工具副作用 sink 发布新副本的 `message.created` 与 `chat.updated`，
  当前页面无需切换 chat 即可收到已持久化记录。

## 失败和兼容性

工具仍使用 `target_chat_uuid` 作为收件人选择器；Main 注入的 `chat_uuid` 是来源。
显式目标无效或已归档时直接失败，不回退到其他收件人。工具必须有已保存的来源
chat 和运行中的 bot 身份。`success: true` 表示 TG 已送达；本地记录失败时返回
`deliveryRecorded: false` 并提示不要重发，以免生成重复推送。记录成功时返回
`deliveryMessageId` 供 Chat sink 读取和发布。

两个新表通过初始化时 `CREATE TABLE IF NOT EXISTS` 添加；既有绑定和历史消息
不迁移。目标随来源 chat 删除，回执随正文消息删除。旧推送没有新回执索引，
回复时继续沿用原入站绑定。回滚代码保留新表即可，不需要迁移既有数据。

## 验证

工具测试覆盖跨 chat 归属、已保存目标、唯一候选、多收件人/话题、显式覆盖、
归档/无效目标、关联失败、发送失败和已送达后的记录失败。真实 SQLite 测试
执行生产建表/索引语句，覆盖共享目标、重新读取、bot/peer/topic 隔离和级联
删除。Adapter、update mapper 和 Chat sink 测试覆盖回复路由及实时副本发布。
实际 Telegram 收发与 Electron 页面观察仍需单独验证。

本次验证命令：

```sh
pnpm --config.verify-deps-before-run=false exec vitest run src/main/hosts/telegram src/main/services/telegram src/main/tools/telegram src/main/hosts/chat/runtime/__tests__ src/main/db/dao/__tests__/ChatHostBindingDao.telegram.test.ts src/main/db/repositories/__tests__/ChatHostBindingRepository.test.ts src/main/db/core/__tests__/Database.test.ts
pnpm --config.verify-deps-before-run=false run typecheck:node
pnpm --config.verify-deps-before-run=false run typecheck:web
pnpm --config.verify-deps-before-run=false run check:main-boundaries
pnpm --config.verify-deps-before-run=false run test:main-architecture
pnpm --config.verify-deps-before-run=false run check:main-doc-paths
pnpm --config.verify-deps-before-run=false run test:coverage
```

相关测试 166 项通过。跨 chat 归属回归测试在旧处理器下失败（实际写入目标 chat），
新处理器下通过。Node/Web 类型检查在干净 HEAD 加本次文件的快照中通过，Main
边界与架构测试通过。任务文件 ESLint 与 HEAD 对比没有新增错误；所检查文件已有
34 个错误及格式警告，未做无关格式整理。

首次全量覆盖率运行 2355 项通过、21 项跳过、1 项失败；失败的 RunService
compression mock 在干净 HEAD 中同样复现。隔离快照另有 EmbeddingService
开发路径测试因快照目录不同而失败。明确排除这两个测试文件后，覆盖率运行
2320 项通过、21 项跳过，生成报告；这不代表未排除的全量运行通过。

隔离 Electron 运行使用真实 SQLite、生产工具/Adapter/Chat sink 和模拟 TG
网络发送，通过来源正文归属、目标关联、实时消息事件、回复路由、普通入站
归属以及数据库重开验证。真实 TG 收发与 Electron 页面显示未验证。

阶段提交前在当前 HEAD 再次验证：上述相关测试命令 165 项通过（共享 runtime
测试已随另一项改动更新），Node/Web 类型检查、Main 边界、Main 架构 8 项测试和
文档路径检查全部通过。原有暂存文件和无关 UI/原型文件不纳入本次提交。
