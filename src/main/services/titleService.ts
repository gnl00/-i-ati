import { unifiedChatRequest } from '@request/index'

const providerTypeMap: Record<string, ProviderType> = {
  'Anthropic': 'claude',
  'Claude': 'claude'
}

function generateTitlePrompt(content: string): string {
  return `你是聊天标题生成专家。根据用户输入的内容，生成简洁准确的标题。

## 核心原则

**IMPORTANT**: 只输出标题文本，不要有任何额外的解释、标记或格式。

## 输出规则（STRICT）

**内容要求**:
- ✅ **唯一输出**：仅输出一行标题，不包含其他内容
- ✅ **简洁明了**：
  - 英文标题：≤ 12 个单词
  - 中文标题：≤ 18 个字符
- ✅ **语言一致**：与用户首条消息使用相同的语言
- ✅ **默认标题**：如果内容为空或不清晰，输出 \`New Chat\`

**格式禁止**:
- ❌ 不要使用 Markdown 格式（如 \`\`\`、\`**\`、\`#\` 等）
- ❌ 不要添加引号（单引号或双引号）
- ❌ 不要使用代码块（code fences）
- ❌ 不要使用列表符号（bullets）
- ❌ 不要输出任何解释或推理过程

## 示例参考

\`\`\`
用户: "优化 markdown 动画性能，改用 CSS transition"
标题: Markdown 动画性能优化

用户: "Fix build error in vite config"
标题: Fix Vite build error

用户: "如何使用 React Server Components？"
标题: React Server Components 使用

用户: "Create a RESTful API with Node.js"
标题: Node.js RESTful API 创建

## 用户输入内容
${content}
`
}

export async function generateTitle(
  content: string,
  model: IModel,
  provider: IProvider
): Promise<string> {
  const providerType = providerTypeMap[provider.name] || 'openai'

  const titleReq: IUnifiedRequest = {
    providerType,
    apiVersion: 'v1',
    baseUrl: provider.apiUrl,
    apiKey: provider.apiKey,
    model: model.value,
    prompt: generateTitlePrompt(content),
    messages: [{ role: 'user', content, segments: [] }],
    stream: false,
    options: {
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.7
    }
  }

  const response = await unifiedChatRequest(titleReq, null, () => {}, () => {})
  return response.content
}
