import { ResetIcon, TokensIcon } from '@radix-ui/react-icons'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Slider } from "@renderer/components/ui/slider"
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { useAssistantStore } from '@renderer/store/assistant'
import React, { useState } from 'react'

interface ConfigPanelProps {
  chatTemperature: number[]
  chatTopP: number[]
  currentSystemPrompt: string
  onTemperatureChange: (val: number[]) => void
  onTopPChange: (val: number[]) => void
  onSystemPromptChange: (val: string) => void
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  chatTemperature,
  chatTopP,
  currentSystemPrompt,
  onTemperatureChange,
  onTopPChange,
  onSystemPromptChange
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const { currentAssistant, setCurrentAssistant } = useAssistantStore()
  const [displayAssistant, setDisplayAssistant] = useState<Assistant | null>(null)
  const [isExiting, setIsExiting] = useState(false)

  // Handle assistant change with exit animation
  React.useEffect(() => {
    if (currentAssistant) {
      setDisplayAssistant(currentAssistant)
      setIsExiting(false)
    } else if (displayAssistant) {
      // Start exit animation
      setIsExiting(true)
      // Remove after animation completes
      const timer = setTimeout(() => {
        setDisplayAssistant(null)
        setIsExiting(false)
      }, 300) // Match animation duration
      return () => clearTimeout(timer)
    }
  }, [currentAssistant])

