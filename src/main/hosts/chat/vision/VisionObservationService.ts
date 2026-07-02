import { AppConfigStore, ChatModelContextResolver } from '../config'
import { ChatStepStore, normalizeMediaUrls } from '../persistence/ChatStepStore'
import { escapeXmlAttribute, escapeXmlText } from '@shared/utils/xml'
import type { HostRunInputState } from '../preparation'
import {
  VisionRequestService,
  type VisionRequestFn,
  type VisionRequestServiceDeps
} from './VisionRequestService'

export type VisionObservationRequestFn = VisionRequestFn

export type VisionObservationServiceDeps = {
  appConfigStore?: Pick<AppConfigStore, 'requireConfig'>
  modelContextResolver?: Pick<ChatModelContextResolver, 'resolve'>
  chatStepStore?: Pick<ChatStepStore, 'persistVisionObservationMessage'>
  createRequest?: VisionRequestServiceDeps['createRequest']
  request?: VisionObservationRequestFn
  timeoutMs?: number
}

export type VisionObservationInput = {
  chat: ChatEntity
  userMessage: MessageEntity
  textCtx: string
  mediaCtx: HostRunInputState['mediaCtx']
  source?: string
  host?: ChatMessageHostMeta
}

const VISION_OBSERVATION_SYSTEM_PROMPT = [
  'You create concise observations for images attached to a user request.',
  'Describe visible objects, text, UI state, layout, and any OCR-relevant details.',
  'Use factual language. Mention uncertainty only when the image is unclear.',
  'Return plain text with short sections for Summary, Details, and OCR when useful.'
].join('\n')

const buildVisionUserText = (input: VisionObservationInput, imageCount: number): string => [
  `User request: ${input.textCtx.trim() || '(empty)'}`,
  `Image count: ${imageCount}`,
  '',
  'Produce a model-readable observation for the MainAgent. Include details that help answer the user request.'
].join('\n')

const buildImageRef = (userMessage: MessageEntity): string => (
  userMessage.id == null ? 'message:unknown' : `message:${userMessage.id}`
)

const buildOkObservation = (args: {
  imageRef: string
  originSource?: string
  text: string
}): string => {
  const originSource = args.originSource
    ? ` origin_source="${escapeXmlAttribute(args.originSource)}"`
    : ''
  return [
    `<vision_observation image_ref="${escapeXmlAttribute(args.imageRef)}" status="ok"${originSource}>`,
    escapeXmlText(args.text.trim()),
    '</vision_observation>'
  ].join('\n')
}

const buildFailedObservation = (args: {
  imageRef: string
  originSource?: string
  reason: string
}): string => {
  const originSource = args.originSource
    ? ` origin_source="${escapeXmlAttribute(args.originSource)}"`
    : ''
  return [
    `<vision_observation image_ref="${escapeXmlAttribute(args.imageRef)}" status="failed"${originSource}>`,
    `Vision observation failed: ${escapeXmlText(args.reason)}`,
    '</vision_observation>'
  ].join('\n')
}

export class VisionObservationService {
  private readonly chatStepStore: Pick<ChatStepStore, 'persistVisionObservationMessage'>
  private readonly visionRequestService: VisionRequestService

  constructor(deps: VisionObservationServiceDeps = {}) {
    this.chatStepStore = deps.chatStepStore ?? new ChatStepStore()
    this.visionRequestService = new VisionRequestService(deps)
  }

  async observe(input: VisionObservationInput): Promise<MessageEntity> {
    const imageRef = buildImageRef(input.userMessage)

    try {
      const imageUrls = normalizeMediaUrls(input.mediaCtx)
      if (imageUrls.length === 0) {
        return this.persistFailed(input, imageRef, 'no image media found')
      }

      const result = await this.visionRequestService.analyze({
        imageUrls,
        prompt: buildVisionUserText(input, imageUrls.length),
        systemPrompt: VISION_OBSERVATION_SYSTEM_PROMPT,
        timeoutLabel: 'vision observation'
      })

      return this.chatStepStore.persistVisionObservationMessage(
        input.chat,
        buildOkObservation({
          imageRef,
          originSource: input.source,
          text: result.text
        }),
        input.host
      )
    } catch (error) {
      return this.persistFailed(input, imageRef, error instanceof Error ? error.message : String(error))
    }
  }

  private persistFailed(
    input: VisionObservationInput,
    imageRef: string,
    reason: string
  ): MessageEntity {
    return this.chatStepStore.persistVisionObservationMessage(
      input.chat,
      buildFailedObservation({
        imageRef,
        originSource: input.source,
        reason
      }),
      input.host
    )
  }
}
