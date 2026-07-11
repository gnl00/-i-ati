import { create } from 'zustand'
import type { DevServerStatus } from '@tools/devServer/index.d'

type DevServerState = {
  // DevServer state (keyed by chatUuid)
  devServerStatus: Record<string, DevServerStatus>
  devServerPort: Record<string, number | null>
  devServerLogs: Record<string, string[]>
  devServerError: Record<string, string | null>
}

type DevServerAction = {
  // DevServer actions
  setDevServerStatus: (chatUuid: string, status: DevServerStatus) => void
  setDevServerPort: (chatUuid: string, port: number | null) => void
  setDevServerLogs: (chatUuid: string, logs: string[]) => void
  setDevServerError: (chatUuid: string, error: string | null) => void
  clearDevServerState: (chatUuid: string) => void
}

export const useDevServerStore = create<DevServerState & DevServerAction>((set) => ({
  // DevServer state
  devServerStatus: {},
  devServerPort: {},
  devServerLogs: {},
  devServerError: {},

  // DevServer actions
  setDevServerStatus: (chatUuid: string, status: DevServerStatus) =>
    set((state) => ({
      devServerStatus: { ...state.devServerStatus, [chatUuid]: status }
    })),
  setDevServerPort: (chatUuid: string, port: number | null) =>
    set((state) => ({
      devServerPort: { ...state.devServerPort, [chatUuid]: port }
    })),
  setDevServerLogs: (chatUuid: string, logs: string[]) =>
    set((state) => ({
      devServerLogs: { ...state.devServerLogs, [chatUuid]: logs }
    })),
  setDevServerError: (chatUuid: string, error: string | null) =>
    set((state) => ({
      devServerError: { ...state.devServerError, [chatUuid]: error }
    })),
  clearDevServerState: (chatUuid: string) =>
    set((state) => {
      const newStatus = { ...state.devServerStatus }
      const newPort = { ...state.devServerPort }
      const newLogs = { ...state.devServerLogs }
      const newError = { ...state.devServerError }
      delete newStatus[chatUuid]
      delete newPort[chatUuid]
      delete newLogs[chatUuid]
      delete newError[chatUuid]
      return {
        devServerStatus: newStatus,
        devServerPort: newPort,
        devServerLogs: newLogs,
        devServerError: newError
      }
    })
}))
