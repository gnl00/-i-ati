// 导出所有适配器
export { BaseAdapter } from './base'
export { OpenAIAdapter, OpenAIV2Adapter, AzureOpenAIAdapter } from './openai'
export { ClaudeAdapter, ClaudeChatAdapter, ClaudeLegacyAdapter } from './claude'
export { adapterManager } from './manager'

// 注册所有适配器
import { adapterManager } from './manager'
import { OpenAIAdapter, OpenAIV2Adapter, AzureOpenAIAdapter } from './openai'
import { ClaudeAdapter, ClaudeChatAdapter, ClaudeLegacyAdapter } from './claude'

// 初始化适配器注册
export function initializeAdapters() {
  // 注册 OpenAI 适配器 (v1 和 v2)
  adapterManager.register(new OpenAIAdapter())          // v1/chat/completions
  adapterManager.register(new OpenAIV2Adapter())        // v1/response (新格式)
  adapterManager.register(new AzureOpenAIAdapter())     // Azure OpenAI
  
  // 注册 Claude 适配器 (v1, chat, legacy)
  adapterManager.register(new ClaudeAdapter())          // v1/messages (当前标准)
  adapterManager.register(new ClaudeChatAdapter())      // v1/chat/completions (兼容格式)
  adapterManager.register(new ClaudeLegacyAdapter())    // v1/complete (旧格式)
  
  console.log('Registered adapters:', adapterManager.listAdapters())
}

// 自动初始化
initializeAdapters()