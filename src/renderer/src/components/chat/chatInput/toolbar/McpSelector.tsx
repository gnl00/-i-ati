import { Badge } from "@renderer/components/ui/badge"
import { Button } from '@renderer/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { Check, LoaderCircle, Plug } from 'lucide-react'
import React from 'react'

interface McpSelectorProps {
  selectedMcpServerNames: string[]
  mcpServerConfig: any
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onMcpToolSelected: (serverName: string, serverConfig: any) => void
  isConnectingMcpServer: (serverName: string) => boolean
  triggerClassName?: string
}

const McpSelector: React.FC<McpSelectorProps> = ({
  selectedMcpServerNames,
  mcpServerConfig,
  isOpen,
  onOpenChange,
  onMcpToolSelected,
  isConnectingMcpServer,
  triggerClassName
}) => {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={isOpen}
          className={triggerClassName}
        >
          {/* Animated background gradient on hover (active state only) */}
          {selectedMcpServerNames.length > 0 && (
            <div className="absolute inset-0 bg-linear-to-r from-amber-100/0 via-amber-100/50 to-orange-100/0 dark:from-amber-900/0 dark:via-amber-900/30 dark:to-orange-900/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}

          <span className="flex grow justify-center overflow-x-hidden relative z-10">
            {selectedMcpServerNames.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-500">MCP Tools</span>
            ) : (
              <span className="truncate animate-in fade-in slide-in-from-left-1 duration-300">
                {selectedMcpServerNames[0]}
              </span>
            )}
          </span>

          {selectedMcpServerNames.length > 1 && (
            <Badge className={cn(
              "relative z-10 h-4 min-w-[16px] px-1 justify-center text-[9px] shadow-none",
              "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
              "border border-amber-300/50 dark:border-amber-700/50",
              "hover:bg-amber-200 dark:hover:bg-amber-900/60",
              "transition-all duration-200",
              "animate-in zoom-in duration-300 delay-100"
            )}>
              +{selectedMcpServerNames.length - 1}
            </Badge>
          )}

          <Plug
            className={cn(
              "flex opacity-50 w-4 h-4 transition-all duration-300 relative z-10",
              "group-hover:opacity-100",
              selectedMcpServerNames.length > 0 && "group-hover:rotate-12",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full p-0 shadow-lg ml-1 rounded-xl overflow-hidden border-transparent bg-white/10 backdrop-blur-xl dark:bg-gray-900"
        sideOffset={8}
        align="start"
      >
        <Command className='rounded-xl bg-transparent dark:bg-gray-900'>
          <CommandInput placeholder="Search tool" className="h-auto" />
          <CommandList>
            <CommandGroup className='scroll-smooth'>
              {mcpServerConfig && mcpServerConfig.mcpServers &&
                Object.entries(mcpServerConfig.mcpServers).map(([mcpName, mcpCfg], idx) => (
                  <CommandItem
                    key={idx}
                    value={mcpName}
                    className={cn(
                      "pl-4 py-2.5 cursor-pointer rounded-xl",
                      "transition-all duration-200",
                      "aria-selected:bg-amber-50 dark:aria-selected:bg-amber-900/20",
                      "aria-selected:text-amber-700 dark:aria-selected:text-amber-300",
                      "data-[selected=true]:bg-black/5"
                    )}
                    onSelect={(selectVal) => {
                      onMcpToolSelected(selectVal, mcpCfg)
                    }}
                  >
                    <span className="truncate">{mcpName}</span>
                    {isConnectingMcpServer(mcpName) && (
                      <LoaderCircle className='ml-auto w-4 h-4 animate-spin text-amber-500' />
                    )}
                    {selectedMcpServerNames.includes(mcpName) && (
                      <Check className={cn(
                        "ml-auto w-4 h-4 text-amber-600 dark:text-amber-400",
                        "animate-in zoom-in duration-200"
                      )} />
                    )}
                  </CommandItem>
                ))
              }
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default McpSelector
