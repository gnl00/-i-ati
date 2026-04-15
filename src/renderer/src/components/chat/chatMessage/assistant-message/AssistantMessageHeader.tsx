import React, { memo } from 'react'
import { ModelBadgeNext } from './model-badge/ModelBadgeNext'
import type { AssistantMessageRenderState } from './model/assistantMessageMapper'

export interface AssistantMessageHeaderModel {
  header: AssistantMessageRenderState['header']
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
    <ModelBadgeNext
      model={header.badgeModel}
      provider={header.modelProvider}
      animate={badgeAnimate}
      emotionLabel={header.emotionLabel}
      emotionEmoji={header.emotionEmoji}
      emotionIntensity={header.emotionIntensity}
    />
  )
})
