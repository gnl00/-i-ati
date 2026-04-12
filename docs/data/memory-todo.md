# Memory 功能待办事项

## 概述

本文档记录了 Memory 功能的剩余开发任务。Memory 功能基于向量相似度实现长期记忆和智能上下文检索，已完成核心服务层（`MemoryService` 和 `EmbeddingService`）以及主进程 IPC 处理器的实现。

**当前状态：**
- ✅ 已完成：MemoryService（向量存储与检索）
- ✅ 已完成：EmbeddingService（文本向量化）
- ✅ 已完成：主进程 IPC Handlers（9 个 Memory/Embedding 相关的 IPC 处理器）
- 🚧 待完成：Preload 层 API 暴露
- 🚧 待完成：渲染进程集成（聊天流程）
- 🚧 待完成：设置界面配置选项

**项目路径：** `/Volumes/devdata/workspace/code/-i-ati`

---

## 任务列表

### ✅ 已完成任务

- [x] 实现 MemoryService 核心功能
- [x] 实现 EmbeddingService
- [x] 添加主进程 IPC Handlers
- [x] 创建数据库表和索引
- [x] 实现向量相似度搜索算法

### 🔲 待完成任务

- [ ] **任务 1：在 Preload 层暴露 Memory API**
- [ ] **任务 2：实现上下文检索功能并集成到聊天流程**
- [ ] **任务 3：添加 Memory 配置选项到设置界面**

---

## 任务详细说明

---

## 任务 1：在 Preload 层暴露 Memory API

### 目标

在渲染进程中暴露 Memory 和 Embedding 相关的 IPC API，使 React 组件能够调用主进程的 Memory 服务。

### 优先级

🔴 **高** - 这是后续任务的前置依赖

### 预估时间

⏱️ 30-45 分钟

### 实现步骤

#### 步骤 1：在 `src/preload/index.ts` 中暴露 Memory API

1. 导入所需的常量：
```typescript
import {
  MEMORY_ADD,
  MEMORY_ADD_BATCH,
  MEMORY_SEARCH,
  MEMORY_GET_CHAT,
  MEMORY_DELETE,
  MEMORY_DELETE_CHAT,
  MEMORY_GET_STATS,
  MEMORY_CLEAR,
  EMBEDDING_GENERATE,
  EMBEDDING_GENERATE_BATCH,
  EMBEDDING_GET_MODEL_INFO
} from '../constants'
```

2. 创建 Memory API 对象：
```typescript
const memoryApi = {
  // Memory operations
  addMemory: (args: {
    chatId: number
    messageId: number
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
    metadata?: Record<string, any>
  }) => ipcRenderer.invoke(MEMORY_ADD, args),

  addBatchMemories: (entries: Array<{
    chatId: number
    messageId: number
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
    metadata?: Record<string, any>
  }>) => ipcRenderer.invoke(MEMORY_ADD_BATCH, { entries }),

  searchMemories: (query: string, options?: {
    chatId?: number
    topK?: number
    threshold?: number
    excludeIds?: string[]
    timeRange?: { start?: number; end?: number }
  }) => ipcRenderer.invoke(MEMORY_SEARCH, { query, options }),

  getChatMemories: (chatId: number) =>
    ipcRenderer.invoke(MEMORY_GET_CHAT, { chatId }),

  deleteMemory: (id: string) =>
    ipcRenderer.invoke(MEMORY_DELETE, { id }),

  deleteChatMemories: (chatId: number) =>
    ipcRenderer.invoke(MEMORY_DELETE_CHAT, { chatId }),

  getStats: () =>
    ipcRenderer.invoke(MEMORY_GET_STATS),

  clearAll: () =>
    ipcRenderer.invoke(MEMORY_CLEAR),

  // Embedding operations
  generateEmbedding: (text: string, options?: any) =>
    ipcRenderer.invoke(EMBEDDING_GENERATE, { text, options }),

  generateBatchEmbeddings: (texts: string[], options?: any) =>
    ipcRenderer.invoke(EMBEDDING_GENERATE_BATCH, { texts, options }),

  getModelInfo: () =>
    ipcRenderer.invoke(EMBEDDING_GET_MODEL_INFO)
}
```

3. 将 memoryApi 暴露到 window 对象：
```typescript
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('memoryApi', memoryApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.memoryApi = memoryApi
}
```

#### 步骤 2：在 `src/preload/index.d.ts` 中添加类型定义

