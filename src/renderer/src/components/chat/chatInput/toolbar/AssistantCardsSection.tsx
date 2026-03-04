import { AddAssistantDrawer } from '@renderer/components/chat/AddAssistantDrawer'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'
import React, { useEffect, useMemo, useState } from 'react'

interface AssistantCardsSectionProps {
  panelOpen: boolean
}

const AssistantCardsSection: React.FC<AssistantCardsSectionProps> = ({ panelOpen }) => {
  const { accounts, providerDefinitions } = useAppConfigStore()
  const { assistants, currentAssistant, setCurrentAssistant, loadAssistants } = useAssistantStore()
  const [assistantPage, setAssistantPage] = useState(0)

  useEffect(() => {
    if (panelOpen) {
      void loadAssistants()
    }
  }, [panelOpen, loadAssistants])

  const modelGroups = useMemo(() => {
    const groups = new Map<string, { account: ProviderAccount; definition?: ProviderDefinition; models: AccountModel[] }>()
    accounts.forEach(account => {
      const definition = providerDefinitions.find(def => def.id === account.providerId)
      const enabledModels = account.models.filter(model => model.enabled !== false)
      if (enabledModels.length === 0) {
        return
      }
      groups.set(account.id, { account, definition, models: enabledModels })
    })
    return Array.from(groups.values())
  }, [accounts, providerDefinitions])

  const assistantsPerPage = 4
  const assistantTotalPages = Math.ceil(assistants.length / assistantsPerPage)

  useEffect(() => {
    if (assistantTotalPages === 0) {
      setAssistantPage(0)
      return
    }
    setAssistantPage(prev => Math.min(prev, assistantTotalPages - 1))
  }, [assistantTotalPages])

  const currentAssistants = useMemo(() => {
    const start = assistantPage * assistantsPerPage
    return assistants.slice(start, start + assistantsPerPage)
  }, [assistantPage, assistants])

  const goPrevAssistants = () => {
    setAssistantPage(prev => Math.max(prev - 1, 0))
  }

  const goNextAssistants = () => {
    setAssistantPage(prev => Math.min(prev + 1, Math.max(assistantTotalPages - 1, 0)))
  }

  return (
    <div className="space-y-3 shrink-0">
      <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800/60">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Assistant
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {currentAssistants.map(assistant => {
          const isActive = currentAssistant?.id === assistant.id
          return (
            <button
              key={assistant.id}
              onClick={() => setCurrentAssistant(isActive ? null : assistant)}
              className={cn(
                "relative rounded-lg border px-2 py-2 text-left transition-all duration-200 overflow-hidden",
                "bg-white/70 dark:bg-slate-900/40",
                "hover:border-emerald-300/80 dark:hover:border-emerald-600/60",
                "hover:bg-linear-to-br hover:from-emerald-50/90 hover:via-teal-50/80 hover:to-cyan-50/70",
                "dark:hover:from-emerald-900/20 dark:hover:via-teal-900/15 dark:hover:to-cyan-900/15",
                "hover:shadow-[0_10px_24px_-16px_rgba(16,185,129,0.55)] hover:-translate-y-0.5",
                "active:scale-[0.98] active:translate-y-0",
                isActive
                  ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-900/20 shadow-xs"
                  : "border-slate-200/70 dark:border-slate-800/80"
              )}
            >
              <div className="text-base leading-none">{assistant.icon || '◦'}</div>
              <div className="mt-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 line-clamp-1">
                {assistant.name}
              </div>
            </button>
          )
        })}

        {currentAssistants.length < assistantsPerPage &&
          Array.from({ length: assistantsPerPage - currentAssistants.length }).map((_, index) => (
            <div
              key={`assistant-placeholder-${index}`}
              className="rounded-lg border border-dashed border-slate-200/70 dark:border-slate-800/80 bg-transparent min-h-[68px]"
            />
          ))}
      </div>

      <div className="flex items-center justify-between">
        <AddAssistantDrawer isExpanded={true} variant="compact" modelGroups={modelGroups} />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30"
            onClick={goPrevAssistants}
            disabled={assistantPage === 0}
          >
            {'<'}
          </Button>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums min-w-[40px] text-center">
            {assistantTotalPages === 0 ? '0/0' : `${assistantPage + 1}/${assistantTotalPages}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30"
            onClick={goNextAssistants}
            disabled={assistantPage >= assistantTotalPages - 1}
          >
            {'>'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AssistantCardsSection
