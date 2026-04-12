# User Info System

> 当前状态以 2026-03-28 为准。

这份文档描述全局 `user_info` 系统的设计和当前实现。它的目标是解决一个具体问题：

- 模型经常忘记用户的基本资料和稳定偏好
- 仅靠 memory 检索不够稳定，也不适合承载严格结构化的用户画像

因此系统引入：

- `user_info_get`
- `user_info_set`
- `<user_info>` prompt section

并使用一个本地文件作为唯一数据源。

## 为什么不用数据库

当前 `user_info` 的特点是：

- 全局只有一份
- 数据量极小
- 字段稳定且结构简单
- 主要用途是 prompt 注入，而不是复杂查询

在这个前提下，直接引入数据库表会增加不必要的复杂度。当前实现选择：

- 本地单文件
- 固定 frontmatter
- 程序结构化读写

这样既轻量，也保留了人类可读性。

## 存储位置

当前文件位置：

- `app.getPath('userData')/user-info.md`

主实现：

- [UserInfoService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/userInfo/UserInfoService.ts)

## 文件格式

当前文件使用固定 frontmatter：

```md
---
name: ""
preferredAddress: ""
basicInfo: ""
preferences: ""
updatedAt: 0
---

# User Info

This file stores the stable global user profile used for prompt injection.
```

字段语义：

- `name`
  - 用户姓名
- `preferredAddress`
  - 用户希望被如何称呼
- `basicInfo`
  - 用户基本信息摘要
- `preferences`
  - 用户稳定偏好摘要
- `updatedAt`
  - 最近更新时间戳

空字符串表示当前未知。

## 工具设计

### `user_info_get`

作用：

- 读取当前全局用户资料
- 返回结构化对象
- 告知资料是否为空

返回示例：

```json
{
  "success": true,
  "info": {
    "name": "Gn",
    "preferredAddress": "Gn",
    "basicInfo": "Creator of @i.",
    "preferences": "Prefers direct, low-fluff communication.",
    "updatedAt": 1743120000000
  },
  "isEmpty": false,
  "file_path": ".../user-info.md",
  "message": "User info loaded successfully."
}
```

### `user_info_set`

作用：

- 整块覆盖当前用户资料
- 不做 patch

这是一个刻意选择：

- 模型更容易整理出“当前完整正确版本”
- 避免 patch 语义下的优先级和局部覆盖歧义

调用要求：

- 应提交完整的最新 `UserInfo`
- 如果某个字段仍未知，可以留空
- 至少要有一个字段非空，否则拒绝保存

## Prompt 注入

当前通过：

- [UserInfoPromptProvider.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/preparation/request/UserInfoPromptProvider.ts)

在 system prompt 中插入：

```xml
<user_info>
...
</user_info>
```

生成逻辑在：

- [userInfo.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/prompts/userInfo.ts)

当前 section 会始终存在。

### 非空时

展示用户资料，并明确优先级：

1. Safety constraints
2. 当前用户本轮明确要求
3. `user_info` 中的稳定资料和稳定偏好
4. 一般默认风格

### 为空时

同样会注入 section，但字段会显示为 `unknown`，并附带规则：

- 在早期合适的轮次询问用户
- 用简短问题采集关键信息
- 采集后调用 `user_info_set`

## 一次完整流程

### 分支 A：`user_info` 已存在

1. 用户发送消息。
2. request preparation 阶段读取 `user-info.md`。
3. `UserInfoPromptProvider` 生成 `<user_info>` section。
4. 模型在本轮中读取用户稳定资料。
5. 如果用户本轮没有改口，模型直接按资料进行称呼和风格调整。
6. 如果用户本轮明确更正资料，模型应在回复前或回复过程中调用 `user_info_set` 保存新的完整版本。

### 分支 B：`user_info` 为空

1. 用户发送消息。
2. request preparation 阶段读取 `user-info.md`，发现资料为空。
3. `<user_info>` section 中字段为 `unknown`，并提示模型尽早采集。
4. 如果当前轮次适合采集，模型应提出简短问题，例如：
   - 希望我怎么称呼你？
   - 有没有我应该长期记住的偏好？
5. 用户回答后，模型调用 `user_info_set` 保存完整资料。
6. 下一轮开始，新的 `<user_info>` section 自动生效。

## 当前边界

当前系统还没有做这些事情：

- 多用户 scope
- 版本历史
- 字段级 patch
- UI 设置页编辑入口

这都是刻意控制复杂度的结果。当前目标只是：

- 让模型稳定记住用户基本资料
- 让这些资料稳定进入 prompt
- 让更新路径明确、轻量、可测试
