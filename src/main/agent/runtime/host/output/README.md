# output

> 状态（P1 结论，2026-07）：本目录下的三个文件（`HostStepOutput.ts` /
> `HostStepOutputBuilder.ts` / `HostStepOutputPolicy.ts`）仍是 `export {}` 空壳，
> **有意保留为占位 / 历史说明，不再计划把 render 状态族搬进 core runtime**。
> 真正的 host-facing output 层合法归属在 `hosts/`，见下方「实际归属」一节。

## 为什么这里是空壳

这一层最初的设想是在 core runtime 内处理「单个 step（`AgentStep`）如何派生成外部宿主可见输出」。
但真实实现走的是另一条、也是更正确的路：

- 真实的 output 不是「从单个稳定 `AgentStep` 派生」，而是**把 `AgentEvent` 流
  （含 content/reasoning delta、tool_call_ready、tool result、committed）fold 成
  preview/committed 的 block 状态**，再转成宿主可见 segment / patch。
- 这条链路产出的是 host-visible 契约（`@shared/chat/render-events` 的
  `MessageSegment` / `MessageSegmentPatch`），属于 host 概念，不是 runtime-native 事实。
- `agent/runtime` 是一条严格单向边界的下游：`hosts/ → agent/runtime`，**从不反向**
  （`grep '@shared/chat' / '@main/hosts'` in `agent/runtime/` 为零命中）。
  若在此实现 output 并让它 import render 状态族，会把 chat 专属渲染契约传递性拉进
  core runtime，正是 `CURRENT_ARCHITECTURE_ISSUES.md §10` 要消除的「runtime / output 未解耦」反模式。

对比：`host/bootstrap/` 之所以是实实在在的实现，是因为 loop **输入**（transcript /
request spec）是 runtime-native 的，可以合法地由 host 侧消费；而 output 方向天然携带
host-visible 契约，因此归属相反。

## 实际归属（output 层真正在哪）

| 职责 | 落地位置 |
| --- | --- |
| 唯一状态 fold 点 / output builder 入口 | `hosts/shared/render/HostRenderEventMapper.ts`（内含唯一一份 `AgentRenderStateReducer`，P0 后已移除影子 reducer） |
| block 状态机 | `hosts/shared/render/AgentRenderStateReducer.ts` |
| visible / hidden / tool-only 策略 | `hosts/shared/render/HostStepOutputPolicy.ts`（P1 新增，chat + telegram 共用，消除了重复的 hidden-tool 名单） |
| block → segment / patch | `hosts/shared/render/AgentRenderSegmentMapper.ts` |
| committed assistant 真源 / 差分 patch | `hosts/shared/render/CommittedAssistantMessageController.ts` |
| host-specific transport | `hosts/chat/runtime/*`、`hosts/telegram/runtime/*` |

## 若将来重启本目录

只有在 output 能被表达为**不依赖任何 host-visible 契约**的 runtime-native 结果时，
才应在此落地实现；否则继续保持空壳，让 output 留在 `hosts/`。

