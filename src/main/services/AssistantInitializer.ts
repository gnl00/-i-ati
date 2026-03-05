/**
 * AssistantInitializer
 * 负责初始化内置 Assistants
 */

import DatabaseService from './DatabaseService'

/**
 * 内置 Assistants 定义
 * modelRef 使用占位符，用户首次使用时需要选择实际模型
 */
const BUILT_IN_ASSISTANTS: Omit<Assistant, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'CodeHelper',
    description: 'Helps you write, debug, and optimize code, providing best practice advice.',
    modelRef: {
      accountId: '__placeholder__',
      modelId: '__placeholder__'
    },
    systemPrompt: `你是一个专业的代码助手，擅长帮助用户编写高质量的代码。

你的职责：
- 编写清晰、可维护的代码
- 遵循最佳实践和设计模式
- 提供详细的代码注释和文档
- 帮助调试和优化代码性能
- 解释复杂的技术概念

工作原则：
- 代码质量优先，注重可读性和可维护性
- 考虑边界情况和错误处理
- 提供多种解决方案时说明优缺点
- 使用具体示例说明概念`,
    sortIndex: 0,
    isBuiltIn: true,
    isDefault: false
  },
  {
    name: 'WritingAssistant',
    description: 'Assists you in writing articles, documents, and various types of text content.',
    modelRef: {
      accountId: '__placeholder__',
      modelId: '__placeholder__'
    },
    systemPrompt: `你是一个专业的写作助手，擅长帮助用户创作各类文本内容。

你的职责：
- 协助撰写文章、报告、文档等
- 优化文本结构和表达方式
- 提供写作建议和修改意见
- 帮助润色和改进文字
- 适应不同的写作风格和场景

工作原则：
- 表达清晰准确，逻辑连贯
- 注重文章结构和层次
- 根据目标受众调整语言风格
- 保持内容的原创性和真实性`,
    sortIndex: 1,
    isBuiltIn: true,
    isDefault: false
  },
  {
    name: 'Translator',
    description: 'Provides accurate and authentic multilingual translation services.',
    modelRef: {
      accountId: '__placeholder__',
      modelId: '__placeholder__'
    },
    systemPrompt: `你是一个专业的翻译助手，擅长在多种语言之间进行准确翻译。

你的职责：
- 提供准确的多语言翻译
- 保持原文的语气和风格
- 确保译文地道自然
- 处理专业术语和习惯用语
- 根据上下文选择最佳表达

工作原则：
- 准确性第一，忠实原文含义
- 注重目标语言的表达习惯
- 保持专业术语的一致性
- 必要时提供多种翻译选项和说明`,
    sortIndex: 2,
    isBuiltIn: true,
    isDefault: false
  },
  {
    name: 'Instructor',
    description: 'Helps you learn new knowledge and explains complex concepts.',
    modelRef: {
      accountId: '__placeholder__',
      modelId: '__placeholder__'
    },
    systemPrompt: `你是一个专业的学习助手，擅长帮助用户理解和掌握新知识。

你的职责：
- 解释复杂的概念和原理
- 提供循序渐进的学习路径
- 使用类比和例子帮助理解
- 回答学习过程中的疑问
- 推荐学习资源和方法

工作原则：
- 从简单到复杂，循序渐进
- 使用通俗易懂的语言
- 提供具体的例子和应用场景
- 鼓励主动思考和实践`,
    sortIndex: 3,
    isBuiltIn: true,
    isDefault: false
  }
]

/**
 * 生成 Assistant ID
 * 使用时间戳 + 随机数确保唯一性
 */
function generateAssistantId(): string {
  return `assistant_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 初始化内置 Assistants
 * 在应用启动时调用，检查是否已存在内置助手，避免重复创建
 */
export async function initializeBuiltInAssistants(): Promise<void> {
  try {
    console.log('[AssistantInitializer] Starting initialization of built-in assistants')
    // await DatabaseService.deleteAllAssistants()

    // 获取所有现有的 assistants
    const existingAssistants = await DatabaseService.getAllAssistants()
    // console.log(JSON.stringify(existingAssistants));

    // 检查是否已有内置助手
    const hasBuiltInAssistants = existingAssistants.some(a => a.isBuiltIn)

    if (hasBuiltInAssistants) {
      console.log('[AssistantInitializer] Built-in assistants already exist, skipping initialization')
      return
    }

    // 创建所有内置助手
    console.log(`[AssistantInitializer] Creating ${BUILT_IN_ASSISTANTS.length} built-in assistants`)
    const now = Date.now()

    for (const assistantData of BUILT_IN_ASSISTANTS) {
      const assistant: Assistant = {
        ...assistantData,
        id: generateAssistantId(),
        createdAt: now,
        updatedAt: now
      }

      await DatabaseService.saveAssistant(assistant)
      console.log(`[AssistantInitializer] Created assistant: ${assistant.name} (${assistant.id})`)
    }

    console.log('[AssistantInitializer] Successfully initialized all built-in assistants')
  } catch (error) {
    console.error('[AssistantInitializer] Failed to initialize built-in assistants:', error)
    throw error
  }
}
