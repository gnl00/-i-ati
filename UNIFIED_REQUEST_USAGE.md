# 统一请求接口使用指南

## 概述

统一请求接口设计用于兼容不同大模型提供商的API变化，通过适配器模式实现对不同API版本和响应格式的支持。

## 支持的提供商和版本

### OpenAI
- **v1** (`openai-v1`): `v1/chat/completions` (标准格式)
- **v2** (`openai-v2`): `v1/response` (通用响应格式)

### Claude
- **v1** (`claude-v1`): `v1/messages` (当前标准 Messages API)
- **chat** (`claude-chat`): `v1/chat/completions` (兼容 OpenAI 格式)
- **legacy** (`claude-legacy`): `v1/complete` (旧版完成接口)

### Azure OpenAI
- **v1** (`azure-openai-v1`): Azure OpenAI 格式

## 配置提供商

在提供商配置中指定 `apiVersion` 来选择使用的API版本：

```typescript
const provider: IProvider = {
  name: "OpenAI GPT-4",
  type: "openai",      // 标准类型
  apiUrl: "https://api.openai.com",
  apiKey: "your-api-key",
  apiVersion: "v2",    // 指定使用 v2 版本
  models: [...]
}

const claudeProvider: IProvider = {
  name: "Claude 3.5 Sonnet",
  type: "claude",
  apiUrl: "https://api.anthropic.com",
  apiKey: "your-api-key",
  apiVersion: "v1",    // 使用新的 Messages API
  models: [...]
}
```

## 使用统一请求接口

### 基本用法

```typescript
import { unifiedChatRequest } from '@request/index'

const request: IUnifiedChatRequest = {
  providerType: 'openai',
  providerName: 'OpenAI GPT-4',
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  apiKey: 'your-api-key',
  baseUrl: 'https://api.openai.com',
  stream: true,
  apiVersion: 'v2'  // 使用新版本接口
}

const response = await unifiedChatRequest(
  request,
  signal,
  beforeFetch,
  afterFetch
)
```

### 流式响应处理

```typescript
if (response instanceof UnifiedStreamProcessor) {
  await response.processStream({
    onDelta: (delta) => {
      console.log('Content:', delta.content)
      console.log('Reasoning:', delta.reasoning)
    },
    onComplete: (response) => {
      console.log('Stream complete:', response.id)
    },
    onError: (error) => {
      console.error('Stream error:', error)
    }
  })
}
```

## API版本兼容性

### OpenAI API 变化

#### v1 (传统格式)
- 端点: `v1/chat/completions`
- 响应格式: `{ choices: [{ message: { content: "..." } }] }`

#### v2 (新格式)
- 端点: `v1/response`
- 响应格式: `{ response_id: "...", text: "...", usage: {...} }`

### Claude API 变化

#### Legacy (旧版)
- 端点: `v1/complete`
- 格式: `{ prompt: "Human: ...\n\nAssistant:", completion: "..." }`

#### Chat (兼容格式)
- 端点: `v1/chat/completions`
- 格式: 类似 OpenAI 的聊天完成格式

#### v1 (当前标准)
- 端点: `v1/messages`
- 格式: `{ messages: [...], content: [...] }`

## 向后兼容

系统提供了向后兼容支持：

```typescript
// 新的统一接口（推荐）
const onSubmit = async (textCtx, mediaCtx, tools) => {
  // 使用统一请求处理
}

// 旧接口兼容
const onSubmitLegacy = async (textCtx, mediaCtx, tools) => {
  // 使用旧的请求处理方式
}
```

## 错误处理

统一接口提供了标准化的错误处理：

```typescript
try {
  const response = await unifiedChatRequest(request, signal, beforeFetch, afterFetch)
} catch (error) {
  console.error('Request failed:', error.message)
  // error.message 会包含提供商特定的错误信息
}
```

## 扩展新的提供商

要添加新的提供商支持，需要：

1. 创建适配器类继承 `BaseAdapter`
2. 实现必要的方法
3. 在 `initializeAdapters()` 中注册

```typescript
export class NewProviderAdapter extends BaseAdapter {
  providerType: ProviderType = 'new-provider'
  apiVersion = 'v1'
  
  getEndpoint(baseUrl: string): string {
    return `${baseUrl}/api/chat`
  }
  
  transformRequest(req: IUnifiedChatRequest): any {
    // 转换请求格式
  }
  
  transformResponse(response: any): IUnifiedResponse {
    // 转换响应格式
  }
  
  parseStreamChunk(chunk: string): IUnifiedStreamResponse | null {
    // 解析流式响应
  }
}
```

## 最佳实践

1. **版本选择**: 优先使用最新的稳定版本
2. **错误处理**: 始终包含适当的错误处理逻辑
3. **流式处理**: 对于长响应优先使用流式处理
4. **兼容性**: 在升级API版本前测试兼容性
5. **配置管理**: 集中管理API版本配置