```typescript
interface MemoryEntry {
  id: string
  chatId: number
  messageId: number
  role: 'user' | 'assistant' | 'system'
  content: string
  embedding: number[]
  timestamp: number
  metadata?: Record<string, any>
}

interface SearchResult {
  entry: MemoryEntry
  similarity: number
  rank: number
}

interface MemoryStats {
  totalMemories: number
  totalChats: number
  memoriesByChat: Array<{
    chatId: number
    count: number
  }>
}

interface MemoryApi {
  // Memory operations
  addMemory: (args: Omit<MemoryEntry, 'id' | 'embedding'>) => Promise<MemoryEntry>
  addBatchMemories: (entries: Array<Omit<MemoryEntry, 'id' | 'embedding'>>) => Promise<MemoryEntry[]>
  searchMemories: (query: string, options?: {
    chatId?: number
    topK?: number
    threshold?: number
    excludeIds?: string[]
    timeRange?: { start?: number; end?: number }
  }) => Promise<SearchResult[]>
  getChatMemories: (chatId: number) => Promise<MemoryEntry[]>
  deleteMemory: (id: string) => Promise<boolean>
  deleteChatMemories: (chatId: number) => Promise<number>
  getStats: () => Promise<MemoryStats>
  clearAll: () => Promise<void>

  // Embedding operations
  generateEmbedding: (text: string, options?: any) => Promise<{ embedding: number[]; tokenCount: number }>
  generateBatchEmbeddings: (texts: string[], options?: any) => Promise<{ embeddings: number[][]; tokenCounts: number[] }>
  getModelInfo: () => Promise<{ name: string; dimension: number; maxTokens: number }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    memoryApi: MemoryApi
  }
}
```

### 涉及的文件

- `/Volumes/devdata/workspace/code/-i-ati/src/preload/index.ts` - 实现 Memory API
- `/Volumes/devdata/workspace/code/-i-ati/src/preload/index.d.ts` - 添加类型定义
- `/Volumes/devdata/workspace/code/-i-ati/src/constants/index.ts` - （已存在，无需修改）

### 验收标准

- [ ] Preload 层成功暴露 9 个 Memory API 和 3 个 Embedding API
- [ ] TypeScript 类型定义完整且准确
- [ ] 在渲染进程中可以通过 `window.memoryApi` 访问所有 API
- [ ] 所有 API 调用能够正确触发主进程的 IPC Handler

### 技术考虑

- **类型安全**：确保类型定义与 MemoryService 的接口保持一致
- **错误处理**：IPC 调用应该能够正确传递错误信息到渲染进程
- **异步处理**：所有 API 都返回 Promise，需要在调用侧正确处理

### 测试建议

在浏览器控制台测试：
```javascript
// 测试添加记忆
await window.memoryApi.addMemory({
  chatId: 1,
  messageId: 1,
  role: 'user',
  content: 'Hello, this is a test message',
  timestamp: Date.now()
})

// 测试搜索
const results = await window.memoryApi.searchMemories('test', { topK: 3 })
console.log(results)

// 测试获取统计
const stats = await window.memoryApi.getStats()
console.log(stats)
```

---

## 任务 2：实现上下文检索功能并集成到聊天流程

### 目标

将 Memory 服务集成到聊天提交流程中，实现：
1. 自动保存用户和 AI 消息到记忆
2. 在构建请求前检索相关历史上下文
3. 将检索到的上下文注入到系统提示中
4. 添加 UI 指示器显示何时使用了记忆

### 优先级

🟡 **中** - 核心功能，依赖任务 1

### 预估时间

⏱️ 2-3 小时

### 实现步骤

#### 步骤 1：创建 Memory Hook (`src/renderer/src/hooks/useMemory.ts`)

创建一个专门处理 Memory 操作的 React Hook：

```typescript
import { useState, useCallback } from 'react'

interface MemoryHookOptions {
  enabled: boolean // 是否启用记忆功能
  autoSave: boolean // 是否自动保存消息
  contextRetrieval: boolean // 是否启用上下文检索
  topK: number // 检索数量
  threshold: number // 相似度阈值
}

export function useMemory(options: MemoryHookOptions) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [retrievedCount, setRetrievedCount] = useState(0)

  /**
   * 保存消息到记忆
   */
  const saveMessage = useCallback(async (
    chatId: number,
    messageId: number,
    role: 'user' | 'assistant',
    content: string
  ) => {
    if (!options.enabled || !options.autoSave) return

    try {
      await window.memoryApi.addMemory({
        chatId,
        messageId,
        role,
        content,
        timestamp: Date.now()
      })
      console.log(`[Memory] Saved ${role} message to memory`)
    } catch (error) {
      console.error('[Memory] Failed to save message:', error)
    }
  }, [options.enabled, options.autoSave])

  /**
   * 检索相关上下文
   */
  const retrieveContext = useCallback(async (
    query: string,
    chatId?: number
  ): Promise<string | null> => {
    if (!options.enabled || !options.contextRetrieval) return null

    setIsProcessing(true)
    try {
      const results = await window.memoryApi.searchMemories(query, {
        chatId,
        topK: options.topK,
        threshold: options.threshold
      })

      setRetrievedCount(results.length)

      if (results.length === 0) {
        return null
      }

      // 格式化上下文
      const contextParts = results.map((result, index) => {
        const { entry, similarity } = result
        return `[Memory ${index + 1}] (Similarity: ${similarity.toFixed(2)}, Role: ${entry.role})
${entry.content}`
      })

      return `## Retrieved Context from Memory

The following are relevant historical conversations that may help understand the current context:

${contextParts.join('\n\n')}

