import { unifiedChatRequest } from '@request/index'
import { generateTitlePrompt } from '@shared/prompts'

const providerTypeMap: Record<string, ProviderType> = {
  'Anthropic': 'claude',
  'Claude': 'claude'
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
    prompt: '',
    messages: [{ role: 'user', content: generateTitlePrompt(content), segments: [] }],
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
