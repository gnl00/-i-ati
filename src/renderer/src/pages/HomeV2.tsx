import ChatWindowsComponent from "@renderer/components/chat/ChatWindowComponentV2"
import ChatSheetComponent from "@renderer/components/sys/ChatSheetComponent"
import ChatSheetHoverComponent from "@renderer/components/sys/ChatSheetHoverComponent"
import { Toaster } from "@renderer/components/ui/toaster"
import { ChatProvider } from "@renderer/context/ChatContext"
import { Toaster as SonnerToaster } from "sonner"

export default () => {
    return (
        <div className="div-app app-dragable flex flex-col">
            <Toaster />
            <SonnerToaster
                richColors
                duration={3000}
            />
            <ChatProvider>
                <ChatWindowsComponent />
                <ChatSheetHoverComponent />
                <ChatSheetComponent />
            </ChatProvider>
        </div>
    )
}