---
`
    } catch (error) {
      console.error('[Memory] Failed to retrieve context:', error)
      return null
    } finally {
      setIsProcessing(false)
    }
  }, [options.enabled, options.contextRetrieval, options.topK, options.threshold])

  /**
   * 批量保存历史消息
   */
  const saveHistoryBatch = useCallback(async (
    chatId: number,
    messages: Array<{ id: number; role: 'user' | 'assistant'; content: string }>
  ) => {
    if (!options.enabled || !options.autoSave) return

    try {
      const entries = messages.map(msg => ({
        chatId,
        messageId: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: Date.now()
      }))

      await window.memoryApi.addBatchMemories(entries)
      console.log(`[Memory] Saved ${entries.length} messages in batch`)
    } catch (error) {
      console.error('[Memory] Failed to save batch:', error)
    }
  }, [options.enabled, options.autoSave])

  return {
    saveMessage,
    retrieveContext,
    saveHistoryBatch,
    isProcessing,
    retrievedCount
  }
}
```

#### 步骤 2：在 `src/renderer/src/store/appConfig.ts` 中添加 Memory 配置状态

1. 在 `AppConfigState` 类型中添加 Memory 配置：

```typescript
type AppConfigState = {
  appConfig: IAppConfig
  // ... 现有字段

  // Memory settings
  memoryEnabled: boolean
  memoryAutoSave: boolean
  memoryContextRetrieval: boolean
  memoryTopK: number
  memoryThreshold: number
}
```

2. 在状态初始化中添加默认值：

```typescript
export const useAppConfigStore = create<AppConfigState & AppConfigAction>((set, get) => ({
  // ... 现有状态

  // Memory settings - 从 appConfig.memory 中读取或使用默认值
  memoryEnabled: defaultConfig.memory?.enabled ?? false,
  memoryAutoSave: defaultConfig.memory?.autoSave ?? true,
  memoryContextRetrieval: defaultConfig.memory?.contextRetrieval ?? true,
  memoryTopK: defaultConfig.memory?.topK ?? 5,
  memoryThreshold: defaultConfig.memory?.threshold ?? 0.6,
```

3. 在 `AppConfigAction` 中添加 setter 方法：

```typescript
type AppConfigAction = {
  // ... 现有方法

  // Memory setting actions
  setMemoryEnabled: (enabled: boolean) => void
  setMemoryAutoSave: (autoSave: boolean) => void
  setMemoryContextRetrieval: (contextRetrieval: boolean) => void
  setMemoryTopK: (topK: number) => void
  setMemoryThreshold: (threshold: number) => void
}
```

4. 实现 setter 方法：

```typescript
// Memory setting actions
setMemoryEnabled: (enabled: boolean) => set({ memoryEnabled: enabled }),
setMemoryAutoSave: (autoSave: boolean) => set({ memoryAutoSave: autoSave }),
setMemoryContextRetrieval: (contextRetrieval: boolean) => set({ memoryContextRetrieval: contextRetrieval }),
setMemoryTopK: (topK: number) => set({ memoryTopK: topK }),
setMemoryThreshold: (threshold: number) => set({ memoryThreshold: threshold })
```

5. 在 `_setAppConfig` 和 `setAppConfig` 中添加 Memory 配置的同步：

```typescript
_setAppConfig: (config: IAppConfig) => {
  set({
    appConfig: config,
    // ... 现有字段
    memoryEnabled: config.memory?.enabled ?? false,
    memoryAutoSave: config.memory?.autoSave ?? true,
    memoryContextRetrieval: config.memory?.contextRetrieval ?? true,
    memoryTopK: config.memory?.topK ?? 5,
    memoryThreshold: config.memory?.threshold ?? 0.6,
  })
},

setAppConfig: async (updatedConfig: IAppConfig) => {
  const { saveConfig } = await import('../db/ConfigRepository')
  await saveConfig(updatedConfig)
  set({
    appConfig: updatedConfig,
    // ... 现有字段
    memoryEnabled: updatedConfig.memory?.enabled ?? false,
    memoryAutoSave: updatedConfig.memory?.autoSave ?? true,
    memoryContextRetrieval: updatedConfig.memory?.contextRetrieval ?? true,
    memoryTopK: updatedConfig.memory?.topK ?? 5,
    memoryThreshold: updatedConfig.memory?.threshold ?? 0.6,
  })
}
```

> 这份文档是历史待办与方案记录，部分路径和命名来自当时状态。
> 当前 renderer chat run 入口为 `src/renderer/src/hooks/chatRun/useChatRun.ts`。

#### 步骤 3：集成到 renderer chat run 入口

1. 导入 useMemory hook 和配置：

```typescript
import { useMemory } from './useMemory'
import { useAppConfigStore } from '@renderer/store/appConfig'
```

2. 在 renderer chat run 入口函数中初始化 Memory hook：

