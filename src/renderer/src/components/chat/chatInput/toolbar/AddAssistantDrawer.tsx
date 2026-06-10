import React from 'react'
import { BadgePlus, Pencil } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { DrawerFieldModelSelector } from '@renderer/components/shared/model-selector'
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
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import type { ModelOption } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'

interface AddAssistantCardProps {
  isExpanded: boolean
  variant?: 'card' | 'compact'
  mode?: 'create' | 'edit'
  assistantToEdit?: Assistant | null
  modelOptions: ModelOption[]
  trigger?: React.ReactElement | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const AddAssistantDrawer: React.FC<AddAssistantCardProps> = ({
  isExpanded,
  variant = 'card',
  mode = 'create',
  assistantToEdit = null,
  modelOptions,
  trigger,
  open,
  onOpenChange
}) => {
  const { addAssistant, updateAssistantById, assistants } = useAssistantStore()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [modelOpen, setModelOpen] = React.useState(false)
  const [selectedModelRef, setSelectedModelRef] = React.useState<ModelRef | null>(null)
  const [assistantName, setAssistantName] = React.useState('')
  const [assistantDescription, setAssistantDescription] = React.useState('')
  const [assistantPrompt, setAssistantPrompt] = React.useState('')
  const [sortIndex, setSortIndex] = React.useState(0)
  const [submitError, setSubmitError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const drawerContentRef = React.useRef<HTMLDivElement | null>(null)
  const initializedSessionKeyRef = React.useRef<string | null>(null)
  const insetFieldBaseClass = cn(
    'rounded-xl border border-transparent bg-gray-100/80 text-[12.5px] text-gray-800 shadow-inner',
    'ring-1 ring-inset ring-gray-200/80',
    'outline-hidden focus:outline-hidden focus-visible:outline-hidden',
    'placeholder:text-gray-400/80',
    'transition-[background-color,border-color,box-shadow,color] duration-150',
    'hover:bg-gray-100 hover:ring-gray-300/80',
    'focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-400/70 focus-visible:ring-offset-0',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'dark:bg-gray-950/45 dark:text-gray-100 dark:ring-gray-800/80 dark:placeholder:text-gray-600',
    'dark:hover:bg-gray-950/60 dark:hover:ring-gray-700/90',
    'dark:focus-visible:border-gray-700 dark:focus-visible:ring-gray-600/80'
  )
  const inputFieldClass = cn('h-10', insetFieldBaseClass)
  const textareaFieldClass = cn('min-h-[150px] resize-none', insetFieldBaseClass)
  const drawerOpen = open ?? internalOpen

  React.useEffect(() => {
    if (!drawerOpen) {
      initializedSessionKeyRef.current = null
      return
    }

    const sessionKey = `${mode}:${assistantToEdit?.id ?? 'create'}`
    if (initializedSessionKeyRef.current === sessionKey) {
      return
    }

    if (mode === 'edit' && !assistantToEdit) {
      return
    }

    initializedSessionKeyRef.current = sessionKey
    setSubmitError('')

    if (mode === 'edit' && assistantToEdit) {
      setAssistantName(assistantToEdit.name)
      setAssistantDescription(assistantToEdit.description ?? '')
      setAssistantPrompt(assistantToEdit.systemPrompt ?? '')
      setSortIndex(assistantToEdit.sortIndex ?? 0)

      setSelectedModelRef({
        accountId: assistantToEdit.modelRef.accountId,
        modelId: assistantToEdit.modelRef.modelId
      })
      return
    }

    const maxSortIndex = assistants.reduce((max, item) => Math.max(max, item.sortIndex ?? 0), -1)
    setAssistantName('')
    setAssistantDescription('')
    setAssistantPrompt('')
    setSelectedModelRef(null)
    setSortIndex(maxSortIndex + 1)
  }, [drawerOpen, assistants, mode, assistantToEdit])

  const resetForm = React.useCallback(() => {
    setAssistantName('')
    setAssistantDescription('')
    setAssistantPrompt('')
    setSelectedModelRef(null)
    setSortIndex(0)
    setSubmitError('')
  }, [])

  const selectedModel = React.useMemo(() => {
    if (!selectedModelRef) {
      return undefined
    }
    return modelOptions.find(option =>
      option.account.id === selectedModelRef.accountId
      && option.model.id === selectedModelRef.modelId
    )
  }, [modelOptions, selectedModelRef])

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (open === undefined) {
      setInternalOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      setModelOpen(false)
      resetForm()
    }
  }, [open, onOpenChange, resetForm])

