# ADR 0028: Renderer run 消费与消息版本

状态：已采纳

## 背景

Main 统一分发后，Renderer 普通消息消费仍由桌面提交或定时任务注册。Telegram 发起的 run 没有对应订阅。历史恢复把旧 transcript buffer 合入数据库快照时，还会无条件采用 buffer body，造成最终答复长期被旧的中间状态覆盖。

## 决策

Home 挂载应用级 `retainChatRunIngress()`。所有普通 run 事件通过一个订阅和按 submission 分组的消费者接收。桌面提交只注册运行控制上下文；有 chat 身份的外部运行自动注册观察上下文。每个 run 的事件串行消费，复用现有消息、preview、工具输出、失败及维护投影。外部运行不会选中其他 chat。后台消息写入对应 chat buffer。

运行结束释放上下文及 preview batcher；应用订阅持续存在。标题等 post-run 元数据由该入口持续接收。定时任务 hook 只处理任务通知，普通消息和生命周期走 Run 协议。

`messages.revision` 是 Main 数据库维护的整数。新消息为 1，每次持久化更新或 UI 字段补丁在事务内递增。调用者不能指定新 revision。消息查询及运行输出带同一个 `MessageEntity.revision`，未保存的 draft 不具备持久化版本。分叉生成新的消息，版本从 1 开始。

历史恢复按每条消息 id 与 revision 合并：数据库快照是基准；仅 revision 更大的已提交事件覆盖快照，相同版本采用快照。实时消息更新拒绝较旧版本，已提交 segment 补丁携带 revision 并拒绝旧版本或重复版本。快照请求期间收到的较新事件因此保留。异步历史读取完成时，仅更新对应 buffer；只有 chat 仍被选中才更新可见 transcript。

现有数据库在 Main 初始化时增加非空 revision 列，并统一初始化为 1。这是一次 schema 更新；新运行协议不提供旧客户端、时间戳推断或旧协议适配分支。Main / preload / Renderer 需要一起加载新版本。

## 边界

消息版本只代表数据库写入顺序，不使用 Run envelope.sequence 作为消息版本；post-run job 可以有自己的 emitter。preview 是本次 run 的临时状态，使用串行事件与 batcher，不写入数据库 revision。审批和工具提问继续消费各自的 canonical 协议。

## 验证

回归覆盖无桌面提交的 Telegram run、后台 chat、旧消息版本、快速连续事件、run 结束后的标题、历史快照与事件竞争，以及真实 SQL 的 revision 存取。Main repository 测试检查调用者无法指定版本和 UI patch 递增。
