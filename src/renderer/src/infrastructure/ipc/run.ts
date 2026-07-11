import {
  RUN_CANCEL,
  RUN_COMPRESSION_EXECUTE,
  RUN_PERMISSION_APPROVAL_MODE_UPDATE,
  RUN_START,
  RUN_TITLE_GENERATE,
  RUN_TOOL_CONFIRM
} from '@shared/constants/index'
import { invokeIpc } from './client'

export const invokeRunStart = (data: {
  submissionId: string
  input: {
    textCtx: string
    mediaCtx: ClipbordImg[] | string[]
    tools?: unknown[]
    userInstruction?: string
    options?: IUnifiedRequest['options']
    stream?: boolean
    chatUserInstruction?: string
    permissionApprovalMode?: PermissionApprovalMode
  }
  modelRef: ModelRef
  chatModelRef?: ModelRef
  chatId?: number
  chatUuid?: string
}): Promise<{ accepted: boolean; submissionId: string }> => invokeIpc(RUN_START, data)

export const invokeRunCancel = (data: { submissionId: string; reason?: string }): Promise<{ cancelled: boolean }> =>
  invokeIpc(RUN_CANCEL, data)
export const invokeRunToolConfirm = (data: { toolCallId: string; approved: boolean; reason?: string; args?: unknown }): Promise<{ ok: boolean }> =>
  invokeIpc(RUN_TOOL_CONFIRM, data)
export const invokeRunPermissionApprovalModeUpdate = (data: { chatUuid: string; permissionApprovalMode: PermissionApprovalMode }): Promise<{ updated: boolean }> =>
  invokeIpc(RUN_PERMISSION_APPROVAL_MODE_UPDATE, data)
export const invokeRunCompressionExecute = (data: {
  submissionId: string
  chatId: number
  chatUuid: string
  messages: MessageEntity[]
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
  config?: CompressionConfig
}): Promise<CompressionResult> => invokeIpc(RUN_COMPRESSION_EXECUTE, data)
export const invokeRunTitleGenerate = (data: {
  submissionId: string
  chatId?: number
  chatUuid?: string
  content: string
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
}): Promise<{ title: string }> => invokeIpc(RUN_TITLE_GENERATE, data)
