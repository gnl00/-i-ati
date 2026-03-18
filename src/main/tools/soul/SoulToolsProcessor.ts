import { soulService } from '@main/services/SoulService'

type GetSoulResponse = {
  success: boolean
  content: string
  source?: 'config' | 'default'
  message: string
}

type EditSoulArgs = {
  content?: string
  reason?: string
}

type EditSoulResponse = {
  success: boolean
  content?: string
  previousContent?: string
  reason?: string
  message: string
}

type ResetSoulArgs = {
  confirm?: boolean
}

export async function processGetSoul(): Promise<GetSoulResponse> {
  try {
    const current = soulService.getSoul()
    return {
      success: true,
      content: current.content,
      source: current.source,
      message: 'Soul loaded successfully.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      content: '',
      message: `Failed to load soul: ${message}`
    }
  }
}

export async function processEditSoul(args: EditSoulArgs): Promise<EditSoulResponse> {
  try {
    const nextContent = args.content?.trim()
    if (!nextContent) {
      return {
        success: false,
        message: 'content is required.'
      }
    }

    const previous = soulService.getSoul()
    const saved = soulService.saveSoul(nextContent)
    return {
      success: true,
      previousContent: previous.content,
      content: saved.content,
      reason: args.reason?.trim() || undefined,
      message: 'Soul updated successfully.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to update soul: ${message}`
    }
  }
}

export async function processResetSoul(args: ResetSoulArgs): Promise<EditSoulResponse> {
  if (!args.confirm) {
    return {
      success: false,
      message: 'confirm=true is required to reset soul.'
    }
  }

  try {
    const previous = soulService.getSoul()
    const reset = soulService.resetSoul()
    return {
      success: true,
      previousContent: previous.content,
      content: reset.content,
      message: 'Soul reset to default successfully.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to reset soul: ${message}`
    }
  }
}
