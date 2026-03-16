# IndexedDB 到 SQLite 迁移实施计划

## 概述

将消息存储从 IndexedDB 替换为 SQLite，作为 breaking change 实施，不考虑数据迁移。

## 用户决策

- ✅ 完全移除 IndexedDB，只使用 SQLite
- ✅ Breaking change，不考虑数据迁移
- ✅ 简化实现，直接替换

## 架构设计

### 整体架构

```
Renderer Process (React)
  ↓
  Repository Layer (保持 API 不变)
  ↓
  IPC Invoker
  ↓
Main Process (Electron)
  ↓
  DatabaseService (SQLite)
```

### 为什么选择主进程 SQLite？

1. **已有成功案例**: MemoryService.ts 已在主进程使用 better-sqlite3
2. **性能优势**: better-sqlite3 是同步 API，性能最佳
3. **数据安全**: 主进程更好地控制数据库文件
4. **跨平台兼容**: better-sqlite3 在主进程中跨平台支持稳定
5. **统一架构**: 与现有 MemoryService 保持一致

## 数据库 Schema 设计

### 表结构

```sql
-- Chats 表
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  messages TEXT NOT NULL,  -- JSON array: [1,2,3]
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL
);

-- Messages 表
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER,
  chat_uuid TEXT,
  body TEXT NOT NULL,  -- JSON string of ChatMessage
  tokens INTEGER,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Configs 表
CREATE TABLE IF NOT EXISTS configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON string
  version INTEGER,
  updated_at INTEGER NOT NULL
);
```

### 索引设计

```sql
-- Chat 索引
CREATE INDEX IF NOT EXISTS idx_chats_uuid ON chats(uuid);
CREATE INDEX IF NOT EXISTS idx_chats_update_time ON chats(update_time DESC);

-- Message 索引
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_uuid ON messages(chat_uuid);
```

## 实施步骤

### 步骤 1: 创建 DatabaseService (主进程)

**文件**: `src/main/services/DatabaseService.ts` (新建)

**功能**:
- 单例模式管理 SQLite 连接
- 创建表和索引
- 提供所有 CRUD 操作
- 预编译语句缓存
- 事务支持

**参考**: `src/main/services/MemoryService.ts` 的实现模式

**关键方法**:
```typescript
class DatabaseService {
  // Chat 操作
  saveChat(data: ChatEntity): number
  getAllChats(): ChatEntity[]
  getChatById(id: number): ChatEntity | undefined
  updateChat(data: ChatEntity): void
  deleteChat(id: number): void

  // Message 操作
  saveMessage(data: MessageEntity): number
  getAllMessages(): MessageEntity[]
  getMessageById(id: number): MessageEntity | undefined
  getMessageByIds(ids: number[]): MessageEntity[]
  updateMessage(data: MessageEntity): void
  deleteMessage(id: number): void

  // Config 操作
  getConfig(): IAppConfig | undefined
  saveConfig(config: IAppConfig): void
  initConfig(): IAppConfig
}
```

### 步骤 2: 添加 IPC 常量

**文件**: `src/constants/index.ts` (修改)

**新增常量**:
```typescript
// Database Operations - Chat
export const DB_CHAT_SAVE = 'db:chat:save'
export const DB_CHAT_GET_ALL = 'db:chat:get-all'
export const DB_CHAT_GET_BY_ID = 'db:chat:get-by-id'
export const DB_CHAT_UPDATE = 'db:chat:update'
export const DB_CHAT_DELETE = 'db:chat:delete'

// Database Operations - Message
export const DB_MESSAGE_SAVE = 'db:message:save'
export const DB_MESSAGE_GET_ALL = 'db:message:get-all'
export const DB_MESSAGE_GET_BY_ID = 'db:message:get-by-id'
export const DB_MESSAGE_GET_BY_IDS = 'db:message:get-by-ids'
export const DB_MESSAGE_UPDATE = 'db:message:update'
export const DB_MESSAGE_DELETE = 'db:message:delete'

// Database Operations - Config
export const DB_CONFIG_GET = 'db:config:get'
export const DB_CONFIG_SAVE = 'db:config:save'
export const DB_CONFIG_INIT = 'db:config:init'
```

### 步骤 3: 注册 IPC Handlers

