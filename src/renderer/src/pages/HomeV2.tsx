import ChatWindowsComponent from "@renderer/components/chat/ChatWindowComponent"
import ChatWindowComponentNext from "@renderer/components/chat/ChatWindowComponentNext"
import ChatSheetComponent from "@renderer/components/chat/ChatSheetComponent"
import ChatSheetHoverComponent from "@renderer/components/chat/ChatSheetHoverComponent"
import { Toaster } from "@renderer/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { useEffect, useState } from "react"
import { rendererStartupTracer } from "@renderer/utils/startupTracer"

export default () => {
    const [chatWindowMode, setChatWindowMode] = useState<string>(() => {
        const mode = (globalThis as any).__CHAT_WINDOW_MODE
        return typeof mode === 'string' ? mode : 'top'
    })
    const isTopWindowMode = chatWindowMode === 'top'

    useEffect(() => {
        rendererStartupTracer.mark('route.home.mounted')
    }, [])

    useEffect(() => {
        const globalObj = globalThis as any
        let modeValue = typeof globalObj.__CHAT_WINDOW_MODE === 'string'
            ? globalObj.__CHAT_WINDOW_MODE
            : 'top'

        setChatWindowMode(modeValue)

        Object.defineProperty(globalObj, '__CHAT_WINDOW_MODE', {
            configurable: true,
            enumerable: true,
            get() {
                return modeValue
            },
            set(next: unknown) {
                modeValue = typeof next === 'string' ? next : 'top'
                setChatWindowMode(modeValue)
            }
        })

        return () => {
            globalObj.__CHAT_WINDOW_MODE = modeValue
        }
    }, [])

    return (
        <div className="div-app app-dragable flex flex-col">
            <Toaster />
            <SonnerToaster
                richColors
                duration={3000}
            />
            {isTopWindowMode ? <ChatWindowComponentNext /> : <ChatWindowsComponent />}
            <ChatSheetHoverComponent />
            <ChatSheetComponent />
        </div>
    )
}
