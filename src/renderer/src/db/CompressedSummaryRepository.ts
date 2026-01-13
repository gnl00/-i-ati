import {
  invokeDbCompressedSummarySave,
  invokeDbCompressedSummaryGetByChatId,
  invokeDbCompressedSummaryGetActiveByChatId,
  invokeDbCompressedSummaryUpdateStatus,
  invokeDbCompressedSummaryDelete
} from '@renderer/invoker/ipcInvoker'

/**
 * 保存压缩摘要
 */
const saveCompressedSummary = async (data: CompressedSummaryEntity): Promise<number> => {
  return await invokeDbCompressedSummarySave(data)
}

/**
 * 获取聊天的所有压缩摘要
 */
const getCompressedSummariesByChatId = async (chatId: number): Promise<CompressedSummaryEntity[]> => {
  return await invokeDbCompressedSummaryGetByChatId(chatId)
}

/**
 * 获取聊天的活跃压缩摘要
 */
const getActiveCompressedSummariesByChatId = async (chatId: number): Promise<CompressedSummaryEntity[]> => {
  return await invokeDbCompressedSummaryGetActiveByChatId(chatId)
}

/**
 * 更新压缩摘要状态
 */
const updateCompressedSummaryStatus = async (
  id: number,
  status: 'active' | 'superseded' | 'invalid'
): Promise<void> => {
  return await invokeDbCompressedSummaryUpdateStatus(id, status)
}

/**
 * 删除压缩摘要
 */
const deleteCompressedSummary = async (id: number): Promise<void> => {
  return await invokeDbCompressedSummaryDelete(id)
}

export {
  saveCompressedSummary,
  getCompressedSummariesByChatId,
  getActiveCompressedSummariesByChatId,
  updateCompressedSummaryStatus,
  deleteCompressedSummary
}
