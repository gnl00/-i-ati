  ✅ 完成的工作

  1. 重构 Zustand Store (store/index.ts)
  - ✅ 添加了 loadChat - 从 SQLite 加载聊天
  - ✅ 添加了 addMessage - 保存消息到 SQLite
  - ✅ 添加了 updateMessage - 更新消息到 SQLite
  - ✅ 添加了 upsertMessage - 内存更新（用于流式场景）
  - ✅ 添加了 setCurrentChat - 设置当前聊天
  - ✅ 导出了 ChatStore 类型供其他文件使用

  2. 更新类型定义 (types.ts)
  - ✅ PrepareMessageParams.store 现在是 ChatStore 类型
  - ✅ StreamingDeps.store 现在是 ChatStore 类型
  - ✅ FinalizeDeps.store 现在是 ChatStore 类型

  3. 重构 prepare.ts
  - ✅ 移除了直接的 saveMessage() IPC 调用
  - ✅ 移除了直接的 getMessageByIds() IPC 调用
  - ✅ 改用 store.addMessage() 保存用户消息
  - ✅ 改用 store.loadChat() 加载聊天消息
  - ✅ 使用 store.setCurrentChat() 设置当前聊天

  4. 重构 finalize.ts
  - ✅ 移除了直接的 saveMessage() IPC 调用
  - ✅ 改用 store.addMessage() 保存助手消息和 tool result 消息

  5. 简化 MessageManager
  - ✅ 移除了 updateMessages() 方法（不再需要复杂的三向同步）
  - ✅ 移除了 syncChatMessages() 方法（不再需要手动同步）
  - ✅ 使用 store.upsertMessage() 进行流式更新
  - ✅ 使用 store.addMessage() 保存 tool result 消息
  - ✅ 大幅简化代码，从 222 行减少到 155 行

  6. 更新依赖容器 (container.ts)
  - ✅ buildPrepareParams() 现在传递完整的 chatStore 实例
  - ✅ buildFinalizeDeps() 现在传递完整的 chatStore 实例
  - ✅ buildStreamingDeps() 现在传递完整的 chatStore 实例

  ---
  架构优化效果

  之前的数据流（混乱）：

  prepare.ts:
    saveMessage() ────→ IPC ────→ SQLite
    getMessagesByChatId() ────→ IPC ←──── SQLite
    setMessages() ────→ Zustand

  finalize.ts:
    saveMessage() ────→ IPC ────→ SQLite

  MessageManager:
    updateMessages() ────→ 手动同步 3 个地方
      ├─ messageEntities
      ├─ chatMessages
      └─ setMessages() → Zustand

  之后的数据流（清晰）：

  UI 操作
      ↓
  Zustand Store Action (如 addMessage, loadChat)
      ↓
  IPC invoke (自动)
      ↓
  SQLite (主进程)
      ↓
  返回结果
      ↓
  更新 Zustand state (自动)
      ↓
  UI 自动重新渲染
