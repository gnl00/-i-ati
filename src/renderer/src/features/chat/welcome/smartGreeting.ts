export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export type SmartGreeting = {
  timeOfDay: TimeOfDay
  subtitleText: string
}

export const TIME_OF_DAY_LINES: Record<TimeOfDay, string[]> = {
  morning: [
    "Let's start with one sharp priority.",
    "What should move first this morning?",
    "Ready for a focused start?"
  ],
  afternoon: [
    "Let's keep the important work moving.",
    "What needs a clean next step?",
    "Want to push one task forward?"
  ],
  evening: [
    "Let's wrap up with a focused win.",
    "Need help finishing today's work?",
    "Want a clean handoff for tomorrow?"
  ],
  night: [
    "Late session. Let's keep it simple.",
    "Need a quick push before you sign off?",
    "Want to finish one more thing tonight?"
  ]
}

const TIME_OF_DAY_BOUNDARY_HOURS = [5, 12, 18, 22] as const

export const getTimeOfDay = (hour: number): TimeOfDay => {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 17) return 'afternoon'
  if (hour >= 18 && hour <= 21) return 'evening'
  return 'night'
}

export const pickSmartGreeting = (
  now: Date = new Date(),
  random: () => number = Math.random
): SmartGreeting => {
  const timeOfDay = getTimeOfDay(now.getHours())
  const lines = TIME_OF_DAY_LINES[timeOfDay]
  const randomIndex = Math.min(
    lines.length - 1,
    Math.max(0, Math.floor(random() * lines.length))
  )

  return {
    timeOfDay,
    subtitleText: lines[randomIndex] ?? lines[0]
  }
}

export const getNextTimeOfDayBoundary = (now: Date = new Date()): Date => {
  for (const hour of TIME_OF_DAY_BOUNDARY_HOURS) {
    const boundary = new Date(now)
    boundary.setHours(hour, 0, 0, 0)

    if (boundary.getTime() > now.getTime()) {
      return boundary
    }
  }

  const nextMorning = new Date(now)
  nextMorning.setDate(nextMorning.getDate() + 1)
  nextMorning.setHours(5, 0, 0, 0)
  return nextMorning
}

export const getMsUntilNextSmartGreetingRefresh = (now: Date = new Date()): number => {
  return Math.max(0, getNextTimeOfDayBoundary(now).getTime() - now.getTime())
}
