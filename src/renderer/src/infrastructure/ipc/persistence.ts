import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'
import type { ScheduleTask, ScheduleTaskStatus } from '@shared/tools/schedule'
import {
  DB_ASSISTANT_DELETE,
  DB_ASSISTANT_GET_ALL,
  DB_ASSISTANT_GET_BY_ID,
  DB_ASSISTANT_SAVE,
  DB_ASSISTANT_UPDATE,
  DB_CHAT_DELETE,
  DB_CHAT_GET_ALL,
  DB_CHAT_GET_BY_ID,
  DB_CHAT_SAVE,
  DB_CHAT_SEARCH,
  DB_CHAT_SKILL_ADD,
  DB_CHAT_SKILL_REMOVE,
  DB_CHAT_SKILLS_GET,
  DB_CHAT_UPDATE,
  DB_CONFIG_GET,
  DB_CONFIG_INIT,
  DB_CONFIG_SAVE,
  DB_MCP_SERVERS_GET,
  DB_MCP_SERVERS_SAVE,
  DB_MESSAGE_DELETE,
  DB_MESSAGE_GET_ALL,
  DB_MESSAGE_GET_BY_CHAT_ID,
  DB_MESSAGE_GET_BY_CHAT_UUID,
  DB_MESSAGE_GET_BY_ID,
  DB_MESSAGE_GET_BY_IDS,
  DB_MESSAGE_PATCH_UI_STATE,
  DB_MESSAGE_SAVE,
  DB_MESSAGE_UPDATE,
  DB_PLUGINS_GET,
  DB_PLUGINS_IMPORT,
  DB_PLUGINS_REMOTE_INSTALL,
  DB_PLUGINS_REMOTE_LIST,
  DB_PLUGINS_RESCAN,
  DB_PLUGINS_SAVE,
  DB_PLUGINS_UNINSTALL,
  DB_SCHEDULED_TASK_UPDATE_STATUS,
  DB_SCHEDULED_TASKS_LIST,
  DB_SMART_MESSAGE_DISMISS,
  DB_SMART_MESSAGES_GET_ACTIVE,
  DB_SMART_MESSAGES_REFRESH,
  DB_TASK_PLAN_DELETE,
  DB_TASK_PLAN_GET_BY_CHAT_UUID,
  DB_TASK_PLAN_GET_BY_ID,
  DB_TASK_PLAN_SAVE,
  DB_TASK_PLAN_STEP_UPDATE_STATUS,
  DB_TASK_PLAN_STEP_UPSERT,
  DB_TASK_PLAN_UPDATE,
  DB_TASK_PLAN_UPDATE_STATUS
} from '@shared/constants/index'
import { invokeIpc } from './client'

export const invokeDbChatSave = (data: ChatEntity): Promise<number> => invokeIpc(DB_CHAT_SAVE, data)
export const invokeDbChatGetAll = (): Promise<ChatEntity[]> => invokeIpc(DB_CHAT_GET_ALL)
export const invokeDbChatGetById = (id: number): Promise<ChatEntity | undefined> => invokeIpc(DB_CHAT_GET_BY_ID, id)
export const invokeDbChatSearch = (args: ChatSearchRequest): Promise<ChatSearchResult[]> => invokeIpc(DB_CHAT_SEARCH, args)
export const invokeDbChatUpdate = (data: ChatEntity): Promise<void> => invokeIpc(DB_CHAT_UPDATE, data)
export const invokeDbChatDelete = (id: number): Promise<void> => invokeIpc(DB_CHAT_DELETE, id)
export const invokeDbChatSkillAdd = (args: { chatId: number; skillName: string }): Promise<void> => invokeIpc(DB_CHAT_SKILL_ADD, args)
export const invokeDbChatSkillRemove = (args: { chatId: number; skillName: string }): Promise<void> => invokeIpc(DB_CHAT_SKILL_REMOVE, args)
export const invokeDbChatSkillsGet = (chatId: number): Promise<string[]> => invokeIpc(DB_CHAT_SKILLS_GET, chatId)

export const invokeDbMessageSave = (data: MessageEntity): Promise<number> => invokeIpc(DB_MESSAGE_SAVE, data)
export const invokeDbMessageGetAll = (): Promise<MessageEntity[]> => invokeIpc(DB_MESSAGE_GET_ALL)
export const invokeDbMessageGetById = (id: number): Promise<MessageEntity | undefined> => invokeIpc(DB_MESSAGE_GET_BY_ID, id)
export const invokeDbMessageGetByIds = (ids: number[]): Promise<MessageEntity[]> => invokeIpc(DB_MESSAGE_GET_BY_IDS, ids)
export const invokeDbMessageGetByChatId = (chatId: number): Promise<MessageEntity[]> => invokeIpc(DB_MESSAGE_GET_BY_CHAT_ID, chatId)
export const invokeDbMessageGetByChatUuid = (chatUuid: string): Promise<MessageEntity[]> => invokeIpc(DB_MESSAGE_GET_BY_CHAT_UUID, chatUuid)
export const invokeDbMessageUpdate = (data: MessageEntity): Promise<void> => invokeIpc(DB_MESSAGE_UPDATE, data)
export const invokeDbMessagePatchUiState = (id: number, uiState: MessageUiStatePatch): Promise<void> =>
  invokeIpc(DB_MESSAGE_PATCH_UI_STATE, { id, uiState })
export const invokeDbMessageDelete = (id: number): Promise<void> => invokeIpc(DB_MESSAGE_DELETE, id)

