import { create } from 'zustand'

export type ChatEntranceRequest = {
    chatUuid: string
    selectionEpoch: number
}

type SheetStoreType = {
    sheetOpenState: boolean
    collapsedChatGroups: Set<string>
    toggleChatGroup: (key: string) => void
    chatLoading: boolean
    chatEntranceRequest: ChatEntranceRequest | null
    setSheetOpenState: (state: boolean) => void
    setChatLoading: (loading: boolean) => void
    setChatEntranceRequest: (request: ChatEntranceRequest | null) => void
}

export const useSheetStore = create<SheetStoreType>((set) => ({
    sheetOpenState: false,
    collapsedChatGroups: new Set(),
    toggleChatGroup: (key: string): void => set(state => {
        const collapsedChatGroups = new Set(state.collapsedChatGroups)
        if (collapsedChatGroups.has(key)) collapsedChatGroups.delete(key)
        else collapsedChatGroups.add(key)
        return { collapsedChatGroups }
    }),
    chatLoading: false,
    setSheetOpenState: (state: boolean): void => set({ sheetOpenState: state }),
    setChatLoading: (loading: boolean): void => set({ chatLoading: loading }),
    chatEntranceRequest: null,
    setChatEntranceRequest: (request: ChatEntranceRequest | null): void => set({ chatEntranceRequest: request })
}))
