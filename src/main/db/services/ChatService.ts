import type { ChatHostBindingRepository } from '../repositories/ChatHostBindingRepository'
import type { ChatRepository } from '../repositories/ChatRepository'
import type { EmotionStateRepository } from '../repositories/EmotionStateRepository'
import type { MessageRepository } from '../repositories/MessageRepository'
import type { WorkContextRecord, WorkContextRepository } from '../repositories/WorkContextRepository'
import type { HistorySearchArgs, HistorySearchItem } from '@tools/history/index.d'
import type { ToolResultCompactionLevel } from '../dao/ToolResultCompactionDao'
import type {
  CreateToolResultCompaction,
  ToolResultCompaction,
  ToolResultCompactionExecution
} from '../mappers/ToolResultCompactionMapper'
import type { ToolResultCompactionRepository } from '../repositories/ToolResultCompactionRepository'

type ChatServiceDeps = {
  chatRepository: () => ChatRepository | undefined
  chatHostBindingRepository: () => ChatHostBindingRepository | undefined
  messageRepository: () => MessageRepository | undefined
  emotionStateRepository: () => EmotionStateRepository | undefined
  workContextRepository: () => WorkContextRepository | undefined
  toolResultCompactionRepository: () => ToolResultCompactionRepository | undefined
}

export class ChatService {
  constructor(private readonly deps: ChatServiceDeps) {}

  saveChat(data: ChatEntity): number {
    return this.requireChatRepository().saveChat(data)
  }

  getAllChats(): ChatEntity[] {
    return this.requireChatRepository().getAllChats()
  }

  getChatById(id: number): ChatEntity | undefined {
    return this.requireChatRepository().getChatById(id)
  }

  getChatByUuid(uuid: string): ChatEntity | undefined {
    return this.requireChatRepository().getChatByUuid(uuid)
  }

  getWorkspacePathByUuid(uuid: string): string | undefined {
    return this.requireChatRepository().getWorkspacePathByUuid(uuid)
  }

  updateChat(data: ChatEntity): void {
    this.requireChatRepository().updateChat(data)
  }

  deleteChat(id: number): void {
    this.requireChatRepository().deleteChat(id)
  }

  getSkills(chatId: number): string[] {
    return this.requireChatRepository().getSkills(chatId)
  }

  addSkill(chatId: number, skillName: string): void {
    this.requireChatRepository().addSkill(chatId, skillName)
  }

  removeSkill(chatId: number, skillName: string): void {
    this.requireChatRepository().removeSkill(chatId, skillName)
  }

  saveChatHostBinding(data: ChatHostBindingEntity): number {
    return this.requireChatHostBindingRepository().saveBinding(data)
  }

  upsertChatHostBinding(data: ChatHostBindingEntity): void {
    this.requireChatHostBindingRepository().upsertBinding(data)
  }

  getChatHostBindingByHost(
    hostType: string,
    hostChatId: string,
    hostThreadId?: string
  ): ChatHostBindingEntity | undefined {
    return this.requireChatHostBindingRepository().getBindingByHost(hostType, hostChatId, hostThreadId)
  }

  getChatHostBindingsByChatUuid(chatUuid: string): ChatHostBindingEntity[] {
    return this.requireChatHostBindingRepository().getBindingsByChatUuid(chatUuid)
  }

  updateChatHostBindingLastMessage(id: number, lastHostMessageId?: string): void {
    this.requireChatHostBindingRepository().updateLastHostMessageId(id, lastHostMessageId)
  }

  updateChatHostBindingStatus(id: number, status: 'active' | 'archived'): void {
    this.requireChatHostBindingRepository().updateStatus(id, status)
  }

  saveMessage(data: MessageEntity): number {
    return this.requireMessageRepository().saveMessage(data)
  }

  getAllMessages(): MessageEntity[] {
    return this.requireMessageRepository().getAllMessages()
  }

  getMessageById(id: number): MessageEntity | undefined {
    return this.requireMessageRepository().getMessageById(id)
  }

  getMessagesByChatId(chatId: number): MessageEntity[] {
    return this.requireMessageRepository().getMessagesByChatId(chatId)
  }

  getMessagesByChatUuid(chatUuid: string): MessageEntity[] {
    return this.requireMessageRepository().getMessagesByChatUuid(chatUuid)
  }

  searchChats(args: ChatSearchRequest): ChatSearchResult[] {
    return this.requireMessageRepository().searchChats(args)
  }

