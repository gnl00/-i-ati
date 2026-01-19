import { create } from 'zustand'
import {
  getAllAssistants,
  saveAssistant,
  updateAssistant,
  deleteAssistant
} from '@renderer/db/AssistantRepository'

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
      set({ assistants, isLoading: false })
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
      set({ assistants: [...get().assistants, newAssistant] })
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
        assistants: get().assistants.map(a =>
          a.id === assistant.id ? assistant : a
        )
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