export const invokeDbConfigGet = (): Promise<IAppConfig | undefined> => invokeIpc(DB_CONFIG_GET)
export const invokeDbConfigSave = (config: IAppConfig): Promise<void> => invokeIpc(DB_CONFIG_SAVE, config)
export const invokeDbConfigInit = (): Promise<IAppConfig> => invokeIpc(DB_CONFIG_INIT)
export const invokeDbPluginsGet = (): Promise<PluginEntity[]> => invokeIpc(DB_PLUGINS_GET)
export const invokeDbPluginsRescan = (): Promise<PluginEntity[]> => invokeIpc(DB_PLUGINS_RESCAN)
export const invokeDbPluginsImport = (sourceDir: string): Promise<PluginEntity[]> => invokeIpc(DB_PLUGINS_IMPORT, sourceDir)
export const invokeDbPluginsUninstall = (pluginId: string): Promise<PluginEntity[]> => invokeIpc(DB_PLUGINS_UNINSTALL, pluginId)
export const invokeDbPluginsSave = (configs: AppPluginConfig[]): Promise<void> => invokeIpc(DB_PLUGINS_SAVE, configs)
export const invokeDbPluginsRemoteList = (): Promise<RemotePluginCatalogItem[]> => invokeIpc(DB_PLUGINS_REMOTE_LIST)
export const invokeDbPluginsRemoteInstall = (pluginId: string): Promise<PluginEntity[]> => invokeIpc(DB_PLUGINS_REMOTE_INSTALL, pluginId)
export const invokeDbMcpServersGet = (): Promise<McpServerConfig> => invokeIpc(DB_MCP_SERVERS_GET)
export const invokeDbMcpServersSave = (config: McpServerConfig): Promise<void> => invokeIpc(DB_MCP_SERVERS_SAVE, config)

export const invokeDbScheduledTasksList = (): Promise<ScheduleTask[]> => invokeIpc(DB_SCHEDULED_TASKS_LIST)
export const invokeDbScheduledTaskUpdateStatus = (args: { id: string; status: ScheduleTaskStatus; lastError?: string | null }): Promise<ScheduleTask> =>
  invokeIpc(DB_SCHEDULED_TASK_UPDATE_STATUS, args)

export const invokeDbAssistantSave = (data: Assistant): Promise<string> => invokeIpc(DB_ASSISTANT_SAVE, data)
export const invokeDbAssistantGetAll = (): Promise<Assistant[]> => invokeIpc(DB_ASSISTANT_GET_ALL)
export const invokeDbAssistantGetById = (id: string): Promise<Assistant | undefined> => invokeIpc(DB_ASSISTANT_GET_BY_ID, id)
export const invokeDbAssistantUpdate = (data: Assistant): Promise<void> => invokeIpc(DB_ASSISTANT_UPDATE, data)
export const invokeDbAssistantDelete = (id: string): Promise<boolean> => invokeIpc(DB_ASSISTANT_DELETE, id)

export const invokeDbTaskPlanSave = (plan: Plan): Promise<void> => invokeIpc(DB_TASK_PLAN_SAVE, plan)
export const invokeDbTaskPlanUpdate = (plan: Plan): Promise<void> => invokeIpc(DB_TASK_PLAN_UPDATE, plan)
export const invokeDbTaskPlanUpdateStatus = (data: { id: string; status: PlanStatus; currentStepId?: string; failureReason?: string }): Promise<void> =>
  invokeIpc(DB_TASK_PLAN_UPDATE_STATUS, data)
export const invokeDbTaskPlanGetById = (id: string): Promise<Plan | undefined> => invokeIpc(DB_TASK_PLAN_GET_BY_ID, id)
export const invokeDbTaskPlanGetByChatUuid = (chatUuid: string): Promise<Plan[]> => invokeIpc(DB_TASK_PLAN_GET_BY_CHAT_UUID, chatUuid)
export const invokeDbTaskPlanDelete = (id: string): Promise<void> => invokeIpc(DB_TASK_PLAN_DELETE, id)
export const invokeDbTaskPlanStepUpsert = (planId: string, step: PlanStep): Promise<void> =>
  invokeIpc(DB_TASK_PLAN_STEP_UPSERT, { planId, step })
export const invokeDbTaskPlanStepUpdateStatus = (
  planId: string,
  stepId: string,
  status: PlanStep['status'],
  output?: unknown,
  error?: string,
  notes?: string
): Promise<void> => invokeIpc(DB_TASK_PLAN_STEP_UPDATE_STATUS, { planId, stepId, status, output, error, notes })

export const invokeDbCompressedSummarySave = (data: CompressedSummaryEntity): Promise<number> =>
  invokeIpc('db:compressed-summary:save', data)
export const invokeDbCompressedSummaryGetByChatId = (chatId: number): Promise<CompressedSummaryEntity[]> =>
  invokeIpc('db:compressed-summary:get-by-chat-id', chatId)
export const invokeDbCompressedSummaryGetActiveByChatId = (chatId: number): Promise<CompressedSummaryEntity[]> =>
  invokeIpc('db:compressed-summary:get-active-by-chat-id', chatId)
export const invokeDbCompressedSummaryUpdateStatus = (id: number, status: 'active' | 'superseded' | 'invalid'): Promise<void> =>
  invokeIpc('db:compressed-summary:update-status', id, status)
export const invokeDbCompressedSummaryDelete = (id: number): Promise<void> =>
  invokeIpc('db:compressed-summary:delete', id)

export const invokeDbSmartMessagesGetActive = (limit?: number): Promise<SmartMessageEntity[]> =>
  invokeIpc(DB_SMART_MESSAGES_GET_ACTIVE, limit)
export const invokeDbSmartMessageDismiss = (id: string): Promise<void> => invokeIpc(DB_SMART_MESSAGE_DISMISS, id)
export const invokeDbSmartMessagesRefresh = (): Promise<SmartMessageGenerationResult> => invokeIpc(DB_SMART_MESSAGES_REFRESH)
