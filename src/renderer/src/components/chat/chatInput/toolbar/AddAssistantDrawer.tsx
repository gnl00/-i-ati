import React from 'react'
import { BadgePlus, Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@renderer/components/ui/command'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { getProviderIcon } from '@renderer/utils/providerIcons'

interface AddAssistantCardProps {
  isExpanded: boolean
  variant?: 'card' | 'compact'
  modelGroups: Array<{
    account: ProviderAccount
    definition?: ProviderDefinition
    models: AccountModel[]
  }>
}

export const AddAssistantDrawer: React.FC<AddAssistantCardProps> = ({ isExpanded, variant = 'card', modelGroups }) => {
  const [modelOpen, setModelOpen] = React.useState(false)
  const [selectedModel, setSelectedModel] = React.useState<{
    accountId: string
    modelId: string
    label: string
  } | null>(null)
  const drawerContentRef = React.useRef<HTMLDivElement | null>(null)

  return (
    <div>
      <Drawer>
        <DrawerTrigger asChild>
          {variant === 'compact' ? (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "group/add h-7 rounded-full px-2.5 text-[11px] font-medium",
                "border border-dashed border-slate-300/80 dark:border-slate-700/80",
                "bg-slate-50/75 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300",
                "hover:bg-sky-50/90 dark:hover:bg-sky-950/30",
                "hover:border-sky-300/90 dark:hover:border-sky-600/70",
                "hover:text-sky-700 dark:hover:text-sky-300",
                "active:scale-[0.98]",
                "transition-all duration-200",
                !isExpanded && "opacity-0 pointer-events-none"
              )}
            >
              <BadgePlus className="w-3.5 h-3.5 mr-1.5 transition-transform duration-200 group-hover/add:rotate-90" />
              Add Assistant
            </Button>
          ) : (
            <div
              className={cn(
                "group/card relative flex flex-col items-center justify-center p-4 h-24 rounded-xl border transition-all duration-300 ease-out",
                "border-dashed border-border/60 hover:border-border/80",
                "bg-transparent hover:bg-accent/30",
                isExpanded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
              )}
            >
              <div className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/5 scale-0 group-hover/card:scale-125 transition-transform duration-500 ease-out" />
                  <div className="relative p-2.5 rounded-full bg-muted/50 group-hover/card:bg-muted transition-all duration-300 ease-out">
                    <BadgePlus className="w-[18px] h-[18px] text-muted-foreground/70 group-hover/card:text-foreground transition-colors duration-300" />
                  </div>
                </div>

                <p className="text-[11px] font-medium text-muted-foreground/80 mt-2.5 uppercase tracking-wider group-hover/card:text-foreground transition-colors duration-300">
                  Create
                </p>
              </div>
            </div>
          )}
        </DrawerTrigger>
        <DrawerContent
          ref={drawerContentRef}
          className="max-h-[85vh] border-t border-border/50 bg-background/95 backdrop-blur-xl"
        >
          {/* Decorative top line */}
          <div className="w-12 h-1 bg-muted/40 rounded-full mx-auto mt-3 mb-0" />

          <DrawerHeader className="space-y-1.5 pb-1 px-6 pt-2">
            <DrawerTitle className="text-xl font-semibold tracking-tight text-foreground">
              Create Assistant
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground leading-relaxed">
              Customize your AI assistant with a name, model, and system prompt.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-3 pb-2 overflow-y-auto">
            {/* Unified Form Section */}
            <div className="rounded-2xl bg-card/40 backdrop-blur-sm p-3 space-y-4">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-name" className="text-sm font-medium text-foreground">
                      Name <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                      id="assistant-name"
                      placeholder="e.g., Code Helper"
                      className={cn(
                        "h-10 rounded-lg",
                        "bg-slate-50 dark:bg-slate-900/50",
                        "border border-slate-200 dark:border-slate-800",
                        "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                        "ring-0 focus:ring-0 focus-visible:ring-0",
                        "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                        "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                        "hover:border-slate-200 dark:hover:border-slate-800",
                        "shadow-xs transition-all duration-200"
                      )}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-model" className="text-sm font-medium text-foreground">
                      Model <span className="text-red-500 ml-0.5">*</span>
                    </Label>

                    {/* MODEL SELECTOR - UNCHANGED */}
                    <Popover open={modelOpen} onOpenChange={setModelOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="assistant-model"
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full h-10 justify-between group rounded-lg",
                            "bg-slate-50 dark:bg-slate-900/50",
                            "border border-slate-200 dark:border-slate-800",
                            "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                            "ring-0 focus:ring-0 focus-visible:ring-0",
                            "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                            "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                            "hover:bg-slate-50 dark:hover:bg-slate-900/50",
                            "hover:border-slate-200 dark:hover:border-slate-800",
                            "shadow-xs transition-all duration-200"
                          )}
                        >
                          <span className={cn("truncate", selectedModel ? "text-foreground" : "text-muted-foreground")}>
                            {selectedModel?.label ?? 'Select a model...'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 transition-all duration-300 group-hover:opacity-100" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        portalContainer={drawerContentRef.current}
                        className="w-full shadow-lg p-0 rounded-xl overflow-hidden border-transparent bg-white/10 backdrop-blur-xl dark:bg-gray-900"
                        sideOffset={8}
                        align="start"
                      >
                        <Command className="bg-transparent dark:bg-gray-900">
                          <CommandInput placeholder="Search models..." className="h-auto" />
                          <CommandList className="max-h-64">
                            <CommandEmpty>No model found.</CommandEmpty>
                            {modelGroups.map(group => (
                              <CommandGroup
                                key={group.account.id}
                                value={group.account.label}
                                className="scroll-smooth **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground"
                                heading={
                                  <div className="flex rounded items-center gap-2 px-2 py-1.5 dark:bg-gray-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-gray-800">
                                    <img
                                      src={getProviderIcon(group.definition?.iconKey || group.definition?.id || group.account.providerId)}
                                      alt={group.definition?.displayName || group.account.label}
                                      className="w-4 h-4 object-contain dark:invert dark:brightness-90 opacity-70"
                                    />
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
                                      {group.definition?.displayName || group.account.label}
                                    </span>
                                  </div>
                                }
                              >
                                <div className="pt-1">
                                  {group.models.map(model => (
                                    <CommandItem
                                      key={`${group.account.id}/${model.id}`}
                                      value={`${group.account.id}/${model.id}`}
                                      onSelect={() => {
                                        setSelectedModel({
                                          accountId: group.account.id,
                                          modelId: model.id,
                                          label: model.label
                                        })
                                        setModelOpen(false)
                                      }}
                                      className={cn(
                                        "pl-4 py-2.5 cursor-pointer rounded-xl",
                                        "transition-all duration-200",
                                        "dark:aria-selected:bg-emerald-900/20",
                                        "aria-selected:text-emerald-700 dark:aria-selected:text-emerald-300",
                                        "data-[selected=true]:bg-black/5"
                                      )}
                                    >
                                      <span className="truncate">{model.label}</span>
                                      {selectedModel?.accountId === group.account.id && selectedModel?.modelId === model.id && (
                                        <Check className="ml-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                      )}
                                    </CommandItem>
                                  ))}
                                </div>
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {/* END MODEL SELECTOR */}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="assistant-description" className="text-sm font-medium text-foreground">
                    Description
                  </Label>
                  <Input
                    id="assistant-description"
                    placeholder="e.g., Helps with debugging and refactoring"
                    className={cn(
                      "h-10 rounded-lg",
                      "bg-slate-50 dark:bg-slate-900/50",
                      "border border-slate-200 dark:border-slate-800",
                      "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                      "ring-0 focus:ring-0 focus-visible:ring-0",
                      "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                      "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                      "hover:border-slate-200 dark:hover:border-slate-800",
                      "shadow-xs transition-all duration-200"
                    )}
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="assistant-prompt" className="text-sm font-medium text-foreground">
                      System Prompt <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                  </div>
                  <Textarea
                    id="assistant-prompt"
                    placeholder="You are a helpful assistant that..."
                    className={cn(
                      "min-h-[140px] resize-none",
                      "bg-slate-50 dark:bg-slate-900/50",
                      "border border-slate-200 dark:border-slate-800",
                      "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                      "ring-0 focus:ring-0 focus-visible:ring-0",
                      "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                      "focus:border-blue-500/50 dark:focus:border-blue-500/50",
                      "hover:border-slate-200 dark:hover:border-slate-800",
                      "shadow-xs transition-all duration-200"
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <DrawerFooter className="flex-row gap-3 px-6 py-4 border-t border-border/50 bg-muted/20">
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="flex-1 h-10 border-border/60 hover:bg-accent/50 hover:border-border transition-all duration-200"
              >
                Cancel
              </Button>
            </DrawerClose>
            <Button className="flex-1 h-10 bg-foreground hover:bg-foreground/90 text-background transition-all duration-200 shadow-sm hover:shadow">
              Create Assistant
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
