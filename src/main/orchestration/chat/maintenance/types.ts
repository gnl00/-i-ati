import type { CompressionJob } from './MessageCompressionService'

export type CompressionExecutionInput = CompressionJob & {
  submissionId?: string
}

export type TitleGenerationInput = {
  submissionId?: string
  chatId?: number
  chatUuid?: string
  content: string
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
}