```typescript
function useChatRun() {
  const {
    // ... 现有 hooks
  } = useChatContext()

  const {
    // ... 现有 store
    memoryEnabled,
    memoryAutoSave,
    memoryContextRetrieval,
    memoryTopK,
    memoryThreshold,
  } = useAppConfigStore()

  // 初始化 Memory hook
  const memory = useMemory({
    enabled: memoryEnabled,
    autoSave: memoryAutoSave,
    contextRetrieval: memoryContextRetrieval,
    topK: memoryTopK,
    threshold: memoryThreshold
  })
```

3. 在 `prepareMessageAndChat` 管道中保存用户消息：

```typescript
const prepareMessageAndChat = async (textCtx: string, mediaCtx: ClipbordImg[] | string[], tools?: any[]): Promise<ChatPipelineContext> => {
  // ... 现有代码：构建 userMessageEntity 和保存消息
  const usrMsgId = await saveMessage(userMessageEntity) as number

  // 保存用户消息到记忆（异步，不阻塞）
  if (currChatId) {
    memory.saveMessage(currChatId, usrMsgId, 'user', textCtx.trim()).catch(err => {
      console.error('[Memory] Failed to save user message:', err)
    })
  }

  // ... 剩余代码
}
```

4. 在 `buildRequest` 管道中检索上下文并注入到提示中：

```typescript
const buildRequest = async (context: ChatPipelineContext, prompt: string): Promise<ChatPipelineContext> => {
  console.log('workspacePath', context.workspacePath)

  // 检索相关上下文（如果启用）
  let memoryContext: string | null = null
  if (memoryEnabled && memoryContextRetrieval) {
    try {
      memoryContext = await memory.retrieveContext(
        context.textCtx,
        context.currChatId
      )
      if (memoryContext) {
        console.log(`[Memory] Retrieved ${memory.retrievedCount} relevant memories`)
      }
    } catch (error) {
      console.error('[Memory] Failed to retrieve context:', error)
    }
  }

  // 构建系统提示（添加记忆上下文）
  let systemPrompts = [systemPromptBuilder(context.workspacePath)]
  if (memoryContext) {
    systemPrompts = [memoryContext, ...systemPrompts]
  }
  if (prompt) {
    systemPrompts = [prompt, ...systemPrompts]
  }

  // ... 剩余代码
  return context
}
```

5. 在 `finalize` 管道中保存 AI 响应：

```typescript
const finalize = async (context: ChatPipelineContext): Promise<void> => {
  setLastMsgStatus(true)
  setReadStreamState(false)

  // ... 现有代码：生成标题和保存消息
  if (context.gatherContent || context.gatherReasoning) {
    context.sysMessageEntity.body.model = context.model.name
    const sysMsgId = await saveMessage(context.sysMessageEntity) as number

    // 保存 AI 响应到记忆（异步，不阻塞）
    if (context.currChatId && context.gatherContent) {
      memory.saveMessage(
        context.currChatId,
        sysMsgId,
        'assistant',
        context.gatherContent
      ).catch(err => {
        console.error('[Memory] Failed to save assistant message:', err)
      })
    }

    // ... 剩余代码
  }
}
```

6. 更新管道上下文接口（可选，用于传递 Memory 状态）：

```typescript
interface ChatPipelineContext {
  // ... 现有字段

  // Memory 相关
  memoryRetrievedCount?: number
  memoryUsed?: boolean
}
```

7. 在构建请求后更新上下文：

```typescript
const buildRequest = async (context: ChatPipelineContext, prompt: string): Promise<ChatPipelineContext> => {
  // ... 检索上下文代码

  context.memoryRetrievedCount = memory.retrievedCount
  context.memoryUsed = !!memoryContext

  // ... 剩余代码
  return context
}
```

#### 步骤 4：添加 UI 指示器（可选但推荐）

在 `ChatInputArea` 或 `ChatHeaderComponent` 中显示记忆状态：

```typescript
// 在组件中
const { memoryEnabled } = useAppConfigStore()

// 在 JSX 中
{memoryEnabled && (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className="text-xs">
          <i className="ri-brain-line mr-1"></i>
          Memory
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>Long-term memory enabled</p>
        <p className="text-xs text-gray-400">
          Automatically saves and retrieves context
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)}
```

### 涉及的文件

- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/hooks/useMemory.ts` - 新建 Memory Hook
- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/hooks/chatRun/useChatRun.ts` - 集成 Memory 到聊天流程
- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/store/appConfig.ts` - 添加 Memory 配置状态
- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/components/chat/ChatInputArea.tsx` - 添加 UI 指示器（可选）

### 验收标准

- [ ] 用户发送消息时自动保存到记忆（如果启用）
- [ ] AI 响应消息自动保存到记忆（如果启用）
- [ ] 发送新消息前自动检索相关历史上下文（如果启用）
- [ ] 检索到的上下文正确注入到系统提示中
- [ ] UI 显示记忆功能状态（启用/禁用）
- [ ] UI 显示检索到的记忆数量（如果有）
- [ ] 禁用记忆功能时不影响正常聊天
- [ ] 错误情况下（如 Memory 服务不可用）不阻塞聊天流程

### 技术考虑

#### 1. 何时触发记忆保存？
**推荐方案：** 在消息成功保存到本地数据库后立即触发

