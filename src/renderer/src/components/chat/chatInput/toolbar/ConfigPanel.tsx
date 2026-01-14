import { TokensIcon } from '@radix-ui/react-icons'
import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Slider } from "@renderer/components/ui/slider"
import { Textarea } from '@renderer/components/ui/textarea'
import React from 'react'

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
  const handleResetDefaults = () => {
    onTemperatureChange([1])
    onTopPChange([1])
    onSystemPromptChange('')
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          role="combobox"
          className="h-7 w-7 rounded-2xl bg-gray-100/80 dark:bg-gray-800/80 hover:bg-gray-200/80 dark:hover:bg-gray-700/80 border-gray-300/50 dark:border-gray-600/50"
        >
          <TokensIcon className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 rounded-2xl overflow-hidden bg-white/10 dark:bg-gray-900/90 backdrop-blur-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-2xl"
        sideOffset={8}
        align="end"
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
            <span className='text-sm font-semibold text-gray-900 dark:text-gray-100'>Chat Configuration</span>
            <Badge variant={'outline'} className='text-[10px] h-5 px-1.5 font-normal bg-white dark:bg-gray-800 border-yellow-400 text-yellow-500'>Session</Badge>
          </div>

          <div className="p-4 space-y-2">
            {/* Temperature Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature" className="text-xs font-medium text-gray-700 dark:text-gray-300">Temperature</Label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{chatTemperature}</span>
              </div>
              <Slider
                id="temperature"
                value={chatTemperature}
                min={0}
                max={1}
                step={0.1}
                onValueChange={onTemperatureChange}
                className="[&_.range-thumb]:h-4 [&_.range-thumb]:w-4"
              />
            </div>

            {/* Top P Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="topp" className="text-xs font-medium text-gray-700 dark:text-gray-300">Top P</Label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{chatTopP}</span>
              </div>
              <Slider
                id="topp"
                value={chatTopP}
                min={0}
                max={1}
                step={0.1}
                onValueChange={onTopPChange}
                className="[&_.range-thumb]:h-4 [&_.range-thumb]:w-4"
              />
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <Label htmlFor="maxCompletionTokens" className="text-xs font-medium text-gray-700 dark:text-gray-300">Max Tokens</Label>
              <Input
                id="maxCompletionTokens"
                defaultValue="4096"
                className="h-8 text-xs bg-white dark:bg-gray-950/50 border-gray-200 dark:border-gray-800 focus-visible:ring-1 focus-visible:ring-blue-500"
              />
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <Label htmlFor="systemPrompt" className="text-xs font-medium text-gray-700 dark:text-gray-300">System Prompt</Label>
              <Textarea
                id="systemPrompt"
                value={currentSystemPrompt}
                placeholder='You are a helpful assistant...'
                className="min-h-[80px] text-xs bg-white dark:bg-gray-950/50 border-gray-200 dark:border-gray-800 focus-visible:ring-1 focus-visible:ring-blue-500 resize-none p-2"
                onChange={e => onSystemPromptChange(e.target.value)}
              />
            </div>
          </div>

          {/* Footer Action */}
          <div className="p-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
              onClick={handleResetDefaults}
            >
              Reset to Defaults
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ConfigPanel
