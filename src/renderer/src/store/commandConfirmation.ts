import { create } from 'zustand'
import type { CommandConfirmationRequest } from '@renderer/components/chat/chatMessage/CommandConfirmation'

/**
 * 命令确认状态
 */
export interface CommandConfirmationState {
  // 当前待确认的命令请求
  pendingRequest: CommandConfirmationRequest | null
  // 确认结果的 Promise resolver
  resolver: ((confirmed: boolean) => void) | null
}

/**
 * 命令确认操作
 */
export interface CommandConfirmationActions {
  // 请求用户确认命令执行
  requestConfirmation: (request: CommandConfirmationRequest) => Promise<boolean>
  // 用户确认执行
  confirm: () => void
  // 用户取消执行
  cancel: () => void
  // 清除当前请求
  clear: () => void
}

/**
 * 命令确认 Store
 * 用于管理命令执行确认的状态和流程
 */
export const useCommandConfirmationStore = create<
  CommandConfirmationState & CommandConfirmationActions
>((set, get) => ({
  // 初始状态
  pendingRequest: null,
  resolver: null,

  // 请求用户确认命令执行
  requestConfirmation: (request: CommandConfirmationRequest) => {
    return new Promise<boolean>((resolve) => {
      set({
        pendingRequest: request,
        resolver: resolve
      })
    })
  },

  // 用户确认执行
  confirm: () => {
    const { resolver } = get()
    if (resolver) {
      resolver(true)
      set({ pendingRequest: null, resolver: null })
    }
  },

  // 用户取消执行
  cancel: () => {
    const { resolver } = get()
    if (resolver) {
      resolver(false)
      set({ pendingRequest: null, resolver: null })
    }
  },

  // 清除当前请求
  clear: () => {
    set({ pendingRequest: null, resolver: null })
  }
}))