**文件**: `src/main/main-ipc.ts` (修改)

**新增 handlers**:
```typescript
import DatabaseService from './services/DatabaseService'

const dbService = DatabaseService.getInstance()

// Chat handlers
ipcMain.handle(DB_CHAT_SAVE, async (_event, data) => {
  return dbService.saveChat(data)
})

ipcMain.handle(DB_CHAT_GET_ALL, async () => {
  return dbService.getAllChats()
})

ipcMain.handle(DB_CHAT_GET_BY_ID, async (_event, id) => {
  return dbService.getChatById(id)
})

ipcMain.handle(DB_CHAT_UPDATE, async (_event, data) => {
  return dbService.updateChat(data)
})

ipcMain.handle(DB_CHAT_DELETE, async (_event, id) => {
  return dbService.deleteChat(id)
})

// Message handlers (类似结构)
// Config handlers (类似结构)
```

### 步骤 4: 创建 IPC Invoker 方法

**文件**: `src/renderer/src/invoker/ipcInvoker.ts` (修改)

**新增方法**:
```typescript
// ============ Database Operations - Chat ============
export async function invokeDbChatSave(data: ChatEntity): Promise<number> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_SAVE, data)
}

export async function invokeDbChatGetAll(): Promise<ChatEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_GET_ALL)
}

export async function invokeDbChatGetById(id: number): Promise<ChatEntity | undefined> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_GET_BY_ID, id)
}

export async function invokeDbChatUpdate(data: ChatEntity): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_UPDATE, data)
}

export async function invokeDbChatDelete(id: number): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_DELETE, id)
}

// ============ Database Operations - Message ============
export async function invokeDbMessageSave(data: MessageEntity): Promise<number> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_SAVE, data)
}

export async function invokeDbMessageGetByIds(ids: number[]): Promise<MessageEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_GET_BY_IDS, ids)
}

// ... 其他 Message 方法

// ============ Database Operations - Config ============
export async function invokeDbConfigGet(): Promise<IAppConfig | undefined> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CONFIG_GET)
}

export async function invokeDbConfigSave(config: IAppConfig): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CONFIG_SAVE, config)
}

export async function invokeDbConfigInit(): Promise<IAppConfig> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CONFIG_INIT)
}
```

### 步骤 5: 重写 Repository 层

**文件**: `src/renderer/src/db/ChatRepository.ts` (完全重写)

**新实现**:
```typescript
import {
  invokeDbChatSave,
  invokeDbChatGetAll,
  invokeDbChatGetById,
  invokeDbChatUpdate,
  invokeDbChatDelete
} from '@renderer/invoker/ipcInvoker'

export const saveChat = async (data: ChatEntity): Promise<number> => {
  return await invokeDbChatSave(data)
}

export const getAllChat = async (): Promise<ChatEntity[]> => {
  return await invokeDbChatGetAll()
}

export const getChatById = async (id: number): Promise<ChatEntity | undefined> => {
  return await invokeDbChatGetById(id)
}

export const updateChat = async (data: ChatEntity): Promise<void> => {
  return await invokeDbChatUpdate(data)
}

export const deleteChat = async (id: number): Promise<boolean> => {
  await invokeDbChatDelete(id)
  return true
}
```

**文件**: `src/renderer/src/db/MessageRepository.ts` (完全重写)

**文件**: `src/renderer/src/db/ConfigRepository.ts` (完全重写)

### 步骤 6: 删除 IndexedDB 相关代码

**文件**: `src/renderer/src/db/index.ts` (删除)

**说明**:
- 删除整个文件，不再需要 IndexedDB 初始化代码
- 移除 `idb` 依赖（可选，在 package.json 中）

### 步骤 7: 初始化 DatabaseService

**文件**: `src/main/index.ts` (修改)

**在 app.whenReady() 中添加**:
```typescript
import DatabaseService from './services/DatabaseService'

app.whenReady().then(async () => {
  // 初始化数据库
  await DatabaseService.getInstance().initialize()

  // 继续正常启动流程
  ipcSetup()
  createWindow()
})
```

### 步骤 8: 更新 ConfigRepository 初始化

**文件**: `src/renderer/src/store/appConfig.ts` (修改)

