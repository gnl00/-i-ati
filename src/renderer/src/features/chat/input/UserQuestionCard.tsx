import React, { useEffect, useMemo, useState } from 'react'
import { Clock3, MessageCircleQuestion, Sparkles } from 'lucide-react'
import { Button } from '@renderer/shared/components/ui/button'
import { Checkbox } from '@renderer/shared/components/ui/checkbox'
import { Textarea } from '@renderer/shared/components/ui/textarea'
import { cn } from '@renderer/shared/lib/utils'
import type {
  PendingToolQuestion,
  ToolUserQuestion,
  ToolUserQuestionAnswer
} from '@shared/tools/userQuestion'

type AnswerDraft = Record<string, {
  optionIds: string[]
  text: string
}>

interface UserQuestionCardProps {
  request: PendingToolQuestion
  pendingCount?: number
  disabled?: boolean
  onSubmit: (answers: ToolUserQuestionAnswer[]) => void | Promise<void>
  onCancel: () => void | Promise<void>
  className?: string
}

function createEmptyDraft(questions: ToolUserQuestion[]): AnswerDraft {
  return Object.fromEntries(questions.map(question => [question.id, {
    optionIds: [],
    text: ''
  }]))
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${seconds}s`
}

export function validateUserQuestionDraft(
  questions: ToolUserQuestion[],
  draft: AnswerDraft
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const question of questions) {
    const answer = draft[question.id] ?? { optionIds: [], text: '' }
    if (question.type === 'text') {
      const text = answer.text.trim()
      if (question.required && !text) {
        errors[question.id] = 'Enter a response'
      } else if (question.maxLength && text.length > question.maxLength) {
        errors[question.id] = `Keep the response within ${question.maxLength} characters`
      }
      continue
    }

    const minSelections = question.required ? (question.minSelections ?? 1) : (question.minSelections ?? 0)
    if (answer.optionIds.length < minSelections) {
      errors[question.id] = minSelections === 1
        ? 'Choose an option'
        : `Choose at least ${minSelections} options`
      continue
    }
    if (question.maxSelections && answer.optionIds.length > question.maxSelections) {
      errors[question.id] = `Choose up to ${question.maxSelections} options`
    }
  }

  return errors
}

function toAnswers(questions: ToolUserQuestion[], draft: AnswerDraft): ToolUserQuestionAnswer[] {
  return questions.map(question => {
    const answer = draft[question.id] ?? { optionIds: [], text: '' }
    if (question.type === 'text') {
      return {
        questionId: question.id,
        text: answer.text.trim()
      }
    }
    return {
      questionId: question.id,
      optionIds: answer.optionIds
    }
  })
}

export const UserQuestionCard: React.FC<UserQuestionCardProps> = ({
  request,
  pendingCount = 1,
  disabled = false,
  onSubmit,
  onCancel,
  className
}) => {
  const [draft, setDraft] = useState<AnswerDraft>(() => createEmptyDraft(request.questions))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, request.expiresAt - Date.now()))

  useEffect(() => {
    setDraft(createEmptyDraft(request.questions))
    setErrors({})
    setRemainingMs(Math.max(0, request.expiresAt - Date.now()))
  }, [request.interactionId, request.questions, request.expiresAt])

  useEffect(() => {
    const update = (): void => setRemainingMs(Math.max(0, request.expiresAt - Date.now()))
    update()
    const timer = window.setInterval(update, 1000)
    return (): void => window.clearInterval(timer)
  }, [request.expiresAt])

  const hasRecommendation = useMemo(() => request.questions.every(question => {
    if (!question.required) return true
    if (question.type === 'text') return Boolean(question.recommendedText?.trim())
    const recommendedCount = question.options?.filter(option => option.recommended).length ?? 0
    return recommendedCount >= (question.minSelections ?? 1)
  }), [request.questions])
  const isAutoSubmitting = remainingMs <= 0
  const interactionDisabled = disabled || isAutoSubmitting

  const updateOption = (question: ToolUserQuestion, optionId: string, checked: boolean): void => {
    setDraft(current => {
      const answer = current[question.id] ?? { optionIds: [], text: '' }
      if (question.type === 'single_select') {
        return {
          ...current,
          [question.id]: { ...answer, optionIds: checked ? [optionId] : [] }
        }
      }

      const optionIds = checked
        ? [...new Set([...answer.optionIds, optionId])]
        : answer.optionIds.filter(id => id !== optionId)
      return {
        ...current,
        [question.id]: { ...answer, optionIds }
      }
    })
    setErrors(current => {
      const nextErrors = { ...current }
      delete nextErrors[question.id]
      return nextErrors
    })
  }

  const updateText = (questionId: string, text: string): void => {
    setDraft(current => ({
      ...current,
      [questionId]: {
        ...(current[questionId] ?? { optionIds: [] }),
        text
      }
    }))
    setErrors(current => {
      const nextErrors = { ...current }
      delete nextErrors[questionId]
      return nextErrors
    })
  }

  const handleSubmit = async (): Promise<void> => {
    const nextErrors = validateUserQuestionDraft(request.questions, draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    await onSubmit(toAnswers(request.questions, draft))
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <section
      data-testid="user-question-card"
      aria-busy={interactionDisabled || undefined}
      aria-label="Agent question"
      className={cn(
        'flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border',
        'border-white/70 bg-slate-950/[0.035] shadow-[0_14px_32px_-26px_rgba(15,23,42,0.34)] backdrop-blur-3xl',
        'dark:border-white/8 dark:bg-white/[0.045] dark:shadow-[0_16px_36px_-26px_rgba(0,0,0,0.58)]',
        interactionDisabled && 'pointer-events-none',
        className
      )}
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-100/80 bg-sky-50/90 text-sky-600 shadow-xs shadow-sky-500/10 dark:border-sky-900/70 dark:bg-sky-950/65 dark:text-sky-300">
            <MessageCircleQuestion className="h-4 w-4" strokeWidth={1.8} />
          </div>

          <div className="min-w-0 pt-0.5">
            <h2 className="text-[13px] font-semibold leading-4 text-slate-900 dark:text-slate-100">
              Your input is needed
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] leading-none text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock3 className="h-3 w-3" strokeWidth={1.8} />
                {isAutoSubmitting
                  ? 'Applying recommendation'
                  : hasRecommendation
                    ? `Recommended choice in ${formatRemainingTime(remainingMs)}`
                    : `Waiting ${formatRemainingTime(remainingMs)}`}
              </span>
              {pendingCount > 1 && <span>+{pendingCount - 1} more pending</span>}
            </div>
          </div>

          <div className="flex items-center gap-0.5 rounded-xl border border-white/90 bg-white/85 p-0.5 shadow-xs shadow-slate-900/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={interactionDisabled}
              onClick={onCancel}
              className="h-7 rounded-lg px-2.5 text-[10px] font-medium text-slate-500 shadow-none transition-colors hover:bg-slate-100/80 hover:text-slate-800 active:scale-[0.97] dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-slate-100"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={interactionDisabled}
              onClick={() => void handleSubmit()}
              className="h-7 rounded-lg bg-slate-900 px-2.5 text-[10px] font-semibold text-white shadow-xs shadow-slate-900/10 transition-[background-color,scale] hover:bg-slate-800 active:scale-[0.97] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Submit
            </Button>
          </div>
        </header>

        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          {request.questions.map((question, questionIndex) => {
            const answer = draft[question.id] ?? { optionIds: [], text: '' }
            const error = errors[question.id]
            return (
              <fieldset key={question.id} className="min-w-0" aria-describedby={error ? `${question.id}-error` : undefined}>
                <legend className="mb-1.5 flex min-w-0 items-start gap-1.5 text-[11px] font-semibold leading-4 text-slate-800 dark:text-slate-200">
                  <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">{questionIndex + 1}.</span>
                  <span className="wrap-break-word">{question.prompt}</span>
                  {question.required && (
                    <span className="text-sky-600 dark:text-sky-400" aria-label="Required">*</span>
                  )}
                </legend>
                {question.header && (
                  <p className="mb-1.5 pl-4 text-[10px] leading-[1.45] text-slate-500 dark:text-slate-400">
                    {question.header}
                  </p>
                )}

                {question.type === 'text' ? (
                  <Textarea
                    value={answer.text}
                    maxLength={question.maxLength}
                    placeholder={question.placeholder}
                    disabled={interactionDisabled}
                    onChange={event => updateText(question.id, event.target.value)}
                    className={cn(
                      'min-h-20 resize-none rounded-xl border-slate-200/80 bg-white/70 px-3 py-2.5 text-[11px] leading-[1.5] text-slate-800 shadow-none transition-colors duration-150',
                      'placeholder:text-slate-400 hover:border-slate-300/80 focus-visible:border-slate-200/80 focus-visible:bg-white',
                      'dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-200 dark:placeholder:text-slate-500 dark:hover:border-white/15 dark:focus-visible:border-white/10 dark:focus-visible:bg-slate-950/95',
                      error && 'border-rose-400/80 focus-visible:border-rose-400 dark:border-rose-700 dark:focus-visible:border-rose-600'
                    )}
                  />
                ) : (
                  <div
                    data-testid={`user-question-options-${question.id}`}
                    className={cn(
                      'overflow-hidden rounded-xl border border-slate-200/75 bg-white/75 shadow-xs shadow-slate-900/[0.025]',
                      'dark:border-white/10 dark:bg-slate-950/70'
                    )}
                  >
                    {question.options?.map(option => {
                      const checked = answer.optionIds.includes(option.id)
                      const atLimit = question.type === 'multi_select'
                        && Boolean(question.maxSelections)
                        && answer.optionIds.length >= (question.maxSelections ?? Number.POSITIVE_INFINITY)
                      return (
                        <label
                          key={option.id}
                          data-selected={checked || undefined}
                          className={cn(
                            'group flex min-h-12 cursor-pointer items-center gap-2.5 border-b border-slate-200/65 px-3 py-2 last:border-b-0',
                            'text-slate-700 transition-[background-color,box-shadow] duration-150 hover:bg-slate-50/90',
                            'has-[:focus-visible]:relative has-[:focus-visible]:z-10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-slate-400/35',
                            'dark:border-white/8 dark:text-slate-300 dark:hover:bg-white/[0.035] dark:has-[:focus-visible]:ring-slate-500/45',
                            checked && 'bg-slate-100/80 hover:bg-slate-100/90 dark:bg-white/[0.06] dark:hover:bg-white/[0.075]',
                            (interactionDisabled || (atLimit && !checked)) && 'cursor-default opacity-55'
                          )}
                        >
                          {question.type === 'single_select' ? (
                            <input
                              type="radio"
                              name={`${request.interactionId}-${question.id}`}
                              checked={checked}
                              disabled={interactionDisabled}
                              onChange={event => updateOption(question, option.id, event.target.checked)}
                              aria-label={option.label}
                              className={cn(
                                'h-4 w-4 shrink-0 appearance-none rounded-full border border-slate-400 bg-white',
                                'transition-[border-color,box-shadow] checked:border-[4px] checked:border-slate-700',
                                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400/35 focus-visible:ring-offset-1',
                                'disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:checked:border-slate-200'
                              )}
                            />
                          ) : (
                            <Checkbox
                              checked={checked}
                              disabled={interactionDisabled || (atLimit && !checked)}
                              onCheckedChange={value => updateOption(question, option.id, value === true)}
                              className="h-4 w-4 rounded-[5px] border-slate-400 data-[state=checked]:border-slate-700 data-[state=checked]:bg-slate-700 data-[state=checked]:text-white focus-visible:ring-slate-400/35 dark:data-[state=checked]:border-slate-200 dark:data-[state=checked]:bg-slate-200 dark:data-[state=checked]:text-slate-900"
                              aria-label={option.label}
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold leading-4">
                              {option.label}
                              {option.recommended && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-sky-100/80 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-700 dark:bg-sky-900/60 dark:text-sky-200">
                                  <Sparkles className="h-2.5 w-2.5" strokeWidth={1.8} />
                                  Recommended
                                </span>
                              )}
                            </span>
                            {option.description && (
                              <span className="mt-0.5 block text-[10px] leading-[1.4] text-slate-500 dark:text-slate-400">
                                {option.description}
                              </span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {error && (
                  <p id={`${question.id}-error`} role="alert" className="mt-1.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                    {error}
                  </p>
                )}
              </fieldset>
            )
          })}
        </div>
      </div>
    </section>
  )
}