- ✅ 优点：确保消息 ID 已生成，不会重复保存
- ✅ 优点：与现有流程一致
- ❌ 缺点：异步操作可能导致短暂延迟

**实现细节：**
- 使用 `catch` 处理错误，不阻塞主流程
- 使用 `console.error` 记录失败，方便调试

#### 2. 如何避免重复保存？
- 每个 Memory 条目都有唯一的 `id`，由 `chatId_messageId_timestamp` 组成
- MemoryService 使用 SQLite 的 PRIMARY KEY 约束防止重复
- 在调用 `saveMessage` 前检查消息是否已存在（可选优化）

#### 3. 上下文检索的触发时机
**推荐方案：** 在 `buildRequest` 阶段，构建最终请求之前

- ✅ 优点：此时已有完整的用户输入
- ✅ 优点：可以根据用户输入检索最相关的上下文
- ✅ 优点：不影响 UI 的即时响应

#### 4. 相似度阈值设置
**推荐默认值：** `0.6`

- `0.3-0.5`：宽松，可能包含不太相关的内容
- `0.6-0.7`：**推荐**，平衡相关性和召回率
- `0.8-0.9`：严格，只返回高度相关的内容

#### 5. TopK 数量设置
**推荐默认值：** `5`

- `1-3`：轻量级，适合简短对话
- `5-7`：**推荐**，适合大多数场景
- `8-10`：重量级，适合复杂长对话（注意 token 消耗）

#### 6. 如何处理检索失败？
- 使用 `try-catch` 包裹检索逻辑
- 检索失败时返回 `null`，不注入上下文
- 记录错误日志但不阻塞聊天流程
- 在 UI 中可选地显示错误提示（不推荐中断用户）

#### 7. 性能优化
- **批量保存**：如果需要导入历史对话，使用 `addBatchMemories`
- **异步处理**：保存和检索都是异步的，使用 `catch` 处理错误
- **索引优化**：MemoryService 已创建必要的数据库索引
- **缓存策略**：可以考虑在内存中缓存最近检索的结果（未来优化）

### 潜在风险与解决方案

| 风险 | 影响 | 解决方案 |
|------|------|----------|
| Memory 服务不可用 | 聊天流程中断 | 使用 try-catch，失败时静默降级 |
| 检索延迟过高 | 用户体验下降 | 显示加载指示器，设置超时机制 |
| Token 消耗过多 | 成本增加 | 限制 TopK 数量，截断过长内容 |
| 重复保存消息 | 数据冗余 | 使用唯一 ID，数据库约束防止重复 |

---

## 任务 3：添加 Memory 配置选项到设置界面

### 目标

在应用设置中添加 Memory 功能的配置选项，让用户可以控制和管理记忆功能。

### 优先级

🟢 **低** - UI 增强，依赖任务 1 和 2

### 预估时间

⏱️ 1.5-2 小时

### 实现步骤

#### 步骤 1：在设置面板中添加 Memory 标签

编辑 `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/components/settings/SettingsPanel.tsx`：

1. 在 `preferenceTabs` 数组中添加 Memory 标签：

```typescript
const preferenceTabs = [
  {
    value: 'provider-list',
    label: 'Providers',
    icon: <Server className="w-3 h-3" />
  },
  {
    value: 'tool',
    label: 'Tool',
    icon: <Wrench className="w-3 h-3" />
  },
  {
    value: 'mcp-server',
    label: 'MCP Server',
    icon: <Plug className="w-3 h-3" />
  },
  {
    value: 'memory',
    label: 'Memory',
    icon: <Brain className="w-3 h-3" />  // 需要导入 Brain 图标
  }
]
```

2. 导入 Brain 图标（如果需要）：

```typescript
import { Brain, Check, ChevronsUpDown, Plug, Server, Trash, Wrench } from "lucide-react"
```

#### 步骤 2：从 Store 中获取 Memory 配置状态

在组件顶部添加：

```typescript
const {
  // ... 现有状态
  memoryEnabled,
  setMemoryEnabled,
  memoryAutoSave,
  setMemoryAutoSave,
  memoryContextRetrieval,
  setMemoryContextRetrieval,
  memoryTopK,
  setMemoryTopK,
  memoryThreshold,
  setMemoryThreshold,
} = useAppConfigStore()

// 本地状态
const [memoryStats, setMemoryStats] = useState<{
  totalMemories: number
  totalChats: number
  memoriesByChat: Array<{ chatId: number; count: number }>
}>({
  totalMemories: 0,
  totalChats: 0,
  memoriesByChat: []
})

const [isLoadingStats, setIsLoadingStats] = useState(false)
const [localMemoryTopK, setLocalMemoryTopK] = useState(memoryTopK)
const [localMemoryThreshold, setLocalMemoryThreshold] = useState(memoryThreshold)
```

#### 步骤 3：添加统计信息加载函数

