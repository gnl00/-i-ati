import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_DIR,
  DEFAULT_WORKSPACE_NAME,
  getDefaultWorkspacePath
} from '../workspacePaths'

describe('workspacePaths', () => {
  it('builds the default workspace path for a chat uuid', () => {
    expect(getDefaultWorkspacePath('chat-123')).toBe(`./${DEFAULT_WORKSPACE_DIR}/chat-123`)
  })

  it('falls back to the default workspace name when chat uuid is missing', () => {
    expect(getDefaultWorkspacePath()).toBe(`./${DEFAULT_WORKSPACE_DIR}/${DEFAULT_WORKSPACE_NAME}`)
  })
})
