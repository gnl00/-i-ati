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
          <span className="flex flex-grow justify-center overflow-x-hidden">
            {selectedMcpServerNames.length === 0 ? 'MCP Tools' : selectedMcpServerNames[0]}
          </span>
          {selectedMcpServerNames.length > 1 && (
            <Badge className="h-4 min-w-[16px] px-1 justify-center bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors shadow-none">
              +{selectedMcpServerNames.length - 1}
            </Badge>
          )}
          <Plug className="flex opacity-50 w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-full p-0 shadow-lg ml-1 rounded-xl overflow-hidden bg-white/10 backdrop-blur-xl dark:bg-gray-900"
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
                    onSelect={(selectVal) => {
                      onMcpToolSelected(selectVal, mcpCfg)
                    }}
                  >
                    <span>{mcpName}</span>
                    {isConnectingMcpServer(mcpName) && (
                      <LoaderCircle className='ml-auto animate-spin' />
                    )}
                    {selectedMcpServerNames.includes(mcpName) && (
                      <Check className={cn("ml-auto text-green-600")} />
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