```typescript
// 加载 Memory 统计信息
const loadMemoryStats = useCallback(async () => {
  setIsLoadingStats(true)
  try {
    const stats = await window.memoryApi.getStats()
    setMemoryStats(stats)
  } catch (error) {
    console.error('[Memory] Failed to load stats:', error)
    toast.error('Failed to load memory statistics')
  } finally {
    setIsLoadingStats(false)
  }
}, [])

// 当切换到 Memory 标签时加载统计
useEffect(() => {
  if (activeTab === 'memory') {
    loadMemoryStats()
  }
}, [activeTab, loadMemoryStats])

// 同步本地状态到 store
useEffect(() => {
  setLocalMemoryTopK(memoryTopK)
  setLocalMemoryThreshold(memoryThreshold)
}, [memoryTopK, memoryThreshold])
```

#### 步骤 4：添加 Memory TabsContent

```typescript
<TabsContent value="memory" className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
  <div className='w-full h-full overflow-y-auto space-y-4 p-1'>

    {/* Memory 功能总开关 */}
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className="p-5 flex items-start gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="toggle-memory" className="text-base font-medium text-gray-900 dark:text-gray-100">
              Enable Memory
            </Label>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
              AI
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Enable long-term memory to automatically save and retrieve relevant context from past conversations.
          </p>
        </div>
        <Switch
          checked={memoryEnabled}
          onCheckedChange={setMemoryEnabled}
          id="toggle-memory"
          className="data-[state=checked]:bg-purple-600 mt-1"
        />
      </div>
    </div>

    {/* 自动保存消息 */}
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between gap-6">
        <div className="flex-1 space-y-1">
          <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
            Auto-save Messages
          </Label>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Automatically save user and AI messages to memory for future context retrieval.
          </p>
        </div>
        <Switch
          checked={memoryAutoSave}
          onCheckedChange={setMemoryAutoSave}
          disabled={!memoryEnabled}
          className="data-[state=checked]:bg-purple-600"
        />
      </div>
    </div>

    {/* 上下文检索 */}
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between gap-6">
        <div className="flex-1 space-y-1">
          <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
            Context Retrieval
          </Label>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Automatically retrieve relevant historical context when starting a new conversation.
          </p>
        </div>
        <Switch
          checked={memoryContextRetrieval}
          onCheckedChange={setMemoryContextRetrieval}
          disabled={!memoryEnabled}
          className="data-[state=checked]:bg-purple-600"
        />
      </div>
    </div>

    {/* 相似度阈值滑块 */}
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs p-5 hover:shadow-md transition-all duration-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-1">
            <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
              Similarity Threshold
            </Label>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Minimum similarity score (0.3-0.9) to consider a memory relevant. Higher values = stricter matching.
            </p>
          </div>
          <Badge variant="outline" className="text-sm font-mono">
            {localMemoryThreshold.toFixed(2)}
          </Badge>
        </div>
        <Slider
          value={[localMemoryThreshold]}
          onValueChange={(values) => setLocalMemoryThreshold(values[0])}
          onValueCommit={(values) => setMemoryThreshold(values[0])}
          min={0.3}
          max={0.9}
          step={0.05}
          disabled={!memoryEnabled || !memoryContextRetrieval}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0.3 (Loose)</span>
          <span>0.6 (Balanced)</span>
          <span>0.9 (Strict)</span>
        </div>
      </div>
    </div>

    {/* TopK 数量滑块 */}
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs p-5 hover:shadow-md transition-all duration-200">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-1">
            <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
              Retrieval Count (Top-K)
            </Label>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Maximum number of relevant memories to retrieve (1-10). More results = more context but higher token usage.
            </p>
          </div>
          <Badge variant="outline" className="text-sm font-mono">
            {localMemoryTopK}
          </Badge>
        </div>
        <Slider
          value={[localMemoryTopK]}
          onValueChange={(values) => setLocalMemoryTopK(values[0])}
          onValueCommit={(values) => setMemoryTopK(values[0])}
          min={1}
          max={10}
          step={1}
          disabled={!memoryEnabled || !memoryContextRetrieval}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>1 (Minimal)</span>
          <span>5 (Balanced)</span>
          <span>10 (Maximum)</span>
        </div>
      </div>
    </div>

    {/* 统计信息 */}
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs p-5 hover:shadow-md transition-all duration-200">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
            Memory Statistics
          </Label>
          <Button
            onClick={loadMemoryStats}
            variant="outline"
            size="sm"
            disabled={isLoadingStats}
            className="shadow-xs"
          >
            {isLoadingStats ? (
              <>
                <i className="ri-loader-4-line animate-spin mr-1.5"></i>
                Loading...
              </>
            ) : (
              <>
                <i className="ri-refresh-line mr-1.5"></i>
                Refresh
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Total Memories
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {memoryStats.totalMemories}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Conversations
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {memoryStats.totalChats}
            </p>
          </div>
        </div>

        {memoryStats.memoriesByChat.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Memories per Chat (Top 5)
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {memoryStats.memoriesByChat.slice(0, 5).map((item) => (
                <div key={item.chatId} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900 rounded px-3 py-2">
                  <span className="text-gray-600 dark:text-gray-400 font-mono">
                    Chat #{item.chatId}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {item.count} memories
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {/* 危险操作区域 */}
    <div className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800 shadow-xs p-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-base font-medium text-red-900 dark:text-red-100">
            Danger Zone
          </Label>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-red-600 border-red-200 bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
            Irreversible
          </Badge>
        </div>
        <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed">
          These actions cannot be undone. Please proceed with caution.
        </p>
        <div className="flex gap-2 pt-1">
          <Button
            onClick={async () => {
              if (confirm('Are you sure you want to clear all memories? This action cannot be undone.')) {
                try {
                  await window.memoryApi.clearAll()
                  toast.success('All memories cleared')
                  await loadMemoryStats()
                } catch (error) {
                  console.error('[Memory] Failed to clear:', error)
                  toast.error('Failed to clear memories')
                }
              }
            }}
            variant="destructive"
            size="sm"
            className="shadow-xs"
          >
            <i className="ri-delete-bin-line mr-1.5"></i>
            Clear All Memories
          </Button>
          <Button
            onClick={async () => {
              try {
                // 调用数据库优化（通过 IPC）
                // 注意：需要在 MemoryService 中暴露 optimize 方法到 IPC
                toast.success('Database optimized')
              } catch (error) {
                console.error('[Memory] Failed to optimize:', error)
                toast.error('Failed to optimize database')
              }
            }}
            variant="outline"
            size="sm"
            className="shadow-xs"
          >
            <i className="ri-database-line mr-1.5"></i>
            Optimize Database
          </Button>
        </div>
      </div>
    </div>

  </div>
</TabsContent>
```

