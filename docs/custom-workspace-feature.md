# Custom Workspace Feature

## 概述

自定义 Workspace 功能允许用户为每个 chat 选择自定义的工作目录，用于文件操作工具的基础路径。

## 功能特性

### 1. 核心功能
- 每个 chat 可以独立设置自定义 workspace 路径
- 支持通过 UI 按钮选择目录
- workspace 路径持久化到数据库
- 未设置时使用默认路径：`~/Library/Application Support/at-i-app/workspaces/{chatUuid}`

### 2. 用户体验优化
- **智能 New Chat**：当前 chat 无消息时，点击 New Chat 会清空 workspace 并复用当前 chat，避免创建空 chat
- **实时显示**：按钮显示当前选择的目录名称
- **视觉反馈**：选中状态使用 emerald/teal 渐变色，未选中使用 slate 灰色
- **平滑动画**：hover、active 状态有流畅的过渡效果

## 技术实现

### 1. 数据模型

#### ChatEntity 扩展
```typescript
// src/types/index.d.ts
declare interface ChatEntity {
  id?: number
  uuid: string
  title: string
  messages: number[]
  msgCount?: number
  model?: string
  workspacePath?: string  // 新增：自定义 workspace 路径
  updateTime: number
  createTime: number
}
```

### 2. 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  ChatInputActions.tsx - Workspace 选择按钮                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├─ invokeSelectDirectory()
                     │  └─ Electron Dialog API
                     │
                     ├─ saveChat() / updateChat()
                     │  └─ 保存 workspacePath 到数据库
                     │
                     └─ invokeSetFileOperationsBaseDir()
                        └─ 设置 FileOps 基础目录
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    Context Layer                             │
│  ChatContext.tsx - 监听 chatList 变化，自动同步 workspace    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     └─ useEffect([chatUuid, chatList])
                        └─ invokeSetFileOperationsBaseDir()
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                      IPC Layer                               │
│  main-ipc.ts - IPC 通信处理                                  │
│  - select-directory: 目录选择对话框                          │
│  - FILE_SET_WORKSPACE_BASE_DIR: 设置工作目录                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌──────────────────────────┴──────────────────────────────────┐
│                   Main Process                               │
│  FileOperationsProcessor.ts - 文件操作处理                   │
│  - setWorkspaceBaseDir(): 设置 currentBaseDir                │
│  - resolveFilePath(): 解析相对路径                           │
└─────────────────────────────────────────────────────────────┘
```

### 3. 关键文件修改

#### 3.1 UI 层 - ChatInputActions.tsx

**文件路径：** `src/renderer/src/components/chat/chatInput/ChatInputActions.tsx`

**新增功能：**
- `handleWorkspaceSelect()`: 处理目录选择逻辑
  - 无 chat 时：创建新 chat 并设置 workspace
  - 有 chat 时：更新现有 chat 的 workspace
- `handleNewChat()`: 优化的新建 chat 逻辑
  - 当前 chat 无消息时：清空 workspace 复用 chat
  - 否则：创建新 chat
- `getDirectoryName()`: 提取目录名用于显示

**关键代码：**
```typescript
const handleWorkspaceSelect = async () => {
  const result = await invokeSelectDirectory()
  if (result.success && result.path) {
    if (!chatId && !chatUuid) {
      // 创建新 chat
      const newChatEntity: ChatEntity = {
        uuid: uuidv4(),
        title: 'NewChat',
        messages: [],
        workspacePath: result.path,
        createTime: Date.now(),
        updateTime: Date.now()
      }
      const newChatId = await saveChat(newChatEntity)
      await invokeSetFileOperationsBaseDir(newChatUuid, result.path)
      // 更新状态...
    } else {
      // 更新现有 chat
      const updatedChat = { ...currentChat, workspacePath: result.path }
      await updateChat(updatedChat)
      await invokeSetFileOperationsBaseDir(chatUuid, result.path)
    }
  }
}

