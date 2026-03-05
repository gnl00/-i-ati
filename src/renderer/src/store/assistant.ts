import { create } from 'zustand'
import {
  getAllAssistants,
  saveAssistant,
  updateAssistant,
  deleteAssistant
} from '@renderer/db/AssistantRepository'

const sortAssistants = (assistants: Assistant[]): Assistant[] =>
  [...assistants].sort((a, b) => {
    const pinnedDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned))
    if (pinnedDiff !== 0) return pinnedDiff
    const indexDiff = (a.sortIndex ?? 0) - (b.sortIndex ?? 0)
    if (indexDiff !== 0) return indexDiff
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  })

interface AssistantStore {
  // 状态
  assistants: Assistant[]
  currentAssistant: Assistant | null
  isLoading: boolean

  // 操作方法
  loadAssistants: () => Promise<void>
  setCurrentAssistant: (assistant: Assistant | null) => void
  addAssistant: (assistant: Assistant) => Promise<string>
  updateAssistantById: (assistant: Assistant) => Promise<void>
  deleteAssistantById: (id: string) => Promise<void>
}

export const useAssistantStore = create<AssistantStore>((set, get) => ({
  // 初始状态
  assistants: [],
  currentAssistant: null,
  isLoading: false,

  // 加载所有 Assistants
  loadAssistants: async () => {
    set({ isLoading: true })
    try {
      const assistants = await getAllAssistants()
      set({ assistants: sortAssistants(assistants), isLoading: false })
    } catch (error) {
      console.error('[AssistantStore] Failed to load assistants:', error)
      set({ isLoading: false })
    }
  },

  // 设置当前 Assistant
  setCurrentAssistant: (assistant: Assistant | null) => {
    set({ currentAssistant: assistant })
  },

  // 添加新 Assistant
  addAssistant: async (assistant: Assistant) => {
    try {
      const id = await saveAssistant(assistant)
      const newAssistant = { ...assistant, id }
      set({ assistants: sortAssistants([...get().assistants, newAssistant]) })
      return id
    } catch (error) {
      console.error('[AssistantStore] Failed to add assistant:', error)
      throw error
    }
  },

  // 更新 Assistant
  updateAssistantById: async (assistant: Assistant) => {
    try {
      await updateAssistant(assistant)
      set({
        assistants: sortAssistants(get().assistants.map(a =>
          a.id === assistant.id ? assistant : a
        )),
        currentAssistant: get().currentAssistant?.id === assistant.id ? assistant : get().currentAssistant
      })
    } catch (error) {
      console.error('[AssistantStore] Failed to update assistant:', error)
      throw error
    }
  },

  // 删除 Assistant
  deleteAssistantById: async (id: string) => {
    try {
      await deleteAssistant(id)
      set({
        assistants: get().assistants.filter(a => a.id !== id),
        currentAssistant: get().currentAssistant?.id === id ? null : get().currentAssistant
      })
    } catch (error) {
      console.error('[AssistantStore] Failed to delete assistant:', error)
      throw error
    }
  }
}))
