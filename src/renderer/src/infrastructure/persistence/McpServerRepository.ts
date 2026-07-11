import {
  invokeDbMcpServersGet,
  invokeDbMcpServersSave
} from '@renderer/infrastructure/ipc'

const getMcpServerConfig = async (): Promise<McpServerConfig> => {
  return await invokeDbMcpServersGet()
}

const saveMcpServerConfig = async (config: McpServerConfig): Promise<void> => {
  return await invokeDbMcpServersSave(config)
}

export {
  getMcpServerConfig,
  saveMcpServerConfig
}
