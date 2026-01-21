import { registerChatHandlers } from '@main/ipc/chat'
import { registerConfigHandlers } from '@main/ipc/config'
import { registerMessageHandlers } from '@main/ipc/messages'
import { registerProviderHandlers } from '@main/ipc/providers'
import { registerSkillHandlers } from '@main/ipc/skills'
import { registerSystemHandlers } from '@main/ipc/system'
import { registerToolHandlers } from '@main/ipc/tools'

function mainIPCSetup() {
  registerSystemHandlers()
  registerToolHandlers()
  registerSkillHandlers()
  registerConfigHandlers()
  registerProviderHandlers()
  registerMessageHandlers()
  registerChatHandlers()
}

export {
  mainIPCSetup
}
