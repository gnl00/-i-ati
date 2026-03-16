import {
  invokeDbMcpServersGet,
  invokeDbMcpServersSave
} from '@renderer/invoker/ipcInvoker'

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
