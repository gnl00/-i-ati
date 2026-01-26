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

  // Queue preview
  queuedFirstText?: string
  queuedCount?: number
  queuePaused?: boolean
}

const ChatInputToolbar: React.FC<ChatInputToolbarProps> = ({
  selectedModel,
  modelOptions,
  setSelectedModelRef,
  selectedMcpServerNames,
  mcpServerConfig,
  toggleMcpConnection,
  isConnectingMcpServer,
  queuedFirstText,
  queuedCount,
  queuePaused
}) => {
  const [selectModelPopoutState, setSelectModelPopoutState] = React.useState(false)
  const [selectMCPPopoutState, setSelectMCPPopoutState] = React.useState(false)
  const [queueVisible, setQueueVisible] = React.useState(false)
  const [queueExiting, setQueueExiting] = React.useState(false)

  // Model selector trigger styles with emerald/teal theme
  const modelSelectorClassName = cn(
    "group relative h-7 min-w-24 w-auto flex items-center justify-between px-2.5 py-0.5 gap-1.5 rounded-2xl overflow-hidden",
    "transition-all duration-300 ease-out",
    selectedModel
      ? [
          // Selected state - emerald/teal gradient
          "bg-linear-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40",
          "text-emerald-700 dark:text-emerald-300",
          "border border-emerald-300/60 dark:border-emerald-700/60",
          "shadow-xs shadow-emerald-500/10 dark:shadow-emerald-500/20",
          "hover:shadow-sm hover:shadow-emerald-500/25 dark:hover:shadow-emerald-500/35",
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
          "bg-linear-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40",
          "text-amber-700 dark:text-amber-300",
          "border border-amber-300/60 dark:border-amber-700/60",
          "shadow-xs shadow-amber-500/10 dark:shadow-amber-500/20",
          "hover:shadow-sm hover:shadow-amber-500/25 dark:hover:shadow-amber-500/35",
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

  const queuePreview = React.useMemo(() => {
    if (!queuedFirstText || !queuedFirstText.trim()) {
      return 'Queued media'
    }
    const text = queuedFirstText.trim().replace(/\s+/g, ' ')
    const maxLen = 24
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
  }, [queuedFirstText])

  React.useEffect(() => {
    if (typeof queuedCount === 'number' && queuedCount > 0) {
      setQueueVisible(true)
      setQueueExiting(false)
      return
    }
    if (!queueVisible) {
      return
    }
    setQueueExiting(true)
    const timer = window.setTimeout(() => {
      setQueueVisible(false)
      setQueueExiting(false)
    }, 200)
    return () => window.clearTimeout(timer)
  }, [queuedCount, queueVisible])

  return (
    <div
      id="inputSelector"
      className='rounded-t-2xl w-full bg-[#F9FAFB] dark:bg-gray-800 p-1 flex items-center space-x-2 flex-none h-10 select-none border-b-0 border-t border-l border-r border-blue-gray-200 dark:border-gray-700'
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
      <div id="customPanel" className='grow w-full bg-transparent'>
        <div className='flex items-center justify-end gap-2 w-auto'>
          {queueVisible && queuePreview && (
            <div className={cn(
              "flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 max-w-[240px]",
              queueExiting
                ? "animate-out fade-out-0 slide-out-to-right-2 duration-200"
                : "animate-in fade-in-0 slide-in-from-right-2 duration-200"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 dark:bg-amber-400/70" />
              <span className="uppercase tracking-wider text-[9px] text-slate-500 dark:text-slate-400">Queued</span>
              {queuePaused && (
                <span className="text-[9px] font-bold text-rose-500 dark:text-rose-400">Paused</span>
              )}
              <span className="truncate">{queuePreview}</span>
              {queuedCount && queuedCount > 1 && (
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">+{queuedCount - 1}</span>
              )}
            </div>
          )}
          <ConfigPanel
          />
        </div>
      </div>
    </div>
  )
}

export default ChatInputToolbar
