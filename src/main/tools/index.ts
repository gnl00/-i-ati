import tools from '@tools/definitions'
import { embeddedToolsRegistry, type ToolDefinition } from '@tools/registry'
import { embeddedToolMetadata } from '@tools/metadata'
import {
  processRead,
  processReadMedia,
  processWrite,
  processEdit,
  processGrep,
  processLs,
  processGlob,
  processTree,
  processStat,
  processListAllowedDirectories,
  processMkdir,
  processMv
} from '@main/tools/fileOperations/FileOperationsProcessor'
import { processWebFetch, processWebSearch } from '@main/tools/webTools/WebToolsProcessor'
import {
  processMemoryRetrieval,
  processMemorySave,
  processMemoryUpdate,
  processWorkContextGet,
  processWorkContextSet
} from '@main/tools/memory/MemoryToolsProcessor'
import { processExecuteCommand } from '@main/tools/command/CommandProcessor'
import {
  processInstallSkill,
  processImportSkills,
  processLoadSkill,
  processReadSkillFile,
  processUnloadSkill
} from '@main/tools/skills/SkillToolsProcessor'
import {
  processPlanCreate,
  processPlanDelete,
  processPlanGetCurrentChat,
  processPlanGetById,
  processPlanStepUpsert,
  processPlanUpdate,
  processPlanUpdateStatus
} from '@main/tools/taskPlanner/TaskPlannerProcessor'
import {
  processScheduleCancel,
  processScheduleCreate,
  processScheduleList,
  processScheduleUpdate
} from '@main/tools/schedule/ScheduleToolsProcessor'
import {
  processEditSoul,
  processGetSoul,
  processResetSoul
} from '@main/tools/soul/SoulToolsProcessor'
import { processEmotionReport } from '@main/tools/emotion/EmotionToolsProcessor'
import {
  processListPlugins,
  processPluginInstall,
  processPluginUninstall
} from '@main/tools/plugins/PluginToolsProcessor'
import { processTelegramSetupTool } from '@main/tools/telegram/TelegramToolsProcessor'
import {
  processActivityJournalAppend,
  processActivityJournalList,
  processActivityJournalSearch
} from '@main/tools/activityJournal/ActivityJournalToolsProcessor'
import {
  processSubagentSpawn,
  processSubagentWait
} from '@main/tools/subagent/SubagentToolsProcessor'

const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  list_tools: async () => embeddedToolsRegistry.getAllToolDefinitions(),
  search_tools: (args) => embeddedToolsRegistry.searchTools(args),
  web_search: processWebSearch,
  web_fetch: processWebFetch,
  read: processRead,
  read_media: processReadMedia,
  write: processWrite,
  edit: processEdit,
  grep: processGrep,
  ls: processLs,
  glob: processGlob,
  tree: processTree,
  stat: processStat,
  list_allowed_directories: processListAllowedDirectories,
  mkdir: processMkdir,
  mv: processMv,
  memory_retrieval: processMemoryRetrieval,
  memory_save: processMemorySave,
  memory_update: processMemoryUpdate,
  work_context_get: processWorkContextGet,
  work_context_set: processWorkContextSet,
  execute_command: processExecuteCommand,
  install_skill: processInstallSkill,
  load_skill: processLoadSkill,
  import_skills: processImportSkills,
  unload_skill: processUnloadSkill,
  read_skill_file: processReadSkillFile,
  plan_create: processPlanCreate,
  plan_update: processPlanUpdate,
  plan_update_status: processPlanUpdateStatus,
  plan_get_by_id: processPlanGetById,
  plan_get_current_chat: processPlanGetCurrentChat,
  plan_delete: processPlanDelete,
  plan_step_upsert: processPlanStepUpsert,
  schedule_create: processScheduleCreate,
  schedule_list: processScheduleList,
  schedule_cancel: processScheduleCancel,
  schedule_update: processScheduleUpdate,
  get_soul: processGetSoul,
  edit_soul: processEditSoul,
  reset_soul: processResetSoul,
  emotion_report: processEmotionReport,
  list_plugins: processListPlugins,
  plugin_install: processPluginInstall,
  plugin_uninstall: processPluginUninstall,
  telegram_setup_tool: processTelegramSetupTool,
  activity_journal_append: processActivityJournalAppend,
  activity_journal_list: processActivityJournalList,
  activity_journal_search: processActivityJournalSearch,
  subagent_spawn: processSubagentSpawn,
  subagent_wait: processSubagentWait
}

export function initializeMainEmbeddedTools(): void {
  const toolDefinitions = tools as ToolDefinition[]
  toolDefinitions.forEach((toolDef) => {
    const toolName = toolDef.function.name
    const handler = toolHandlers[toolName]
    if (handler) {
      embeddedToolsRegistry.register(toolName, handler, toolDef, embeddedToolMetadata[toolName])
    } else {
      console.warn(`[EmbeddedTools] No handler found for tool "${toolName}"`)
    }
  })
}
