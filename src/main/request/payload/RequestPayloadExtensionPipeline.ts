import { getRequestPayloadExtensionById } from '@shared/plugins/requestPayloadExtensions'
import type { RequestPayloadPatchOperation } from '@shared/plugins/types'

type RequestPayloadExtensionPipelineInput = {
  request: IUnifiedRequest
  body: unknown
}

const isRecord = (value: unknown): value is Record<string, any> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const parsePatchPath = (path: string): string[] => {
  return path
    .split('.')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)
}

export class RequestPayloadExtensionPipeline {
  apply(input: RequestPayloadExtensionPipelineInput): void {
    if (!isRecord(input.body)) {
      return
    }

    const thinkingExtensionId = input.request.payloadExtensions?.thinking
    const thinkingExtension = getRequestPayloadExtensionById(thinkingExtensionId)
    if (!thinkingExtension || thinkingExtension.feature !== 'thinking') {
      return
    }

    const thinking = input.request.options?.thinking
    if (!thinking) {
      return
    }

    const patches = thinkingExtension.patches?.thinking
    if (!patches) {
      return
    }

    const mode = thinking.enabled === false ? 'disabled' : 'enabled'
    for (const patch of patches[mode]) {
      this.applyPatch(input.request, input.body, patch)
    }
  }

  private applyPatch(
    request: IUnifiedRequest,
    body: Record<string, any>,
    patch: RequestPayloadPatchOperation
  ): void {
    switch (patch.op) {
      case 'set':
        this.setPath(body, patch.path, patch.value)
        return
      case 'unset':
        this.unsetPath(body, patch.path)
        return
      case 'setFromThinkingEffort': {
        const effort = request.options?.thinking?.effort
        if (!effort) {
          return
        }
        if (patch.allowedValues && !patch.allowedValues.includes(effort)) {
          return
        }
        this.setPath(body, patch.path, effort)
      }
    }
  }

  private setPath(body: Record<string, any>, path: string, value: unknown): void {
    const segments = parsePatchPath(path)
    const lastSegment = segments.at(-1)
    if (!lastSegment) {
      return
    }

    let target = body
    for (const segment of segments.slice(0, -1)) {
      const existing = target[segment]
      if (isRecord(existing)) {
        target = existing
        continue
      }

      const next: Record<string, any> = {}
      target[segment] = next
      target = next
    }

    target[lastSegment] = value
  }

  private unsetPath(body: Record<string, any>, path: string): void {
    const segments = parsePatchPath(path)
    const lastSegment = segments.at(-1)
    if (!lastSegment) {
      return
    }

    let target = body
    for (const segment of segments.slice(0, -1)) {
      const existing = target[segment]
      if (!isRecord(existing)) {
        return
      }
      target = existing
    }

    delete target[lastSegment]
  }
}