**修改初始化逻辑**:
```typescript
// 原来从 IndexedDB 加载
// const { initConfig } = await import('../db/ConfigRepository')

// 改为从 SQLite 加载（通过 IPC）
import { invokeDbConfigInit } from '../invoker/ipcInvoker'

export const initializeAppConfig = async () => {
  const config = await invokeDbConfigInit()
  useAppConfigStore.getState()._setAppConfig(config)
}
```

## 关键文件清单

### 需要新建的文件

1. **`src/main/services/DatabaseService.ts`**
   - SQLite 数据库服务
   - 单例模式
   - 所有 CRUD 操作
   - 参考 `MemoryService.ts` 实现

### 需要修改的文件

1. **`src/constants/index.ts`**
   - 添加数据库操作的 IPC 常量

2. **`src/main/main-ipc.ts`**
   - 注册数据库操作的 IPC handlers

3. **`src/main/index.ts`**
   - 在 app.whenReady() 中初始化 DatabaseService

4. **`src/renderer/src/invoker/ipcInvoker.ts`**
   - 添加数据库操作的 IPC invoker 方法

5. **`src/renderer/src/db/ChatRepository.ts`**
   - 完全重写，使用 IPC 调用替代 IndexedDB

6. **`src/renderer/src/db/MessageRepository.ts`**
   - 完全重写，使用 IPC 调用替代 IndexedDB

7. **`src/renderer/src/db/ConfigRepository.ts`**
   - 完全重写，使用 IPC 调用替代 IndexedDB

8. **`src/renderer/src/store/appConfig.ts`**
   - 修改配置初始化逻辑

### 需要删除的文件

1. **`src/renderer/src/db/index.ts`**
   - IndexedDB 初始化代码，不再需要

## 技术细节

### JSON 字段处理

**Messages 表的 body 字段**:
```typescript
// 存储时
const bodyJson = JSON.stringify(messageEntity.body)
db.prepare('INSERT INTO messages (body, ...) VALUES (?, ...)').run(bodyJson, ...)

// 读取时
const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
const message: MessageEntity = {
  ...row,
  body: JSON.parse(row.body)
}
```

**Chats 表的 messages 字段**:
```typescript
// 存储时
const messagesJson = JSON.stringify(chatEntity.messages) // [1,2,3]

// 读取时
const chat: ChatEntity = {
  ...row,
  messages: JSON.parse(row.messages)
}
```

### 数据库文件位置

```typescript
import { app } from 'electron'
import path from 'path'

const dbPath = path.join(app.getPath('userData'), 'chat.db')
```

**路径示例**:
- macOS: `~/Library/Application Support/at-i-app/chat.db`
- Windows: `%APPDATA%/at-i-app/chat.db`
- Linux: `~/.config/at-i-app/chat.db`

### 性能优化

1. **预编译语句缓存**:
```typescript
private stmts = {
  saveChat: this.db.prepare('INSERT INTO chats (...) VALUES (...)'),
  getChat: this.db.prepare('SELECT * FROM chats WHERE id = ?'),
  // ... 其他语句
}
```

2. **批量操作使用事务**:
```typescript
getMessageByIds(ids: number[]): MessageEntity[] {
  const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?')
  const transaction = this.db.transaction((ids: number[]) => {
    return ids.map(id => stmt.get(id))
  })
  return transaction(ids)
}
```

3. **WAL 模式**:
```typescript
this.db.pragma('journal_mode = WAL')
```

## 注意事项

### 1. Breaking Change 说明

- 这是一个 **breaking change**
- 用户升级后会丢失所有现有的聊天记录和消息
- 建议在发布说明中明确告知用户
- 可以提供手动导出/导入功能（可选）

### 2. 数据库初始化时机

- 必须在 `app.whenReady()` 中初始化 DatabaseService
- 必须在 `ipcSetup()` 之前完成初始化
- 确保数据库文件目录存在

### 3. IPC 通信注意事项

- 所有数据库操作都是异步的（通过 IPC）
- 大对象传输可能有性能开销
- 考虑批量操作减少 IPC 调用次数

### 4. 类型安全

- 确保 IPC 传输的数据类型与 TypeScript 定义一致
- JSON 序列化/反序列化可能丢失类型信息
- 在 DatabaseService 中进行类型转换和验证

### 5. 错误处理

