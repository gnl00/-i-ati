import tools from '@tools/definitions'
import {
  embeddedToolsRegistry,
  type EmbeddedToolExecutionContext,
  type ToolDefinition
} from '@tools/registry'
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
  processMemoryUpdate
} from '@main/tools/memory/MemoryToolsProcessor'
import { processHistorySearch } from '@main/tools/history/HistoryToolsProcessor'
import { processSessionContext } from '@main/tools/workContext/WorkContextToolsProcessor'
import { processExecuteCommand } from '@main/tools/command/CommandProcessor'
import {
  processInstallSkill,
  processImportSkills,
  processLoadSkill,
  processReadSkillFile,
  processRunSkillScript,
  processUnloadSkill
} from '@main/tools/skills/SkillToolsProcessor'
import { processPlan } from '@main/tools/taskPlanner/TaskPlannerProcessor'
import { processSchedule } from '@main/tools/schedule/ScheduleToolsProcessor'
import { processSoul } from '@main/tools/soul/SoulToolsProcessor'
import { processEmotionReport } from '@main/tools/emotion/EmotionToolsProcessor'
import {
  processListPlugins,
  processPluginInstall,
  processPluginUninstall
} from '@main/tools/plugins/PluginToolsProcessor'
import {
  processTelegramSearchTargets,
  processTelegramSendMessage,
  processTelegramSetupTool
} from '@main/tools/telegram/TelegramToolsProcessor'
import { processChatSetTitle } from '@main/tools/title/TitleToolsProcessor'
import { processTodo } from '@main/tools/todo/TodoToolsProcessor'
import { processUserInfo } from '@main/tools/userInfo/UserInfoToolsProcessor'
import { processVisionAnalyze } from '@main/tools/vision/VisionToolsProcessor'
import {
  processActivityJournalAppend,
  processActivityJournalList,
  processActivityJournalSearch
} from '@main/tools/activityJournal/ActivityJournalToolsProcessor'
import { processKnowledgebaseSearch } from '@main/tools/knowledgebase/KnowledgebaseToolsProcessor'
import { processSubagent } from '@main/tools/subagent/SubagentToolsProcessor'
import { processLogSearch } from '@main/tools/log/LogToolsProcessor'
import { processWiki } from '@main/tools/wiki/WikiToolsProcessor'
import { processAskUserQuestion } from '@main/tools/userQuestion/UserQuestionToolsProcessor'
import {
  processComputerUseApps,
  processComputerUseClickCoordinate,
  processComputerUseClickElement,
  processComputerUseDrag,
  processComputerUseFinish,
  processComputerUseOpenApp,
  processComputerUsePressKey,
  processComputerUseRequestPermissions,
  processComputerUseRunningApps,
  processComputerUseScroll,
  processComputerUseSetValue,
  processComputerUseState,
  processComputerUseStatus,
  processComputerUseTypeText,
  processComputerUseWindows
} from '@main/tools/computerUse/ComputerUseToolsProcessor'

export const toolHandlers: Record<
  string,
  (args: any, context?: EmbeddedToolExecutionContext) => Promise<any>
> = {
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
  history_search: processHistorySearch,
  computer_use_status: processComputerUseStatus,
  computer_use_request_permissions: processComputerUseRequestPermissions,
  computer_use_apps: processComputerUseApps,
  computer_use_running_apps: processComputerUseRunningApps,
  computer_use_open_app: processComputerUseOpenApp,
  computer_use_windows: processComputerUseWindows,
  computer_use_state: processComputerUseState,
  computer_use_click_element: processComputerUseClickElement,
  computer_use_click_coordinate: processComputerUseClickCoordinate,
  computer_use_type_text: processComputerUseTypeText,
  computer_use_set_value: processComputerUseSetValue,
  computer_use_press_key: processComputerUsePressKey,
  computer_use_scroll: processComputerUseScroll,
  computer_use_drag: processComputerUseDrag,
  computer_use_finish: processComputerUseFinish,
  session_context: processSessionContext,
  exec: processExecuteCommand,
  install_skill: processInstallSkill,
  load_skill: processLoadSkill,
  import_skills: processImportSkills,
  unload_skill: processUnloadSkill,
  read_skill_file: processReadSkillFile,
  run_skill_script: processRunSkillScript,
  plan: processPlan,
  schedule: processSchedule,
  soul: processSoul,
  emotion_report: processEmotionReport,
  list_plugins: processListPlugins,
  plugin_install: processPluginInstall,
  plugin_uninstall: processPluginUninstall,
  telegram_setup_tool: processTelegramSetupTool,
  telegram_search_targets: processTelegramSearchTargets,
  telegram_send_message: processTelegramSendMessage,
  chat_set_title: processChatSetTitle,
  todo: processTodo,
  user_info: processUserInfo,
  vision_analyze: processVisionAnalyze,
  activity_journal_append: processActivityJournalAppend,
  activity_journal_list: processActivityJournalList,
  activity_journal_search: processActivityJournalSearch,
  knowledgebase_search: processKnowledgebaseSearch,
  log_search: processLogSearch,
  wiki: processWiki,
  subagent: processSubagent,
  ask_user_question: processAskUserQuestion
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
