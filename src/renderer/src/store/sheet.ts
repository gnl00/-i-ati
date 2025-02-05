import { create } from 'zustand'

type SheetStoreType = {
    sheetOpenState: boolean
    setSheetOpenState: (state: boolean) => void
}

export const useSheetStore = create<SheetStoreType>((set) => ({
    sheetOpenState: false,
    setSheetOpenState: (state: boolean) => set({ sheetOpenState: state })
}))