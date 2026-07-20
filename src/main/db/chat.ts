import DatabaseService from './DatabaseService'
import type { HistorySearchArgs, HistorySearchItem } from '@tools/history/index.d'
import type { ToolResultCompactionLevel } from './dao/ToolResultCompactionDao'
import type {
  CreateToolResultCompaction,
  ToolResultCompaction,
  ToolResultCompactionExecution
} from './mappers/ToolResultCompactionMapper'

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
  createPendingToolResultCompaction: (input: CreateToolResultCompaction): number =>
    DatabaseService.createPendingToolResultCompaction(input),
  markToolResultCompactionRunning: (id: number): boolean =>
    DatabaseService.markToolResultCompactionRunning(id),
  markToolResultCompactionReady: (
    id: number,
    content: string,
    compactedCharacters: number,
    estimatedTokens: number,
    execution?: ToolResultCompactionExecution
  ): void => DatabaseService.markToolResultCompactionReady(
    id,
    content,
    compactedCharacters,
    estimatedTokens,
    execution
  ),
  markToolResultCompactionFailed: (id: number, errorCode: string): void =>
    DatabaseService.markToolResultCompactionFailed(id, errorCode),
  getReadyToolResultCompactionsByMessageIds: (messageIds: number[]): ToolResultCompaction[] =>
    DatabaseService.getReadyToolResultCompactionsByMessageIds(messageIds),
  getToolResultCompaction: (
    messageId: number,
    level: ToolResultCompactionLevel,
    originalHash: string,
    compactorId?: string,
    compactorVersion?: number
  ): ToolResultCompaction | undefined => DatabaseService.getToolResultCompaction(
    messageId,
    level,
    originalHash,
    compactorId,
    compactorVersion
  ),
  getEmotionState: (): EmotionStateSnapshot | undefined => DatabaseService.getEmotionState(),
  upsertEmotionState: (state: EmotionStateSnapshot): void =>
    DatabaseService.upsertEmotionState(state),
  transitionEmotionState: <T extends {
    state: EmotionStateSnapshot
    changed: boolean
  }>(
    transition: (previous: EmotionStateSnapshot | undefined) => T
  ): T => DatabaseService.transitionEmotionState(transition),
  clearEmotionState: (): void => DatabaseService.clearEmotionState(),
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
