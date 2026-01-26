import { unifiedChatRequest } from '@request/index'
import { generateTitlePrompt } from '@shared/prompts'

export async function generateTitle(
  content: string,
  model: AccountModel,
  account: ProviderAccount,
  providerDefinition: ProviderDefinition
): Promise<string> {
  const titleReq: IUnifiedRequest = {
    providerType: providerDefinition.adapterType,
    apiVersion: providerDefinition.apiVersion,
    baseUrl: account.apiUrl,
    apiKey: account.apiKey,
    model: model.id,
    prompt: '',
    messages: [{ role: 'user', content: generateTitlePrompt(content), segments: [] }],
    stream: false
  }

  const response = await unifiedChatRequest(titleReq, null, () => {}, () => {})
  return response.content
}
