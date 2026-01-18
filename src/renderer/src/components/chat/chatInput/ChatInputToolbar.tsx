import { cn } from '@renderer/lib/utils'
import React from 'react'
import ConfigPanel from './toolbar/ConfigPanel'
import McpSelector from './toolbar/McpSelector'
import ModelSelector from './toolbar/ModelSelector'
import type { ModelOption } from '@renderer/store/appConfig'

interface ChatInputToolbarProps {
  // Model selector props
  selectedModel: ModelOption | undefined
  modelOptions: ModelOption[]
  setSelectedModelRef: (ref: ModelRef) => void

  // MCP selector props
  selectedMcpServerNames: string[]
  mcpServerConfig: any
  toggleMcpConnection: (serverName: string, serverConfig: any) => Promise<any>
  isConnectingMcpServer: (serverName: string) => boolean

  // Config panel props
  chatTemperature: number[]
  chatTopP: number[]
  currentSystemPrompt: string
  onTemperatureChange: (val: number[]) => void
  onTopPChange: (val: number[]) => void
  onSystemPromptChange: (val: string) => void
}

const ChatInputToolbar: React.FC<ChatInputToolbarProps> = ({
  selectedModel,
  modelOptions,
  setSelectedModelRef,
  selectedMcpServerNames,
  mcpServerConfig,
  toggleMcpConnection,
  isConnectingMcpServer,
  chatTemperature,
  chatTopP,
  currentSystemPrompt,
  onTemperatureChange,
  onTopPChange,
  onSystemPromptChange
}) => {
  const [selectModelPopoutState, setSelectModelPopoutState] = React.useState(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = React.useState(false)

  // Model selector trigger styles with emerald/teal theme
  const modelSelectorClassName = cn(
    "group relative h-7 min-w-24 w-auto flex items-center justify-between px-2.5 py-0.5 gap-1.5 rounded-2xl overflow-hidden",
    "transition-all duration-300 ease-out",
    selectedModel
      ? [
          // Selected state - emerald/teal gradient
          "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40",
          "text-emerald-700 dark:text-emerald-300",
          "border border-emerald-300/60 dark:border-emerald-700/60",
          "shadow-sm shadow-emerald-500/10 dark:shadow-emerald-500/20",
          "hover:shadow hover:shadow-emerald-500/25 dark:hover:shadow-emerald-500/35",
          "hover:scale-[1.02]",
          "active:scale-[0.98]"
        ]
      : [
          // Unselected state - subtle gray
          "bg-slate-50/50 dark:bg-slate-800/50",
          "text-slate-500 dark:text-slate-400",
          "border border-slate-200/50 dark:border-slate-700/50",
          "hover:bg-slate-100 dark:hover:bg-slate-700",
          "hover:text-slate-700 dark:hover:text-slate-300",
          "hover:border-slate-300 dark:hover:border-slate-600",
          "hover:scale-[1.02]",
          "active:scale-[0.98]"
        ],
    "text-xs font-medium",
    "focus-visible:ring-0 focus-visible:ring-offset-0"
  )

  // MCP selector trigger styles with amber/orange theme
  const mcpSelectorClassName = cn(
    "group relative h-7 min-w-24 w-auto flex items-center justify-between px-2.5 py-0.5 gap-1.5 rounded-2xl overflow-hidden",
    "transition-all duration-300 ease-out",
    selectedMcpServerNames.length > 0
      ? [
          // Active state - amber/orange gradient
          "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40",
          "text-amber-700 dark:text-amber-300",
          "border border-amber-300/60 dark:border-amber-700/60",
          "shadow-sm shadow-amber-500/10 dark:shadow-amber-500/20",
          "hover:shadow hover:shadow-amber-500/25 dark:hover:shadow-amber-500/35",
          "hover:scale-[1.02]",
          "active:scale-[0.98]"
        ]
      : [
          // Inactive state - subtle gray
          "bg-slate-50/50 dark:bg-slate-800/50",
          "text-slate-500 dark:text-slate-400",
          "border border-slate-200/50 dark:border-slate-700/50",
          "hover:bg-slate-100 dark:hover:bg-slate-700",
          "hover:text-slate-700 dark:hover:text-slate-300",
          "hover:border-slate-300 dark:hover:border-slate-600",
          "hover:scale-[1.02]",
          "active:scale-[0.98]"
        ],
    "text-xs font-medium",
    "focus-visible:ring-0 focus-visible:ring-offset-0"
  )

  const handleModelSelect = (ref: ModelRef) => {
    setSelectedModelRef(ref)
    setSelectModelPopoutState(false)
  }

  const handleMcpToolSelected = async (serverName: string, serverConfig: any) => {
    console.log('mcp-server-config', serverName, serverConfig)
    await toggleMcpConnection(serverName, serverConfig)
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
          modelOptions={modelOptions}
          isOpen={selectModelPopoutState}
          onOpenChange={setSelectModelPopoutState}
          onModelSelect={handleModelSelect}
          triggerClassName={modelSelectorClassName}
        />
      </div>

      {/* MCP Selector */}
      <div id="mcpSelector" className="app-undragable bg-transparent">
        <McpSelector
          selectedMcpServerNames={selectedMcpServerNames}
          mcpServerConfig={mcpServerConfig}
          isOpen={selectMCPPopoutState}
          onOpenChange={setSelectMCPPopoutState}
          onMcpToolSelected={handleMcpToolSelected}
          isConnectingMcpServer={isConnectingMcpServer}
          triggerClassName={mcpSelectorClassName}
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
          />
        </div>
      </div>
    </div>
  )
}

export default ChatInputToolbar