- 数据库操作失败时抛出异常
- IPC handler 中捕获异常并返回错误信息
- 渲染进程中处理错误并显示给用户

### 6. 跨平台兼容性

- better-sqlite3 需要原生编译
- 确保 electron-builder 配置正确
- 数据库文件路径使用 `app.getPath('userData')`

## 测试策略

### 手动测试清单

1. **基础功能测试**
   - [ ] 创建新聊天
   - [ ] 发送消息
   - [ ] 查看聊天历史
   - [ ] 编辑消息
   - [ ] 删除聊天
   - [ ] 应用配置保存和加载

2. **性能测试**
   - [ ] 创建 100 条消息，测试加载速度
   - [ ] 测试批量操作性能
   - [ ] 测试应用启动时间

3. **边界测试**
   - [ ] 空数据库启动
   - [ ] 大量数据（1000+ 消息）
   - [ ] 特殊字符和 emoji
   - [ ] 长文本消息

4. **错误处理测试**
   - [ ] 数据库文件被锁定
   - [ ] 磁盘空间不足
   - [ ] 权限问题

## 实施顺序建议

按照以下顺序实施可以最小化风险，便于逐步测试：

### 阶段 1: 基础设施搭建

1. 创建 `DatabaseService.ts`
2. 添加 IPC 常量到 `constants/index.ts`
3. 在 `main/index.ts` 中初始化 DatabaseService
4. 测试数据库文件是否正确创建

### 阶段 2: IPC 通信层

1. 在 `main-ipc.ts` 中注册所有 IPC handlers
2. 在 `ipcInvoker.ts` 中添加所有 invoker 方法
3. 测试 IPC 通信是否正常

### 阶段 3: Repository 层改造

1. 重写 `ConfigRepository.ts`（最简单，先测试）
2. 重写 `ChatRepository.ts`
3. 重写 `MessageRepository.ts`
4. 删除 `db/index.ts`

### 阶段 4: 应用集成

1. 修改 `appConfig.ts` 的初始化逻辑
2. 测试应用启动和配置加载
3. 测试完整的聊天流程

### 阶段 5: 清理和优化

1. 移除 `idb` 依赖（可选）
2. 性能优化和调试
3. 完整测试

## 预期收益

### 性能提升

- **复杂查询**: SQLite 支持 JOIN、索引等，查询性能更好
- **批量操作**: 事务支持使批量插入更快
- **关联查询**: 可以直接通过 SQL JOIN 获取聊天和消息

### 架构优势

- **统一存储**: 与 MemoryService 使用相同的技术栈
- **数据完整性**: 外键约束保证数据一致性
- **备份简单**: 单个 SQLite 文件，易于备份和迁移
- **跨平台**: better-sqlite3 跨平台支持稳定

### 开发体验

- **SQL 查询**: 使用标准 SQL，更灵活强大
- **调试工具**: 可以使用 SQLite 客户端直接查看数据
- **类型安全**: TypeScript 类型定义更清晰

## 风险评估

### 高风险项

- ✅ **数据丢失**: Breaking change，用户会丢失数据（已确认可接受）

### 中风险项

- ⚠️ **IPC 性能**: 频繁的 IPC 调用可能影响性能
  - 缓解: 使用批量操作，减少调用次数

- ⚠️ **类型安全**: JSON 序列化可能丢失类型信息
  - 缓解: 在 DatabaseService 中严格类型转换

### 低风险项

- ✅ **跨平台兼容**: better-sqlite3 已在 MemoryService 中验证
- ✅ **数据库初始化**: 参考 MemoryService 的成熟实现

## 总结

这个迁移方案采用了**主进程 SQLite + IPC 通信**的架构，具有以下特点：

1. **简洁明了**: 不考虑数据迁移，实现简单
2. **架构统一**: 与现有 MemoryService 保持一致
3. **性能优秀**: SQLite 在复杂查询和批量操作上更优
4. **易于维护**: 单一数据库文件，备份和调试方便
5. **渐进实施**: 分 5 个阶段，每个阶段可独立测试

**关键成功因素**:
- 严格按照实施顺序执行
- 每个阶段完成后进行充分测试
- 参考 MemoryService.ts 的实现模式
- 保持 Repository API 不变，对上层透明