  searchHistory(args: HistorySearchArgs): HistorySearchItem[] {
    return this.requireMessageRepository().searchHistory(args)
  }

  getMessageByIds(ids: number[]): MessageEntity[] {
    return this.requireMessageRepository().getMessageByIds(ids)
  }

  updateMessage(data: MessageEntity): void {
    this.requireMessageRepository().updateMessage(data)
  }

  patchMessageUiState(id: number, uiState: MessageUiStatePatch): void {
    this.requireMessageRepository().patchMessageUiState(id, uiState)
  }

  deleteMessage(id: number): void {
    this.requireMessageRepository().deleteMessage(id)
  }

  createPendingToolResultCompaction(input: CreateToolResultCompaction): number {
    return this.requireToolResultCompactionRepository().createPending(input)
  }

  markToolResultCompactionRunning(id: number): boolean {
    return this.requireToolResultCompactionRepository().markRunning(id)
  }

  markToolResultCompactionReady(
    id: number,
    content: string,
    compactedCharacters: number,
    estimatedTokens: number,
    execution?: ToolResultCompactionExecution
  ): void {
    this.requireToolResultCompactionRepository().markReady(
      id,
      content,
      compactedCharacters,
      estimatedTokens,
      execution
    )
  }

  markToolResultCompactionFailed(id: number, errorCode: string): void {
    this.requireToolResultCompactionRepository().markFailed(id, errorCode)
  }

  getReadyToolResultCompactionsByMessageIds(messageIds: number[]): ToolResultCompaction[] {
    return this.requireToolResultCompactionRepository().getReadyByMessageIds(messageIds)
  }

  getToolResultCompaction(
    messageId: number,
    level: ToolResultCompactionLevel,
    originalHash: string,
    compactorId?: string,
    compactorVersion?: number
  ): ToolResultCompaction | undefined {
    return this.requireToolResultCompactionRepository().getByMessageLevelAndHash(
      messageId,
      level,
      originalHash,
      compactorId,
      compactorVersion
    )
  }

  getEmotionState(): EmotionStateSnapshot | undefined {
    return this.requireEmotionStateRepository().getEmotionState()
  }

  upsertEmotionState(state: EmotionStateSnapshot): void {
    this.requireEmotionStateRepository().upsertEmotionState(state)
  }

  transitionEmotionState<T extends {
    state: EmotionStateSnapshot
    changed: boolean
  }>(
    transition: (previous: EmotionStateSnapshot | undefined) => T
  ): T {
    return this.requireEmotionStateRepository().transitionEmotionState(transition)
  }

  clearEmotionState(): void {
    this.requireEmotionStateRepository().clearEmotionState()
  }

  getWorkContextByChatId(chatId: number): WorkContextRecord | undefined {
    return this.requireWorkContextRepository().getWorkContextByChatId(chatId)
  }

  getWorkContextByChatUuid(chatUuid: string): WorkContextRecord | undefined {
    return this.requireWorkContextRepository().getWorkContextByChatUuid(chatUuid)
  }

  upsertWorkContext(chatId: number, chatUuid: string, content: string): WorkContextRecord {
    return this.requireWorkContextRepository().upsertWorkContext(chatId, chatUuid, content)
  }

  deleteWorkContext(chatId: number): void {
    this.requireWorkContextRepository().deleteWorkContext(chatId)
  }

  private requireChatRepository(): ChatRepository {
    const repository = this.deps.chatRepository()
    if (!repository) throw new Error('Chat repository not initialized')
    return repository
  }

  private requireChatHostBindingRepository(): ChatHostBindingRepository {
    const repository = this.deps.chatHostBindingRepository()
    if (!repository) throw new Error('Chat host binding repository not initialized')
    return repository
  }

  private requireMessageRepository(): MessageRepository {
    const repository = this.deps.messageRepository()
    if (!repository) throw new Error('Message repository not initialized')
    return repository
  }

  private requireEmotionStateRepository(): EmotionStateRepository {
    const repository = this.deps.emotionStateRepository()
    if (!repository) throw new Error('Emotion state repository not initialized')
    return repository
  }

  private requireWorkContextRepository(): WorkContextRepository {
    const repository = this.deps.workContextRepository()
    if (!repository) throw new Error('Work context repository not initialized')
    return repository
  }

  private requireToolResultCompactionRepository(): ToolResultCompactionRepository {
    const repository = this.deps.toolResultCompactionRepository()
    if (!repository) throw new Error('Tool result compaction repository not initialized')
    return repository
  }
}
