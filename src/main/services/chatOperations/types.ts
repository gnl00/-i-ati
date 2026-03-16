import type { CompressionJob } from '@main/services/CompressionService'

export type ChatCompressionExecuteInput = CompressionJob & {
  submissionId?: string
}

export type ChatTitleGenerateInput = {
  submissionId?: string
  chatId?: number
  chatUuid?: string
  content: string
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
}