const handleNewChat = async () => {
  // 如果当前 chat 存在且没有任何消息，直接清空 workspace 复用当前 chat
  if (chatId && chatUuid && messages.length === 0) {
    const currentChat = chatList.find(chat => chat.id === chatId)
    if (currentChat && currentChat.workspacePath) {
      const updatedChat = { ...currentChat, workspacePath: undefined }
      await updateChat(updatedChat)
      await invokeSetFileOperationsBaseDir(chatUuid, undefined)
      toast.success('Workspace cleared')
      return
    }
  }
  // 否则，调用原始的 onNewChat 创建新 chat
  onNewChat()
}
```

#### 3.2 Context 层 - ChatContext.tsx

**文件路径：** `src/renderer/src/context/ChatContext.tsx`

**新增功能：**
- 监听 `chatUuid` 和 `chatList` 变化
- 自动同步 workspace 到 FileOps

**关键代码：**
```typescript
useEffect(() => {
  if (chatUuid && chatList.length > 0) {
    const currentChat = chatList.find(chat => chat.uuid === chatUuid)
    if (currentChat) {
      const customWorkspacePath = currentChat?.workspacePath
      invokeSetFileOperationsBaseDir(chatUuid, customWorkspacePath)
    }
  }
}, [chatUuid, chatList])
```

#### 3.3 IPC 层 - main-ipc.ts

**文件路径：** `src/main/main-ipc.ts`

**新增 IPC 处理器：**
1. `select-directory`: 打开目录选择对话框
2. `FILE_SET_WORKSPACE_BASE_DIR`: 设置 FileOps 基础目录

**关键代码：**
```typescript
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Workspace Directory',
    buttonLabel: 'Select'
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, path: null }
  }
  return { success: true, path: result.filePaths[0] }
})

ipcMain.handle(FILE_SET_WORKSPACE_BASE_DIR, (_event, args) => {
  setWorkspaceBaseDir(args.chatUuid, args.customWorkspacePath)
  return { success: true }
})
```

#### 3.4 Main Process - FileOperationsProcessor.ts

**文件路径：** `src/tools/fileOperations/main/FileOperationsProcessor.ts`

**修改功能：**
- `setWorkspaceBaseDir()`: 支持自定义路径参数
- 优先使用自定义路径，否则使用默认路径

**关键代码：**
```typescript
export function setWorkspaceBaseDir(chatUuid: string, customWorkspacePath?: string): void {
  if (customWorkspacePath) {
    currentBaseDir = customWorkspacePath
  } else {
    currentBaseDir = join(app.getPath('userData'), 'workspaces', chatUuid)
  }
  console.log(`[FileOps] Base directory set to: ${currentBaseDir}`)
}
```

#### 3.5 Chat Submit 流程 - prepare.ts & finalize.ts

**文件路径：** 
- `src/renderer/src/hooks/chatSubmit/prepare.ts`
- `src/renderer/src/hooks/chatSubmit/finalize.ts`

**关键修复：**
保留 `workspacePath` 字段，避免在消息发送过程中丢失

**关键代码：**
```typescript
// 从数据库重新加载最新的 msgCount 和 workspacePath
const updatedChat = await getChatById(currChatId!)
if (updatedChat) {
  chatEntity.msgCount = updatedChat.msgCount
  chatEntity.workspacePath = updatedChat.workspacePath  // 关键：保留 workspacePath
}
updateChatList(chatEntity)
```

## 关键问题与解决方案

### 问题 1: Workspace 在消息发送后被重置

**现象：**
选择 workspace 后发送消息，workspace 路径被重置为 undefined

**原因：**
在 `prepare.ts` 和 `finalize.ts` 中，从数据库重新加载 chat 数据时只更新了 `msgCount`，没有保留 `workspacePath` 字段

**解决方案：**
在重新加载数据时同时保留 `workspacePath` 字段：
```typescript
if (updatedChat) {
  chatEntity.msgCount = updatedChat.msgCount
  chatEntity.workspacePath = updatedChat.workspacePath  // 新增
}
```

### 问题 2: 选择 Workspace 后创建空 Chat

**现象：**
用户选择 workspace → 创建新 chat → 点击 New Chat → 又创建一个新 chat，导致产生空 chat

**解决方案：**
优化 `handleNewChat()` 逻辑：
- 检查当前 chat 是否有消息
- 如果无消息且有 workspace，清空 workspace 并复用当前 chat
- 否则创建新 chat

## 数据流

### 1. 选择 Workspace 流程

```
用户点击 Workspace 按钮
  ↓
