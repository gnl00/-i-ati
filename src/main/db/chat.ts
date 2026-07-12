import DatabaseService from './DatabaseService'
import type { HistorySearchArgs, HistorySearchItem } from '@tools/history/index.d'

export const chatDb = {
  saveChat: (data: ChatEntity): number => DatabaseService.saveChat(data),
  getAllChats: (): ChatEntity[] => DatabaseService.getAllChats(),
  getChatById: (id: number): ChatEntity | undefined => DatabaseService.getChatById(id),
  getChatByUuid: (uuid: string): ChatEntity | undefined => DatabaseService.getChatByUuid(uuid),
  getWorkspacePathByUuid: (uuid: string): string | undefined => DatabaseService.getWorkspacePathByUuid(uuid),
  updateChat: (data: ChatEntity): void => DatabaseService.updateChat(data),
  deleteChat: (id: number): void => DatabaseService.deleteChat(id),
  searchChats: (args: ChatSearchRequest): ChatSearchResult[] => DatabaseService.searchChats(args),
  searchHistory: (args: HistorySearchArgs): HistorySearchItem[] => DatabaseService.searchHistory(args),
  getSkills: (chatId: number): string[] => DatabaseService.getSkills(chatId),
  addSkill: (chatId: number, skillName: string): void => DatabaseService.addSkill(chatId, skillName),
  removeSkill: (chatId: number, skillName: string): void => DatabaseService.removeSkill(chatId, skillName),
  saveChatHostBinding: (data: ChatHostBindingEntity): number => DatabaseService.saveChatHostBinding(data),
  upsertChatHostBinding: (data: ChatHostBindingEntity): void => DatabaseService.upsertChatHostBinding(data),
  getChatHostBindingByHost: (
    hostType: string,
    hostChatId: string,
    hostThreadId?: string
  ): ChatHostBindingEntity | undefined => DatabaseService.getChatHostBindingByHost(hostType, hostChatId, hostThreadId),
  getChatHostBindingsByChatUuid: (chatUuid: string): ChatHostBindingEntity[] =>
    DatabaseService.getChatHostBindingsByChatUuid(chatUuid),
  updateChatHostBindingLastMessage: (id: number, lastHostMessageId?: string): void =>
    DatabaseService.updateChatHostBindingLastMessage(id, lastHostMessageId),
  updateChatHostBindingStatus: (id: number, status: 'active' | 'archived'): void =>
    DatabaseService.updateChatHostBindingStatus(id, status),
  saveMessage: (data: MessageEntity): number => DatabaseService.saveMessage(data),
  getAllMessages: (): MessageEntity[] => DatabaseService.getAllMessages(),
  getMessageById: (id: number): MessageEntity | undefined => DatabaseService.getMessageById(id),
  getMessageByIds: (ids: number[]): MessageEntity[] => DatabaseService.getMessageByIds(ids),
  getMessagesByChatId: (chatId: number): MessageEntity[] => DatabaseService.getMessagesByChatId(chatId),
  getMessagesByChatUuid: (chatUuid: string): MessageEntity[] => DatabaseService.getMessagesByChatUuid(chatUuid),
  updateMessage: (data: MessageEntity): void => DatabaseService.updateMessage(data),
  patchMessageUiState: (id: number, uiState: MessageUiStatePatch): void => DatabaseService.patchMessageUiState(id, uiState),
  deleteMessage: (id: number): void => DatabaseService.deleteMessage(id),
  getEmotionStateByChatId: (chatId: number): EmotionStateSnapshot | undefined =>
    DatabaseService.getEmotionStateByChatId(chatId),
  getEmotionStateByChatUuid: (chatUuid: string): EmotionStateSnapshot | undefined =>
    DatabaseService.getEmotionStateByChatUuid(chatUuid),
  getLatestEmotionState: (): EmotionStateSnapshot | undefined => DatabaseService.getLatestEmotionState(),
  upsertEmotionState: (chatId: number, chatUuid: string, state: EmotionStateSnapshot): void =>
    DatabaseService.upsertEmotionState(chatId, chatUuid, state),
  getWorkContextByChatUuid: (chatUuid: string) => DatabaseService.getWorkContextByChatUuid(chatUuid),
  upsertWorkContext: (chatId: number, chatUuid: string, content: string) =>
    DatabaseService.upsertWorkContext(chatId, chatUuid, content),
  saveCompressedSummary: (data: CompressedSummaryEntity): number => DatabaseService.saveCompressedSummary(data),
  getCompressedSummariesByChatId: (chatId: number): CompressedSummaryEntity[] =>
    DatabaseService.getCompressedSummariesByChatId(chatId),
  getActiveCompressedSummariesByChatId: (chatId: number): CompressedSummaryEntity[] =>
    DatabaseService.getActiveCompressedSummariesByChatId(chatId),
  updateCompressedSummaryStatus: (id: number, status: 'active' | 'superseded' | 'invalid'): void =>
    DatabaseService.updateCompressedSummaryStatus(id, status),
  deleteCompressedSummary: (id: number): void => DatabaseService.deleteCompressedSummary(id)
}
