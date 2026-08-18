import { describe, expect, it } from 'vitest'

import {
  emotionPackSelectContentClassName,
  emotionPackSelectItemClassName,
  emotionPackSelectTriggerClassName,
  modelRouteControlClassName,
  modelRouteEmptyStateClassName
} from '../ToolsManager'

describe('ToolsManager model routing styles', () => {
  it('keeps the model route control group transparent around raised controls', () => {
    expect(modelRouteControlClassName).toContain('gap-1.5')
    expect(modelRouteControlClassName).toContain('border-0')
    expect(modelRouteControlClassName).toContain('bg-transparent')
    expect(modelRouteControlClassName).toContain('p-0')
    expect(modelRouteControlClassName).toContain('dark:bg-transparent')
  })

  it('uses semantic settings surfaces for the empty vision route', () => {
    expect(modelRouteEmptyStateClassName).toContain('dark:border-(--app-border-standard)')
    expect(modelRouteEmptyStateClassName).toContain('dark:bg-(--app-surface-raised)')
    expect(modelRouteEmptyStateClassName).toContain('dark:text-(--app-text-muted)')
  })
})

describe('ToolsManager emotion pack selector styles', () => {
  it('uses the raised graphite surface for the trigger and popup', () => {
    expect(emotionPackSelectTriggerClassName).toContain('dark:bg-(--app-surface-raised)')
    expect(emotionPackSelectTriggerClassName).toContain('dark:data-[state=open]:bg-(--app-surface-hover)')
    expect(emotionPackSelectContentClassName).toContain('dark:bg-(--app-surface-raised)')
    expect(emotionPackSelectContentClassName).toContain('dark:border-(--app-border-standard)')
    expect(emotionPackSelectContentClassName).toContain('dark:backdrop-blur-none')
  })

  it('keeps focused and checked packs on the quiet hover surface', () => {
    expect(emotionPackSelectItemClassName).toContain('dark:focus:bg-(--app-surface-hover)')
    expect(emotionPackSelectItemClassName).toContain('dark:data-[state=checked]:bg-(--app-surface-hover)')
    expect(emotionPackSelectItemClassName).toContain('dark:[&_.lucide-check]:text-(--app-accent-strong)')
  })
})
