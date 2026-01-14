import { cn } from '@renderer/lib/utils'
import React from 'react'
import ConfigPanel from './toolbar/ConfigPanel'
import McpSelector from './toolbar/McpSelector'
import ModelSelector from './toolbar/ModelSelector'

interface ChatInputToolbarProps {
  // Model selector props
  selectedModel: IModel | undefined
  models: IModel[]
  providers: IProvider[]
  onModelSelect: (model: IModel, providerName: string) => void

  // MCP selector props
  selectedMcpServerNames: string[]
  mcpServerConfig: any
  onMcpToolSelected: (serverName: string, serverConfig: any) => void
  isConnectingMcpServer: (serverName: string) => boolean

  // Config panel props
  chatTemperature: number[]
  chatTopP: number[]
  currentSystemPrompt: string
  onTemperatureChange: (val: number[]) => void
  onTopPChange: (val: number[]) => void
  onSystemPromptChange: (val: string) => void
  onResetDefaults?: () => void
}

const ChatInputToolbar: React.FC<ChatInputToolbarProps> = ({
  selectedModel,
  models,
  providers,
  onModelSelect,
  selectedMcpServerNames,
  mcpServerConfig,
  onMcpToolSelected,
  isConnectingMcpServer,
  chatTemperature,
  chatTopP,
  currentSystemPrompt,
  onTemperatureChange,
  onTopPChange,
  onSystemPromptChange,
  onResetDefaults
}) => {
  const [selectModelPopoutState, setSelectModelPopoutState] = React.useState(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = React.useState(false)

  const triggerButtonClassName = cn(
    "h-7 min-w-20 w-auto flex items-center justify-between px-2 py-0.5 gap-1 rounded-2xl",
    "bg-gray-100/80 dark:bg-gray-800/80",
    "hover:bg-gray-200 dark:hover:bg-gray-700",
    "text-gray-600 dark:text-gray-400",
    "hover:text-gray-900 dark:hover:text-gray-100",
    "text-xs font-medium",
    "backdrop-blur-md border border-transparent hover:border-gray-200 dark:hover:border-gray-700",
    "shadow-sm hover:shadow",
    "transition-all duration-200",
    "focus-visible:ring-0 focus-visible:ring-offset-0"
  )

  const handleModelSelect = (model: IModel, providerName: string) => {
    onModelSelect(model, providerName)
    setSelectModelPopoutState(false)
  }

  return (
    <div
      id="inputSelector"
      className='rounded-t-2xl w-full bg-[#F9FAFB] dark:bg-gray-800 p-1 flex items-center space-x-2 flex-none h-10 select-none border-b-0 border-t-[1px] border-l-[1px] border-r-[1px] border-blue-gray-200 dark:border-gray-700'
    >
      {/* Model Selector */}
      <div id="modelSelector" className="app-undragable bg-transparent">
        <ModelSelector
          selectedModel={selectedModel}
          models={models}
          providers={providers}
          isOpen={selectModelPopoutState}
          onOpenChange={setSelectModelPopoutState}
          onModelSelect={handleModelSelect}
          triggerClassName={triggerButtonClassName}
        />
      </div>

      {/* MCP Selector */}
      <div id="mcpSelector" className="app-undragable bg-transparent">
        <McpSelector
          selectedMcpServerNames={selectedMcpServerNames}
          mcpServerConfig={mcpServerConfig}
          isOpen={selectMCPPopoutState}
          onOpenChange={setSelectMCPPopoutState}
          onMcpToolSelected={onMcpToolSelected}
          isConnectingMcpServer={isConnectingMcpServer}
          triggerClassName={triggerButtonClassName}
        />
      </div>

      {/* Config Panel */}
      <div id="customPanel" className='flex-grow w-full bg-transparent'>
        <div className='flex justify-end w-auto'>
          <ConfigPanel
            chatTemperature={chatTemperature}
            chatTopP={chatTopP}
            currentSystemPrompt={currentSystemPrompt}
            onTemperatureChange={onTemperatureChange}
            onTopPChange={onTopPChange}
            onSystemPromptChange={onSystemPromptChange}
            onResetDefaults={onResetDefaults}
          />
        </div>
      </div>
    </div>
  )
}

export default ChatInputToolbar