#### 步骤 5：更新 `saveConfigurationClick` 函数

在 `saveConfigurationClick` 函数中保存 Memory 配置：

```typescript
const saveConfigurationClick = (): void => {
  console.log('saveConfigurationClick', editProviderName, editProviderApiUrl, editProviderApiKey)
  console.log('saveConfigurationClick mcpServerConfig', mcpServerConfig)

  // ... 现有代码

  const updatedAppConfig = {
    ...appConfig,
    providers: providers,
    tools: {
      ...appConfig.tools,
      titleGenerateModel: titleGenerateModel,
      titleGenerateEnabled: titleGenerateEnabled,
      maxWebSearchItems: maxWebSearchItems
    },
    memory: {
      enabled: memoryEnabled,
      autoSave: memoryAutoSave,
      contextRetrieval: memoryContextRetrieval,
      topK: memoryTopK,
      threshold: memoryThreshold
    },
    mcp: {
      ...JSON.parse(msConfig)
    }
  }

  setAppConfig(updatedAppConfig)

  toast.success('Save configurations success')
}
```

### 涉及的文件

- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/components/settings/SettingsPanel.tsx` - 添加 Memory 设置面板
- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/store/appConfig.ts` - （已在任务 2 中修改）
- `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/db/ConfigRepository.ts` - （无需修改，自动持久化）

### 验收标准

- [ ] Settings 中有独立的 Memory 标签页
- [ ] 所有配置项正常工作且实时生效
- [ ] 统计信息正确显示并可刷新
- [ ] 清空记忆功能有确认对话框且能正常工作
- [ ] 优化数据库功能正常工作
- [ ] 配置更改后点击 Save 按钮能正确保存到 IndexedDB
- [ ] 重启应用后配置能正确加载
- [ ] 禁用 Memory 时相关子选项也被禁用
- [ ] UI 样式与现有设置页面保持一致

### 技术考虑

#### 1. 配置持久化
- Memory 配置存储在 `appConfig.memory` 对象中
- ConfigRepository 会自动持久化到 IndexedDB
- 使用 `saveConfigurationClick` 统一保存所有配置

#### 2. 实时生效 vs. 保存后生效
**推荐方案：** 混合模式

- **实时生效**：开关类配置（enabled, autoSave, contextRetrieval）
  - 优点：即时反馈，用户体验好
  - 实现：直接调用 setter，无需点击 Save

- **保存后生效**：数值类配置（topK, threshold）
  - 优点：避免频繁更新，性能更好
  - 实现：使用本地状态，点击 Save 后同步到 store

#### 3. 统计信息刷新策略
- 初次进入标签页时自动加载
- 提供手动刷新按钮
- 清空记忆后自动刷新
- 不需要实时刷新（避免性能问题）

#### 4. 危险操作的确认
- 使用浏览器原生 `confirm` 对话框（简单快速）
- 或使用自定义 Dialog 组件（更美观，未来优化）

#### 5. Slider 组件的使用
- 需要导入 Slider 组件（可能需要从 shadcn/ui 添加）
- 使用 `onValueChange` 实时更新本地状态（UI 反馈）
- 使用 `onValueCommit` 在松开鼠标时更新 store（减少更新频率）

### UI/UX 设计建议

1. **颜色方案**
   - 使用紫色系列（`purple-600`）表示 Memory 功能，与其他功能区分
   - 危险操作使用红色系列（`red-600`）