invokeSelectDirectory() → Electron Dialog
  ↓
用户选择目录
  ↓
saveChat() / updateChat() → 保存到数据库
  ↓
invokeSetFileOperationsBaseDir() → 设置 FileOps
  ↓
updateChatList() → 更新 UI 状态
  ↓
ChatContext useEffect 触发 → 同步 workspace
```

### 2. 切换 Chat 流程

```
用户切换 chat
  ↓
setChatId() / setChatUuid()
  ↓
ChatContext useEffect 触发
  ↓
从 chatList 获取 workspacePath
  ↓
invokeSetFileOperationsBaseDir()
  ↓
FileOps 基础目录更新
```

### 3. 消息发送流程

```
用户发送消息
  ↓
prepare.ts: 准备消息
  ↓
从数据库加载 chat (包含 workspacePath)
  ↓
保存消息到数据库
  ↓
重新加载 chat (保留 workspacePath)
  ↓
updateChatList() → 触发 ChatContext useEffect
  ↓
同步 workspace (保持不变)
  ↓
finalize.ts: 完成消息
  ↓
重新加载 chat (保留 workspacePath)
  ↓
updateChatList() → 再次同步 workspace
```

## 涉及的文件清单

### 核心文件
1. `src/types/index.d.ts` - 类型定义
2. `src/renderer/src/components/chat/chatInput/ChatInputActions.tsx` - UI 组件
3. `src/renderer/src/context/ChatContext.tsx` - Context 管理
4. `src/main/main-ipc.ts` - IPC 处理
5. `src/tools/fileOperations/main/FileOperationsProcessor.ts` - 文件操作
6. `src/tools/fileOperations/renderer/FileOperationsInvoker.ts` - IPC 调用
7. `src/renderer/src/hooks/chatSubmit/prepare.ts` - 消息准备
8. `src/renderer/src/hooks/chatSubmit/finalize.ts` - 消息完成

### 辅助文件
9. `src/renderer/src/invoker/ipcInvoker.ts` - 目录选择 IPC 调用
10. `src/renderer/src/db/ChatRepository.ts` - 数据库操作
11. `src/renderer/src/utils/workspaceUtils.ts` - Workspace 工具函数

## 测试要点

### 功能测试
1. ✅ 新 chat 选择 workspace
2. ✅ 已有 chat 更新 workspace
3. ✅ 切换 chat 时 workspace 正确同步
4. ✅ 发送消息后 workspace 不被重置
5. ✅ 无消息的 chat 点击 New Chat 复用当前 chat
6. ✅ 有消息的 chat 点击 New Chat 创建新 chat
7. ✅ Workspace 按钮显示正确的目录名

### UI 测试
1. ✅ 未选择状态：slate 灰色
2. ✅ 选中状态：emerald/teal 渐变
3. ✅ Hover 动画流畅
4. ✅ 目录名正确截取和显示
5. ✅ Tooltip 显示完整路径

## 注意事项

1. **数据完整性**：在任何调用 `updateChatList()` 的地方，确保 `chatEntity` 包含完整的字段，特别是 `workspacePath`
2. **状态同步**：ChatContext 的 useEffect 依赖 `chatList` 变化，确保 `chatList` 更新时包含最新的 `workspacePath`
3. **IPC 调用顺序**：在创建/更新 chat 后，立即调用 `invokeSetFileOperationsBaseDir()` 确保 FileOps 同步
4. **数据库持久化**：所有 workspace 变更都要通过 `saveChat()` 或 `updateChat()` 持久化到数据库

## 未来优化方向

1. 支持 workspace 历史记录
2. 支持快速切换常用 workspace
3. 支持 workspace 模板
4. 支持多个 workspace 同时使用
5. 添加 workspace 权限检查