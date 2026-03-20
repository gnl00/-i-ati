import { registerChatHandlers } from '@main/ipc/chat'
import { registerConfigHandlers } from '@main/ipc/config'
import { registerLoggingHandlers } from '@main/ipc/logging'
import { registerMcpServerHandlers } from '@main/ipc/mcp-servers'
import { registerMessageHandlers } from '@main/ipc/messages'
import { registerPluginHandlers } from '@main/ipc/plugins'
import { registerProviderHandlers } from '@main/ipc/providers'
import { registerSkillHandlers } from '@main/ipc/skills'
import { registerSystemHandlers } from '@main/ipc/system'
import { registerToolHandlers } from '@main/ipc/tools'
import { registerTaskPlanHandlers } from '@main/ipc/task-planner'
import { registerScheduledTaskHandlers } from '@main/ipc/scheduled-tasks'

function mainIPCSetup() {
  registerLoggingHandlers()
  registerSystemHandlers()
  registerToolHandlers()
  registerSkillHandlers()
  registerConfigHandlers()
  registerMcpServerHandlers()
  registerPluginHandlers()
  registerProviderHandlers()
  registerMessageHandlers()
  registerChatHandlers()
  registerTaskPlanHandlers()
  registerScheduledTaskHandlers()
}

export {
  mainIPCSetup
}
