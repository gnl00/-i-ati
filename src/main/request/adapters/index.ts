
// 导出所有适配器
export { BaseAdapter } from './base'
export { OpenAIAdapter, OpenAIImage1Adapter } from './openai'
export { ClaudeAdapter } from './claude'
export { adapterManager } from './manager'

// 注册所有适配器
import { adapterManager } from './manager'
import { OpenAIAdapter, OpenAIImage1Adapter } from './openai'
import { ClaudeAdapter } from './claude'

// 初始化适配器注册
export function initializeAdapters() {
  // 注册 OpenAI 适配器
  adapterManager.register(new OpenAIAdapter())          // v1/chat/completions
  adapterManager.register(new OpenAIImage1Adapter())     // OpenAI Image1
  
  // 注册 Claude 适配器
  adapterManager.register(new ClaudeAdapter())          // v1/messages (当前标准)
  
  console.log('Registered adapters:', adapterManager.listAdapters())
}