2. **布局**
   - 每个配置项独立卡片，清晰分隔
   - 使用 Badge 标注功能类型（AI, Data, Irreversible）
   - 统计信息使用网格布局，一目了然

3. **交互反馈**
   - 加载状态显示 Loading 动画
   - 操作成功/失败使用 Toast 提示
   - 禁用状态的视觉反馈（灰色、降低透明度）

4. **帮助文本**
   - 每个配置项都有清晰的说明
   - Slider 显示当前值和推荐范围
   - 统计信息标注单位

### 潜在风险与解决方案

| 风险 | 影响 | 解决方案 |
|------|------|----------|
| 统计加载慢 | UI 卡顿 | 使用 Loading 状态，异步加载 |
| 清空操作误触 | 数据丢失 | 添加确认对话框，明确警告 |
| 配置不生效 | 用户困惑 | 添加提示"记得保存更改" |
| Slider 组件缺失 | UI 无法渲染 | 从 shadcn/ui 添加 Slider 组件 |

---

## 优先级和依赖关系

```
任务 1: Preload API 暴露
   ↓ (必须完成)
任务 2: 聊天流程集成
   ↓ (可并行)
任务 3: 设置界面配置
```

**建议执行顺序：**
1. 先完成任务 1（30-45 分钟）
2. 再完成任务 2（2-3 小时）
3. 最后完成任务 3（1.5-2 小时）

**总预估时间：** 4-5.5 小时

---

## 预期成果

完成所有任务后，Memory 功能将具备以下能力：

1. **自动记忆保存**
   - 用户和 AI 的对话自动保存到向量数据库
   - 支持批量导入历史对话

2. **智能上下文检索**
   - 基于向量相似度检索相关历史上下文
   - 自动注入到系统提示中，帮助 AI 理解上下文

3. **灵活配置**
   - 用户可以自由启用/禁用 Memory 功能
   - 可调节相似度阈值和检索数量
   - 可查看统计信息和管理记忆数据

4. **良好的用户体验**
   - UI 清晰直观，配置简单
   - 错误处理完善，不影响正常聊天
   - 性能优化，不阻塞主流程

---

## 附录

### A. IAppConfig 类型扩展

需要在 `src/types/index.d.ts` 或相关类型定义文件中添加 Memory 配置类型：

```typescript
interface IAppConfig {
  version?: number
  providers?: IProvider[]
  tools?: {
    titleGenerateModel?: IModel
    titleGenerateEnabled?: boolean
    maxWebSearchItems?: number
  }
  mcp?: {
    mcpServers?: Record<string, any>
  }
  memory?: {
    enabled: boolean
    autoSave: boolean
    contextRetrieval: boolean
    topK: number
    threshold: number
  }
  configForUpdate?: any
}
```

### B. 添加 Slider 组件（如果缺失）

如果项目中没有 Slider 组件，需要从 shadcn/ui 添加：

```bash
npx shadcn-ui@latest add slider
```

或手动创建 `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/components/ui/slider.tsx`。

### C. 测试清单

完成所有任务后，建议进行以下测试：

- [ ] 发送消息后检查 Memory 数据库是否保存
- [ ] 发送相关问题后检查是否检索到历史上下文
- [ ] 禁用 Memory 后确认不再保存和检索
- [ ] 调整阈值和 TopK 后确认检索结果变化
- [ ] 清空记忆后确认数据库为空
- [ ] 重启应用后确认配置正确加载
- [ ] 在多个聊天中测试记忆隔离（chatId 过滤）
- [ ] 测试错误情况（如 Memory 服务不可用）

### D. 性能监控

建议在开发过程中监控以下性能指标：

- 记忆保存时间（应 < 100ms）
- 上下文检索时间（应 < 500ms）
- 数据库查询时间
- Token 消耗（检索上下文的 token 数量）

### E. 未来优化方向

1. **智能记忆筛选**
   - 根据消息重要性自动决定是否保存
   - 过滤重复或无意义的消息

2. **记忆压缩**
   - 定期压缩和归档旧记忆
   - 只保留摘要而非完整内容

3. **多模态记忆**
   - 支持图片、代码等多模态内容的记忆
   - 为不同类型内容使用不同的检索策略

4. **记忆可视化**
   - 显示记忆关系图
   - 可视化相似度分布

5. **记忆导出/导入**
   - 支持导出记忆数据
   - 支持从其他应用导入记忆

---

## 参考资料

- **MemoryService 实现：** `/Volumes/devdata/workspace/code/-i-ati/src/main/services/MemoryService.ts`
- **EmbeddingService 实现：** `/Volumes/devdata/workspace/code/-i-ati/src/main/services/EmbeddingService.ts`
- **IPC Handlers：** `/Volumes/devdata/workspace/code/-i-ati/src/main/main-ipc.ts`
- **当前 chat run 入口：** `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/hooks/chatRun/useChatRun.ts`
- **设置面板：** `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/components/settings/SettingsPanel.tsx`
- **配置管理：** `/Volumes/devdata/workspace/code/-i-ati/src/renderer/src/store/appConfig.ts`
