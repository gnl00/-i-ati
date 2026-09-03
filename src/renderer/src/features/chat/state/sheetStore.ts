import { create } from 'zustand'

export type ChatEntranceRequest = {
    chatUuid: string
    selectionEpoch: number
}

type SheetStoreType = {
    sheetOpenState: boolean
    chatLoading: boolean
    chatEntranceRequest: ChatEntranceRequest | null
    setSheetOpenState: (state: boolean) => void
    setChatLoading: (loading: boolean) => void
    setChatEntranceRequest: (request: ChatEntranceRequest | null) => void
}

export const useSheetStore = create<SheetStoreType>((set) => ({
    sheetOpenState: false,
    chatLoading: false,
    setSheetOpenState: (state: boolean): void => set({ sheetOpenState: state }),
    setChatLoading: (loading: boolean): void => set({ chatLoading: loading }),
    chatEntranceRequest: null,
    setChatEntranceRequest: (request: ChatEntranceRequest | null): void => set({ chatEntranceRequest: request })
}))
