export function buildEmotionStateSummary(state: EmotionStateSnapshot | undefined): string {
  if (!state) {
    return [
      '- No persisted emotion state exists yet.',
      '- Treat this as a fresh emotional baseline unless the current turn strongly suggests otherwise.'
    ].join('\n')
  }

  const lines: string[] = []

  lines.push(`- Background: ${state.background.label} (${formatIntensity(state.background.intensity)})`)
  lines.push(`- Current carry-over: ${state.current.label} (${formatIntensity(state.current.intensity)})`)

  const recentHistory = state.history.slice(-3).reverse()
  if (recentHistory.length > 0) {
    lines.push('- Recent history (newest -> oldest):')
    for (const entry of recentHistory) {
      lines.push(`  - ${entry.label} (${formatIntensity(entry.intensity)}) via ${entry.source}`)
    }
  }

  const accumulatedEntries = [...state.accumulated]
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 3)

  if (accumulatedEntries.length > 0) {
    lines.push('- Accumulated emotional residue (newest -> oldest):')
    for (const entry of accumulatedEntries) {
      lines.push(`  - ${entry.label} (${formatIntensity(entry.intensity)}): ${entry.description} | decay=${entry.decay}`)
    }
  }

  return lines.join('\n')
}

function formatIntensity(intensity: number): string {
  return Number.isInteger(intensity) ? String(intensity) : intensity.toFixed(1)
}