  const handleResetDefaults = () => {
    onTemperatureChange([1])
    onTopPChange([1])
    onSystemPromptChange('')
    setCurrentAssistant(null) // Clear assistant selection
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="relative flex items-center group">
          {/* Assistant Icon - Slides in/out with animation */}
          {displayAssistant?.icon && (
            <div
              key={displayAssistant.id}
              className={cn(
                "flex items-center justify-center h-7 px-2 rounded-l-xl",
                "bg-slate-50/50 dark:bg-slate-800/50",
                "border-l border-t border-b border-slate-200/50 dark:border-slate-700/50",
                "transition-all duration-300 ease-out",
                isExiting
                  ? "animate-out slide-out-to-right-2 fade-out-0 duration-300"
                  : "animate-in slide-in-from-right-2 fade-in-0 duration-300",
                "group-hover:bg-slate-100 dark:group-hover:bg-slate-700",
                "group-hover:border-slate-300 dark:group-hover:border-slate-600",
                isOpen && [
                  "bg-slate-100 dark:bg-slate-700",
                  "border-slate-300 dark:border-slate-600"
                ]
              )}
            >
              <span className="text-xs leading-none text-gray-500 hover:text-gray-700 font-medium transition-all">
                {displayAssistant.icon + ' ' + displayAssistant.name}
              </span>
            </div>
          )}

          {/* Token Button - Connects seamlessly with assistant icon */}
          <Button
            variant="outline"
            size="icon"
            role="combobox"
            className={cn(
              "relative h-7 w-7 overflow-hidden",
              "transition-all duration-300 ease-out",
              "bg-slate-50/50 dark:bg-slate-800/50",
              "border border-slate-200/50 dark:border-slate-700/50",
              "group-hover:bg-slate-100 dark:group-hover:bg-slate-700",
              "group-hover:border-slate-300 dark:group-hover:border-slate-600",
              "group-hover:shadow-sm",
              "active:scale-95",
              currentAssistant?.icon ? [
                // When assistant is present, remove left border radius to connect
                "rounded-r-xl rounded-l-none",
                "border-l-0"
              ] : [
                // When no assistant, keep full rounded
                "rounded-xl"
              ],
              isOpen && [
                "bg-slate-100 dark:bg-slate-700",
                "border-slate-300 dark:border-slate-600",
                "shadow-sm"
              ]
            )}
          >
            {/* Animated background on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100/0 via-slate-100/50 to-slate-200/0 dark:from-slate-700/0 dark:via-slate-700/30 dark:to-slate-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* TokensIcon */}
            <TokensIcon
              className={cn(
                "relative z-10 w-4 h-4 text-slate-500 dark:text-slate-400",
                "transition-all duration-300 ease-out",
                "group-hover:text-slate-700 dark:group-hover:text-slate-300",
                "group-hover:scale-110 group-hover:rotate-90",
                isOpen && "rotate-90 scale-110 text-slate-700 dark:text-slate-300"
              )}
            />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-80 p-0 rounded-2xl overflow-hidden",
          "bg-white/95 dark:bg-slate-950/95",
          "backdrop-blur-xl",
          "border border-slate-200/80 dark:border-slate-800/80",
          "shadow-2xl shadow-slate-900/10 dark:shadow-black/50",
          "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        )}
        sideOffset={12}
        align="end"
      >
        <div className="flex flex-col h-[460px]">
          {/* Header with Reset Button */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-br from-slate-50/80 to-slate-100/50 dark:from-slate-900/80 dark:to-slate-900/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className='text-sm font-semibold text-slate-900 dark:text-slate-100 tracking-tight'>
                Configuration
              </span>
              <Badge
                variant={'outline'}
                className={cn(
                  "text-[10px] h-5 px-2 font-medium",
                  "bg-amber-50/50 dark:bg-amber-500/10",
                  "border-amber-200 dark:border-amber-500/20",
                  "text-amber-700 dark:text-amber-400",
                )}
              >
                Session
              </Badge>
            </div>

            {/* Reset Button in Header */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-lg",
                "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300",
                "hover:bg-slate-100 dark:hover:bg-slate-800",
                "transition-all duration-200",
              )}
              onClick={handleResetDefaults}
            >
              <ResetIcon className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-6">

            {/* Parameters Group */}
            <div className="space-y-5 flex-shrink-0">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Model Parameters
                </span>
              </div>

              {/* Temperature and Top P */}
              <div className="grid grid-cols-2 gap-5">
                {/* Temperature */}
                <div className="space-y-3 group">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="temperature"
                      className="text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Temperature
                    </Label>
                    <span className={cn(
                      "text-[10px] font-mono tabular-nums",
                      "px-1.5 py-0.5 rounded",
                      "bg-slate-100 dark:bg-slate-900",
                      "text-slate-600 dark:text-slate-400",
                      "border border-slate-200 dark:border-slate-800"
                    )}>
                      {chatTemperature[0].toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    id="temperature"
                    value={chatTemperature}
                    min={0}
                    max={2}
                    step={0.1}
                    onValueChange={onTemperatureChange}
                    className="[&_.range-thumb]:h-4 [&_.range-thumb]:w-4 [&_.range-thumb]:shadow-md"
                  />
                </div>

                {/* Top P */}
                <div className="space-y-3 group">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="topp"
                      className="text-xs font-medium text-slate-600 dark:text-slate-400"
                    >
                      Top P
                    </Label>
                    <span className={cn(
                      "text-[10px] font-mono tabular-nums",
                      "px-1.5 py-0.5 rounded",
                      "bg-slate-100 dark:bg-slate-900",
                      "text-slate-600 dark:text-slate-400",
                      "border border-slate-200 dark:border-slate-800"
                    )}>
                      {chatTopP[0].toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    id="topp"
                    value={chatTopP}
                    min={0}
                    max={1}
                    step={0.1}
                    onValueChange={onTopPChange}
                    className="[&_.range-thumb]:h-4 [&_.range-thumb]:w-4 [&_.range-thumb]:shadow-md"
                  />
                </div>
              </div>

              {/* Max Tokens */}
              <div className="space-y-3 group pt-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="maxCompletionTokens"
                    className="text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Max Tokens
                  </Label>
                  <span className="text-[10px] text-slate-400 dark:text-slate-600">
                    Default
                  </span>
                </div>
                <Input
                  id="maxCompletionTokens"
                  defaultValue="4096"
                  className={cn(
                    "h-9 text-xs font-mono",
                    "bg-slate-50 dark:bg-slate-900/50",
                    "border border-slate-200 dark:border-slate-800",
                    "outline-none focus:outline-none focus-visible:outline-none",
                    "ring-0 focus:ring-0 focus-visible:ring-0",
                    "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                    "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                    "hover:border-slate-200 dark:hover:border-slate-800",
                    "shadow-sm",
                  )}
                />
              </div>
            </div>

            {/* System Prompt Group */}
            <div className="space-y-1 flex-1 flex flex-col pt-1 min-h-0">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60 flex-shrink-0 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Instructions
                </span>
              </div>

              <Label
                htmlFor="systemPrompt"
                className="sr-only"
              >
                System Prompt
              </Label>
              <Textarea
                id="systemPrompt"
                value={currentSystemPrompt}
                placeholder='You are a helpful assistant...'
                className={cn(
                  "flex-1 text-xs leading-relaxed",
                  "bg-slate-50 dark:bg-slate-900/50",
                  "border border-slate-200 dark:border-slate-800",
                  "outline-none focus:outline-none focus-visible:outline-none",
                  "ring-0 focus:ring-0 focus-visible:ring-0",
                  "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                  "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                  "hover:border-slate-200 dark:hover:border-slate-800",
                  "resize-none p-2",
                  "shadow-sm",
                  "min-h-[100px]"
                )}
                onChange={e => onSystemPromptChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ConfigPanel
