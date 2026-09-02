export function buildEmotionStateSummary(state: EmotionStateSnapshot | undefined): string {
  if (!state) {
    return [
      '- Baseline VAD: valence=5, arousal=3, dominance=5.',
      '- Current emotion: neutral (5/10).',
      '- No emotion history exists yet.'
    ].join('\n')
  }

  const lines = [
    `- Baseline VAD: ${formatVector(state.baseline)}.`,
    `- Current emotion: ${state.current.label} (${formatIntensity(state.current.intensity)}/10).`,
    `- Current VAD: ${formatVector(state.current.vector)}.`
  ]

  const recentHistory = state.history.slice(-3).reverse()
  if (recentHistory.length > 0) {
    lines.push('- Recent stimulus history (newest -> oldest):')
    for (const entry of recentHistory) {
      lines.push(
        `  - ${entry.label} (${formatIntensity(entry.intensity)}/10), `
        + `VAD ${formatVector(entry.vector)}, `
        + `stimulus impact=${entry.stimulus.impact}, activation=${entry.stimulus.activation}, control=${entry.stimulus.control}, `
        + `via ${entry.source}`
      )
    }
  }

  return lines.join('\n')
}

function formatVector(vector: EmotionStateSnapshot['baseline']): string {
  return `valence=${formatNumber(vector.valence)}, arousal=${formatNumber(vector.arousal)}, dominance=${formatNumber(vector.dominance)}`
}

function formatIntensity(intensity: number): string {
  return formatNumber(intensity)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}
