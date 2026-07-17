import { useEffect, useState } from 'react'
import { getEmotionState } from '@renderer/infrastructure/persistence/EmotionStateRepository'
import {
  clampEmotionIntensity,
  normalizeEmotionLabel,
  type EmotionLabel
} from '@shared/emotion/emotionAssetCatalog'

export const WELCOME_EMOTION_FALLBACK: { label: EmotionLabel; intensity: number } = {
  label: 'happiness',
  intensity: 4
}

export function useWelcomeEmotionState(): { label: EmotionLabel; intensity: number } {
  const [emotion, setEmotion] = useState(WELCOME_EMOTION_FALLBACK)

  useEffect(() => {
    let isMounted = true

    const loadEmotionState = async (): Promise<void> => {
      try {
        const snapshot = await getEmotionState()
        const label = normalizeEmotionLabel(snapshot?.current?.label)

        if (!isMounted) return

        if (!label) {
          setEmotion(WELCOME_EMOTION_FALLBACK)
          return
        }

        setEmotion({
          label,
          intensity: clampEmotionIntensity(
            snapshot?.current?.intensity,
            WELCOME_EMOTION_FALLBACK.intensity
          )
        })
      } catch {
        if (isMounted) {
          setEmotion(WELCOME_EMOTION_FALLBACK)
        }
      }
    }

    void loadEmotionState()

    return () => {
      isMounted = false
    }
  }, [])

  return emotion
}
