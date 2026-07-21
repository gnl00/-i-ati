import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FILE_LIST_ALLOWED_DIRS_ACTION } from '@shared/constants'

const { invokeMock, getCurrentChatUuidMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getCurrentChatUuidMock: vi.fn(() => 'chat-runtime')
}))

vi.mock('@renderer/infrastructure/tools/runtimeContext', () => ({
  getRendererToolRuntimeContext: (): { getCurrentChatUuid: () => string } => ({
    getCurrentChatUuid: getCurrentChatUuidMock
  })
}))

import { invokeListAllowedDirectories } from '../FileOperationsInvoker'

describe('FileOperationsInvoker', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue({ success: true, directories: ['/workspace'] })
    vi.stubGlobal('window', {
      electron: {
        ipcRenderer: { invoke: invokeMock }
      }
    })
  })

  it('routes list_allowed_directories through IPC with the active chat context', async () => {
    const result = await invokeListAllowedDirectories({})

    expect(invokeMock).toHaveBeenCalledWith(FILE_LIST_ALLOWED_DIRS_ACTION, {
      chat_uuid: 'chat-runtime'
    })
    expect(result).toEqual({ success: true, directories: ['/workspace'] })
  })
})
