import React, { memo } from 'react'
import { ModelBadge } from './model-badge/ModelBadge'
import type { AssistantMessageHeaderProjection } from './model/assistantMessageMapper'

export interface AssistantMessageHeaderModel {
  header: AssistantMessageHeaderProjection
  badgeAnimate: boolean
}

export interface AssistantMessageHeaderProps {
  model: AssistantMessageHeaderModel
}

export const AssistantMessageHeader: React.FC<AssistantMessageHeaderProps> = memo(({
  model
}) => {
  const { header, badgeAnimate } = model

  if (!header.badgeModel) {
    return null
  }

  return (
    <ModelBadge
      model={header.badgeModel}
      provider={header.modelProvider}
      animate={badgeAnimate}
      emotionLabel={header.emotionLabel}
      emotionEmoji={header.emotionEmoji}
      emotionIntensity={header.emotionIntensity}
    />
  )
})
