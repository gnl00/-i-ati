import React from 'react'
import { BadgePlus, ChevronsUpDown } from 'lucide-react'
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
  modelGroups: Array<{
    account: ProviderAccount
    definition?: ProviderDefinition
    models: AccountModel[]
  }>
}

export const AddAssistantDrawer: React.FC<AddAssistantCardProps> = ({ isExpanded, modelGroups }) => {
  return (
    <div
      className={cn(
        "group/card relative flex flex-col items-center justify-center p-4 h-24 rounded-xl border transition-all duration-300 ease-out",
        "border-dashed border-border/60 hover:border-border/80",
        "bg-transparent hover:bg-accent/30",
        isExpanded ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      )}
    >
      <Drawer>
        <DrawerTrigger asChild>
          <div className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
            <div className="relative">
              {/* Subtle glow effect */}
              <div className="absolute inset-0 rounded-full bg-primary/5 scale-0 group-hover/card:scale-125 transition-transform duration-500 ease-out" />

              {/* Icon container */}
              <div className="relative p-2.5 rounded-full bg-muted/50 group-hover/card:bg-muted transition-all duration-300 ease-out">
                <BadgePlus className="w-[18px] h-[18px] text-muted-foreground/70 group-hover/card:text-foreground transition-colors duration-300" />
              </div>
            </div>

            <p className="text-[11px] font-medium text-muted-foreground/80 mt-2.5 uppercase tracking-wider group-hover/card:text-foreground transition-colors duration-300">
              Create
            </p>
          </div>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh] border-t border-border/50 bg-background/95 backdrop-blur-xl">
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
                      className="h-10 rounded-lg border-border/60 bg-background/50 hover:border-border focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:border-primary/60 transition-all duration-200"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-model" className="text-sm font-medium text-foreground">
                      Model <span className="text-red-500 ml-0.5">*</span>
                    </Label>

                    {/* MODEL SELECTOR - UNCHANGED */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="assistant-model"
                          variant="outline"
                          role="combobox"
                          className="w-full h-10 justify-between border-border/60 bg-background/50 hover:bg-accent/50 transition-all group rounded-lg"
                        >
                          <span className="text-muted-foreground">Select a model...</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 transition-all duration-300 group-hover:opacity-100" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
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
                                      className={cn(
                                        "pl-4 py-2.5 cursor-pointer rounded-xl",
                                        "transition-all duration-200",
                                        "dark:aria-selected:bg-emerald-900/20",
                                        "aria-selected:text-emerald-700 dark:aria-selected:text-emerald-300",
                                        "data-[selected=true]:bg-black/5"
                                      )}
                                    >
                                      <span className="truncate">{model.label}</span>
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
                    className="h-10 rounded-lg border-border/60 bg-background/50 hover:border-border focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:border-primary/60 transition-all duration-200"
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
                    className="min-h-[140px] resize-none border-border/60 bg-background/50 hover:border-border focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:border-primary/60 transition-all duration-200"
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
