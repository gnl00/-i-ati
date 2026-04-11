# Current Architecture Issues

这份文档总结当前主线架构里已经暴露出来的问题，用来作为 `next` 方案的背景参照。

目标不是复述所有历史细节，而是回答两个问题：

1. 当前结构为什么越来越复杂
2. `next` 要优先解决哪些根因

## 1. agent runtime 和 chat transcript 越层耦合

当前最核心的问题不是某一个 bug，而是运行时 core 和 chat 语义对象耦合过深。

典型表现：

- 旧 loop 已移除；对应复杂度现在应只在 `next` / host adapter 边界里被显式建模
- runtime 中间状态会直接影响 chat transcript 的可见内容
- 多轮 tool cycle 很容易污染同一条 assistant message

根因：

- runtime facts
- 协议历史
- 用户可见消息

这三层没有被明确拆开。

## 2. step / cycle / message 三个概念混在一起

当前实现里经常把下面三件事混成一件事：

- 单次模型请求
- 一轮 agent loop 里的 cycle
- 一条用户可见 assistant message

这会导致：

- 一个 step 内多个 cycle 被错误投到同一条 assistant message
- tool call 前后的草稿状态不稳定
- “运行时正确性”和“产品可见语义”互相污染

## 3. core runtime 没有坚持 event-first 边界

虽然已经有 event mapper / event listener / sink 这些抽象，但 loop 仍然不是纯事件驱动内核。

典型表现：

- loop 需要知道外部如何 commit state
- loop 需要知道 request history 如何维护
- loop 对外暴露的不是最小事实，而是带着外层语义的状态更新接口

结果：

- core 变重
- host adapter 很难保持薄
- 小修复经常演变成多层补丁

## 4. tool flow 和 transcript flow 相互缠绕

tool call 本来只是 runtime 中的一个阶段，但当前结构里它会直接影响：

- 可见消息何时出现
- 可见消息何时被清空
- transcript 何时追加
- final answer 何时收口

问题不在工具本身，而在于缺少一个干净的 runtime model：

- tool batch 是 runtime state
- tool result 是 transcript input
- 用户是否看到中间内容，是 output policy

这三者目前还没有被完全分层。

## 5. hostAdapters/chat 承担了过多“运行中状态管理”

`hostAdapters/chat` 理应主要负责：

- prepare
- finalize
- persistence
- host event mapping

但当前它还被迫承接部分运行中状态的收敛和可见化逻辑。

结果：

- chat adapter 不够薄
- 它和 core runtime 的边界容易反复漂移

## 6. shell、adapter、core 的职责仍然需要靠人脑记忆

当前目录边界已经比过去清楚很多，但还有一个现实问题：

- 要理解完整架构，仍然需要反复扫代码
- 很多“为什么这个文件该在这里”的理由并没有沉淀成固定参照

这会带来两个后果：

- 新改动容易再次越层
- 同一类边界问题会重复出现

## 7. 当前架构里的主要复杂度来源

可以把复杂度来源总结成一句话：

不是功能本身复杂，而是同一个运行事实在不同层被重复建模。

重复建模的典型位置：

- loop working state
- transcript history
- user-visible message
- host event payload

如果这些对象之间没有稳定映射关系，复杂度就会不断上升。

## 8. composition root 容易继续吸收业务语义

当前架构里还有一个容易反复发生的漂移：

- runtime / factory / adapter 的组装层
- 会一点点吸收业务判断和分支策略

典型风险：

- 本来属于 loop 的状态推进，被塞到 runtime 或 factory
- 本来属于 host output policy 的判断，被塞到接线层
- context 对象逐渐变成“什么都能塞”的输入包

结果：

- composition root 不再只是接线
- 调试时很难判断语义到底属于 core、host 还是 wiring
- 文档和实现都会慢慢失焦

## 9. `next` 需要优先解决什么

`next` 优先解决的不是“换一批文件名”，而是下面几个根因：

1. 明确 `AgentLoop` 只处理 runtime facts
2. 明确 `AgentStep` 是单次模型请求的稳定结果
3. 明确 transcript 使用独立的 runtime-native record
4. 明确 step output 是 host-facing 结果，而不是 runtime source
5. 明确 core 对外主要通过 events 和 final result 交互
6. 明确 runtime 只是 composition root，不继续吸收业务语义

## 10. 一句话结论

当前架构最大的问题不是某个点状 bug，而是：

runtime、transcript、output 这三层还没有彻底解耦。

`next` 的目标，就是把这三层拆清，然后让：

- `loop/`
  负责运行
- `step/`
  负责单步结果
- `transcript/`
  负责协议历史
- `host/output/`
  负责外部可见输出

这样以后讨论和实现都可以直接围绕固定边界展开，而不用每次重新扫当前架构。
