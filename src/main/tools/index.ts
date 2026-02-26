import tools from '@tools/definitions'
import { embeddedToolsRegistry, type ToolDefinition } from '@tools/registry'
import {
  processReadTextFile,
  processReadMediaFile,
  processReadMultipleFiles,
  processWriteFile,
  processEditFile,
  processSearchFile,
  processSearchFiles,
  processListDirectory,
  processListDirectoryWithSizes,
  processDirectoryTree,
  processGetFileInfo,
  processListAllowedDirectories,
  processCreateDirectory,
  processMoveFile
} from '@main/tools/fileOperations/FileOperationsProcessor'
import { processWebFetch, processWebSearch } from '@main/tools/webTools/WebToolsProcessor'
import { processMemoryRetrieval, processMemorySave, processMemoryUpdate } from '@main/tools/memory/MemoryToolsProcessor'
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

const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  list_tools: async () => embeddedToolsRegistry.getAllToolDefinitions(),
  search_tools: (args) => embeddedToolsRegistry.searchTools(args),
  web_search: processWebSearch,
  web_fetch: processWebFetch,
  read_text_file: processReadTextFile,
  read_media_file: processReadMediaFile,
  read_multiple_files: processReadMultipleFiles,
  write_file: processWriteFile,
  edit_file: processEditFile,
  search_file: processSearchFile,
  search_files: processSearchFiles,
  list_directory: processListDirectory,
  list_directory_with_sizes: processListDirectoryWithSizes,
  directory_tree: processDirectoryTree,
  get_file_info: processGetFileInfo,
  list_allowed_directories: processListAllowedDirectories,
  create_directory: processCreateDirectory,
  move_file: processMoveFile,
  memory_retrieval: processMemoryRetrieval,
  memory_save: processMemorySave,
  memory_update: processMemoryUpdate,
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
  schedule_update: processScheduleUpdate
}

export function initializeMainEmbeddedTools(): void {
  const toolDefinitions = tools as ToolDefinition[]
  toolDefinitions.forEach((toolDef) => {
    const toolName = toolDef.function.name
    const handler = toolHandlers[toolName]
    if (handler) {
      embeddedToolsRegistry.register(toolName, handler, toolDef)
    } else {
      console.warn(`[EmbeddedTools] No handler found for tool "${toolName}"`)
    }
  })
}
