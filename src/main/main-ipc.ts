import { registerChatHandlers } from '@main/ipc/chat'
import { registerConfigHandlers } from '@main/ipc/config'
import { registerEmotionHandlers } from '@main/ipc/emotion'
import { registerLoggingHandlers } from '@main/ipc/logging'
import { registerMcpServerHandlers } from '@main/ipc/mcp-servers'
import { registerMessageHandlers } from '@main/ipc/messages'
import { registerModelsHandlers } from '@main/ipc/models'
import { registerPluginHandlers } from '@main/ipc/plugins'
import { registerProviderHandlers } from '@main/ipc/providers'
import { registerSkillHandlers } from '@main/ipc/skills'
import { registerSystemHandlers } from '@main/ipc/system'
import { registerToolHandlers } from '@main/ipc/tools'
import { registerTelegramHandlers } from '@main/ipc/telegram'
import { registerTaskPlanHandlers } from '@main/ipc/task-planner'
import { registerScheduledTaskHandlers } from '@main/ipc/scheduled-tasks'
import { registerSmartMessageHandlers } from '@main/ipc/smart-messages'
import { registerWorkspaceHandlers } from '@main/ipc/workspace'

function mainIPCSetup() {
  registerLoggingHandlers()
  registerSystemHandlers()
  registerWorkspaceHandlers()
  registerEmotionHandlers()
  registerToolHandlers()
  registerTelegramHandlers()
  registerSkillHandlers()
  registerConfigHandlers()
  registerMcpServerHandlers()
  registerPluginHandlers()
  registerProviderHandlers()
  registerModelsHandlers()
  registerMessageHandlers()
  registerChatHandlers()
  registerTaskPlanHandlers()
  registerScheduledTaskHandlers()
  registerSmartMessageHandlers()
}

export {
  mainIPCSetup
}