  const handleCreateAssistant = React.useCallback(async () => {
    if (!assistantName.trim()) {
      setSubmitError('Name is required.')
      return
    }
    if (!selectedModelRef) {
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
            accountId: selectedModelRef.accountId,
            modelId: selectedModelRef.modelId
          },
          systemPrompt: assistantPrompt.trim(),
          sortIndex: safeSortIndex,
          updatedAt: now
        }
        await updateAssistantById(updatedAssistant)
      } else {
        const assistant: Assistant = {
          id: `assistant_${now}_${Math.random().toString(36).slice(2, 8)}`,
          name: assistantName.trim(),
          description: assistantDescription.trim() || undefined,
          modelRef: {
            accountId: selectedModelRef.accountId,
            modelId: selectedModelRef.modelId
          },
          systemPrompt: assistantPrompt.trim(),
          sortIndex: safeSortIndex,
          createdAt: now,
          updatedAt: now,
          isBuiltIn: false,
          isDefault: false
        }
        await addAssistant(assistant)
      }
      handleOpenChange(false)
      resetForm()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : (mode === 'edit' ? 'Failed to update assistant.' : 'Failed to create assistant.'))
    } finally {
      setIsSubmitting(false)
    }
  }, [assistantName, selectedModelRef, assistantPrompt, sortIndex, assistantDescription, mode, assistantToEdit, addAssistant, updateAssistantById, handleOpenChange, resetForm])

  const defaultTriggerElement = (
    variant === 'compact' ? (
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "group/add h-7 rounded-full px-2.5 text-[11px] font-medium",
          "border border-dashed border-border/55",
          "bg-card/70 text-muted-foreground",
          "hover:bg-foreground/[0.032] hover:border-foreground/7 hover:text-foreground/85",
          "hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.42)]",
          "focus-visible:ring-2 focus-visible:ring-ring/30",
          "active:scale-[0.98]",
          "transition-[background-color,border-color,color,box-shadow,transform] duration-[240ms] ease-out",
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
    )
  )
  const triggerElement = trigger === undefined ? defaultTriggerElement : trigger

  return (
    <div>
      <Drawer open={drawerOpen} onOpenChange={handleOpenChange}>
        {triggerElement && (
          <DrawerTrigger asChild>
            {triggerElement}
          </DrawerTrigger>
        )}
        <DrawerContent
          ref={drawerContentRef}
          className="max-h-[88vh] border-t border-border bg-background/95 backdrop-blur-xl"
        >
          <DrawerHeader className="space-y-2 pb-2 px-4 md:px-6 pt-3">
            <div className="mx-auto w-full max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/55 px-2.5 py-1 text-muted-foreground shadow-xs">
                <BadgePlus className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                <span className="text-[11px] font-semibold tracking-wide">
                  {mode === 'edit' ? 'EDIT ASSISTANT' : 'NEW ASSISTANT'}
                </span>
              </div>
              <DrawerTitle className="mt-3 text-[22px] font-semibold tracking-tight text-foreground">
                {mode === 'edit' ? 'Edit Assistant' : 'Create Assistant'}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {mode === 'edit'
                  ? 'Update profile, model, behavior prompt, and ordering.'
                  : 'Configure profile, model, and behavior prompt.'}
              </DrawerDescription>
            </div>
          </DrawerHeader>

          <div className="px-3 md:px-4 pb-3 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xs md:p-4">
              <div className="grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2.5 md:col-span-2">
                    <Label htmlFor="assistant-name" className="text-xs font-semibold tracking-wide text-muted-foreground">
                      Name <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <Input
                      id="assistant-name"
                      placeholder="e.g., Code Helper"
                      className={inputFieldClass}
                      value={assistantName}
                      onChange={e => setAssistantName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="assistant-model" className="text-xs font-semibold tracking-wide text-muted-foreground">
                      Model <span className="text-red-500 ml-0.5">*</span>
                    </Label>

                    <DrawerFieldModelSelector
                      selectedModel={selectedModel}
                      modelOptions={modelOptions}
                      isOpen={modelOpen}
                      onOpenChange={setModelOpen}
                      onModelSelect={(ref) => {
                        setSelectedModelRef(ref)
                        setModelOpen(false)
                      }}
                      portalContainer={drawerContentRef.current}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="assistant-sort-index" className="text-xs font-semibold tracking-wide text-muted-foreground">
                        Sort Index
                      </Label>
                      <p className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                        Smaller value appears earlier
                      </p>
                    </div>
                    <Input
                      id="assistant-sort-index"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={inputFieldClass}
                      value={String(sortIndex)}
                      onChange={e => {
                        const nextValue = Number.parseInt(e.target.value, 10)
                        setSortIndex(Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0)
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="assistant-description" className="text-xs font-semibold tracking-wide text-muted-foreground">
                    Description
                  </Label>
                  <Input
                    id="assistant-description"
                    placeholder="e.g., Helps with debugging and refactoring"
                    className={inputFieldClass}
                    value={assistantDescription}
                    onChange={e => setAssistantDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="assistant-prompt" className="text-xs font-semibold tracking-wide text-muted-foreground">
                      System Prompt <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                  </div>
                  <Textarea
                    id="assistant-prompt"
                    placeholder="You are a helpful assistant that..."
                    className={textareaFieldClass}
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

          <DrawerFooter className="flex-row justify-end gap-2 border-t border-border bg-muted/30 px-4 py-4 md:px-6">
            <DrawerClose asChild>
              <Button
                variant="secondary"
                className="h-10 rounded-xl px-4 shadow-xs transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98]"
              >
                Cancel
              </Button>
            </DrawerClose>
            <Button
              className="h-10 rounded-xl bg-primary px-4 text-primary-foreground shadow-xs transition-[background-color,box-shadow,transform] duration-200 hover:bg-primary/90 active:scale-[0.98]"
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
