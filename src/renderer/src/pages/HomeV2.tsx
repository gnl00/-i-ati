import ChatWindowsComponent from "@renderer/components/chat/ChatWindowComponentV2"
import ChatSheetComponent from "@renderer/components/chat/ChatSheetComponent"
import ChatSheetHoverComponent from "@renderer/components/chat/ChatSheetHoverComponent"
import { Toaster } from "@renderer/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { useEffect } from "react"
import { rendererStartupTracer } from "@renderer/utils/startupTracer"

export default () => {
    useEffect(() => {
        rendererStartupTracer.mark('route.home.mounted')
    }, [])

    return (
        <div className="div-app app-dragable flex flex-col">
            <Toaster />
            <SonnerToaster
                richColors
                duration={3000}
            />
            <ChatWindowsComponent />
            <ChatSheetHoverComponent />
            <ChatSheetComponent />
        </div>
    )
}
