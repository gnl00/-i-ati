import React from 'react'
import { BadgePlus, Check, ChevronsUpDown, Pencil } from 'lucide-react'
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
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { useAssistantStore } from '@renderer/store/assistant'
import { getProviderIcon } from '@renderer/utils/providerIcons'

interface AddAssistantCardProps {
  isExpanded: boolean
  variant?: 'card' | 'compact'
  mode?: 'create' | 'edit'
  assistantToEdit?: Assistant | null
  modelGroups: Array<{
    account: ProviderAccount
    definition?: ProviderDefinition
    models: AccountModel[]
  }>
}

export const AddAssistantDrawer: React.FC<AddAssistantCardProps> = ({
  isExpanded,
  variant = 'card',
  mode = 'create',
  assistantToEdit = null,
  modelGroups
}) => {
  const { addAssistant, updateAssistantById, assistants } = useAssistantStore()
  const [open, setOpen] = React.useState(false)
  const [modelOpen, setModelOpen] = React.useState(false)
  const [selectedModel, setSelectedModel] = React.useState<{
    accountId: string
    modelId: string
    label: string
  } | null>(null)
  const [assistantName, setAssistantName] = React.useState('')
  const [assistantDescription, setAssistantDescription] = React.useState('')
  const [assistantPrompt, setAssistantPrompt] = React.useState('')
  const [isPinned, setIsPinned] = React.useState(false)
  const [sortIndex, setSortIndex] = React.useState(0)
  const [submitError, setSubmitError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const drawerContentRef = React.useRef<HTMLDivElement | null>(null)
  const fieldClass = cn(
    "h-10 rounded-xl",
    "bg-slate-50/90 dark:bg-slate-900/60",
    "border border-slate-200/90 dark:border-slate-800",
    "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
    "ring-0 focus:ring-0 focus-visible:ring-0",
    "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
    "focus:border-sky-400/70 dark:focus:border-sky-500/60",
    "hover:border-slate-300/80 dark:hover:border-slate-700/80",
    "placeholder:text-slate-400 dark:placeholder:text-slate-500",
    "shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-all duration-200"
  )

  React.useEffect(() => {
    if (open) {
      if (mode === 'edit' && assistantToEdit) {
        setAssistantName(assistantToEdit.name)
        setAssistantDescription(assistantToEdit.description ?? '')
        setAssistantPrompt(assistantToEdit.systemPrompt ?? '')
        setIsPinned(Boolean(assistantToEdit.isPinned))
        setSortIndex(assistantToEdit.sortIndex ?? 0)

        const matchedGroup = modelGroups.find(group => group.account.id === assistantToEdit.modelRef.accountId)
        const matchedModel = matchedGroup?.models.find(model => model.id === assistantToEdit.modelRef.modelId)
        setSelectedModel({
          accountId: assistantToEdit.modelRef.accountId,
          modelId: assistantToEdit.modelRef.modelId,
          label: matchedModel?.label ?? assistantToEdit.modelRef.modelId
        })
      } else {
        const maxSortIndex = assistants.reduce((max, item) => Math.max(max, item.sortIndex ?? 0), -1)
        setSortIndex(maxSortIndex + 1)
      }
    }
  }, [open, assistants, mode, assistantToEdit, modelGroups])

  const resetForm = React.useCallback(() => {
    setAssistantName('')
    setAssistantDescription('')
    setAssistantPrompt('')
    setSelectedModel(null)
    setIsPinned(false)
    setSubmitError('')
  }, [])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }, [resetForm])

  const handleCreateAssistant = React.useCallback(async () => {
    if (!assistantName.trim()) {
      setSubmitError('Name is required.')
      return
    }
    if (!selectedModel) {
      setSubmitError('Model is required.')
      return
    }
    if (!assistantPrompt.trim()) {
      setSubmitError('System Prompt is required.')
      return
    }

    setSubmitError('')
    setIsSubmitting(true)
    try {
      const now = Date.now()
      const safeSortIndex = Number.isFinite(sortIndex) ? Math.max(0, Math.floor(sortIndex)) : 0
      if (mode === 'edit' && assistantToEdit) {
        const updatedAssistant: Assistant = {
          ...assistantToEdit,
          name: assistantName.trim(),
          description: assistantDescription.trim() || undefined,
          modelRef: {
            accountId: selectedModel.accountId,
            modelId: selectedModel.modelId
          },
          systemPrompt: assistantPrompt.trim(),
          sortIndex: safeSortIndex,
          isPinned,
          updatedAt: now
        }
        await updateAssistantById(updatedAssistant)
      } else {
        const assistant: Assistant = {
          id: `assistant_${now}_${Math.random().toString(36).slice(2, 8)}`,
          name: assistantName.trim(),
          description: assistantDescription.trim() || undefined,
          modelRef: {
            accountId: selectedModel.accountId,
            modelId: selectedModel.modelId
          },
          systemPrompt: assistantPrompt.trim(),
          sortIndex: safeSortIndex,
          isPinned,
          createdAt: now,
          updatedAt: now,
          isBuiltIn: false,
          isDefault: false
        }
        await addAssistant(assistant)
      }
      setOpen(false)
      resetForm()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : (mode === 'edit' ? 'Failed to update assistant.' : 'Failed to create assistant.'))
    } finally {
      setIsSubmitting(false)
    }
  }, [assistantName, selectedModel, assistantPrompt, sortIndex, isPinned, assistantDescription, mode, assistantToEdit, addAssistant, updateAssistantById, resetForm])

  return (
    <div>
      <Drawer open={open} onOpenChange={handleOpenChange}>
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
                "hover:shadow-[0_8px_20px_-14px_rgba(14,165,233,0.55)]",
                "active:scale-[0.98]",
                "transition-all duration-200",
                !isExpanded && "opacity-0 pointer-events-none"
              )}
            >
              {mode === 'edit' ? (
                <>
                  <Pencil className="w-3.5 h-3.5 mr-1.5 transition-transform duration-200 group-hover/add:-rotate-12" />
                  Edit
                </>
              ) : (
                <>
                  <BadgePlus className="w-3.5 h-3.5 mr-1.5 transition-transform duration-200 group-hover/add:rotate-90" />
                  Add Assistant
                </>
              )}
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
          className="max-h-[88vh] border-t border-slate-200/70 dark:border-slate-800/70 bg-background/95 backdrop-blur-xl"
        >
          <div className="w-12 h-1 bg-slate-300/70 dark:bg-slate-700/70 rounded-full mx-auto mt-3 mb-0" />

          <DrawerHeader className="space-y-2 pb-2 px-4 md:px-6 pt-3">
            <div className="mx-auto w-full max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 dark:border-sky-900/70 bg-sky-50/70 dark:bg-sky-950/30 px-2.5 py-1">
                <BadgePlus className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span className="text-[11px] font-semibold tracking-wide text-sky-700 dark:text-sky-300">
                  {mode === 'edit' ? 'EDIT ASSISTANT' : 'NEW ASSISTANT'}
                </span>
              </div>
              <DrawerTitle className="mt-3 text-[22px] font-semibold tracking-tight text-foreground">
                {mode === 'edit' ? 'Edit Assistant' : 'Create Assistant'}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {mode === 'edit'
                  ? 'Update profile, model, behavior prompt, and ordering.'
                  : 'Configure profile, model, and behavior prompt.'}
              </DrawerDescription>
            </div>
          </DrawerHeader>

          <div className="px-3 md:px-4 pb-3 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200/70 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/45 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm p-3 md:p-4 space-y-4">
              <div className="grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-name" className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                      Name <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                      id="assistant-name"
                      placeholder="e.g., Code Helper"
                      className={fieldClass}
                      value={assistantName}
                      onChange={e => setAssistantName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-model" className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                      Model <span className="text-red-500 ml-0.5">*</span>
                    </Label>

                    <Popover open={modelOpen} onOpenChange={setModelOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="assistant-model"
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full h-10 justify-between group rounded-xl",
                            "bg-slate-50/90 dark:bg-slate-900/60",
                            "border border-slate-200/90 dark:border-slate-800",
                            "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                            "ring-0 focus:ring-0 focus-visible:ring-0",
                            "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                            "focus:border-sky-400/70 dark:focus:border-sky-500/60",
                            "hover:bg-slate-50 dark:hover:bg-slate-900/60",
                            "hover:border-slate-300/80 dark:hover:border-slate-700/80",
                            "shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-all duration-200"
                          )}
                        >
                          <span className={cn("truncate", selectedModel ? "text-slate-800 dark:text-slate-100" : "text-muted-foreground")}>
                            {selectedModel?.label ?? 'Select a model...'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-[1px]" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        portalContainer={drawerContentRef.current}
                        className="w-full p-0 rounded-xl overflow-hidden border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/95 backdrop-blur-xl shadow-[0_20px_48px_-28px_rgba(15,23,42,0.5)]"
                        sideOffset={8}
                        align="start"
                      >
                        <Command className="bg-transparent dark:bg-slate-900">
                          <CommandInput placeholder="Search models..." className="h-auto" />
                          <CommandList className="max-h-64">
                            <CommandEmpty>No model found.</CommandEmpty>
                            {modelGroups.map(group => (
                              <CommandGroup
                                key={group.account.id}
                                value={group.account.label}
                                className="scroll-smooth **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground"
                                heading={
                                  <div className="flex rounded items-center gap-2 px-2 py-1.5 dark:bg-slate-800/80 -mx-2 sticky top-0 z-10 border-b border-black/5 dark:border-slate-700">
                                    <img
                                      src={getProviderIcon(group.definition?.iconKey || group.definition?.id || group.account.providerId)}
                                      alt={group.definition?.displayName || group.account.label}
                                      className="w-4 h-4 object-contain dark:invert dark:brightness-90 opacity-70"
                                    />
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-tight">
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
                                        "dark:aria-selected:bg-sky-900/20",
                                        "aria-selected:text-sky-700 dark:aria-selected:text-sky-300",
                                        "data-[selected=true]:bg-black/5"
                                      )}
                                    >
                                      <span className="truncate">{model.label}</span>
                                      {selectedModel?.accountId === group.account.id && selectedModel?.modelId === model.id && (
                                        <Check className="ml-auto h-4 w-4 text-sky-600 dark:text-sky-400" />
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
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="assistant-description" className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                    Description
                  </Label>
                  <Input
                    id="assistant-description"
                    placeholder="e.g., Helps with debugging and refactoring"
                    className={fieldClass}
                    value={assistantDescription}
                    onChange={e => setAssistantDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-sort-index" className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                      Sort Index
                    </Label>
                    <Input
                      id="assistant-sort-index"
                      type="number"
                      min={0}
                      className={fieldClass}
                      value={String(sortIndex)}
                      onChange={e => {
                        const nextValue = Number.parseInt(e.target.value, 10)
                        setSortIndex(Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0)
                      }}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-pin-switch" className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                      Pin to Top
                    </Label>
                    <div className="h-10 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/60 px-3 flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Pinned assistants appear first</span>
                      <Switch
                        id="assistant-pin-switch"
                        checked={isPinned}
                        onCheckedChange={setIsPinned}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="assistant-prompt" className="text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
                      System Prompt <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                  </div>
                  <Textarea
                    id="assistant-prompt"
                    placeholder="You are a helpful assistant that..."
                    className={cn(
                      "min-h-[150px] rounded-xl resize-none",
                      "bg-slate-50/90 dark:bg-slate-900/60",
                      "border border-slate-200/90 dark:border-slate-800",
                      "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
                      "ring-0 focus:ring-0 focus-visible:ring-0",
                      "ring-offset-0 focus:ring-offset-0 focus-visible:ring-offset-0",
                      "focus:border-sky-400/70 dark:focus:border-sky-500/60",
                      "hover:border-slate-300/80 dark:hover:border-slate-700/80",
                      "placeholder:text-slate-400 dark:placeholder:text-slate-500",
                      "shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-all duration-200"
                    )}
                    value={assistantPrompt}
                    onChange={e => setAssistantPrompt(e.target.value)}
                  />
                </div>
                {submitError && (
                  <p className="text-xs text-rose-500 dark:text-rose-400">
                    {submitError}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DrawerFooter className="flex-row gap-3 px-4 md:px-6 py-4 border-t border-slate-200/70 dark:border-slate-800/70 bg-slate-50/60 dark:bg-slate-900/30 backdrop-blur-sm">
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="flex-1 h-10 rounded-xl border-slate-300/80 dark:border-slate-700/80 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:border-slate-400/70 dark:hover:border-slate-600/80 transition-all duration-200"
              >
                Cancel
              </Button>
            </DrawerClose>
            <Button
              className="flex-1 h-10 rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-all duration-200 shadow-[0_12px_24px_-14px_rgba(14,165,233,0.75)] hover:shadow-[0_16px_28px_-14px_rgba(14,165,233,0.85)] active:scale-[0.99]"
              disabled={isSubmitting}
              onClick={handleCreateAssistant}
            >
              {isSubmitting ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Create Assistant')}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
