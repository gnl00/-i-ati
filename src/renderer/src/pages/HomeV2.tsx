import { Toaster } from "@renderer/components/ui/toaster"
// import { toast as SonnerToast, Toaster as SonnerToaster } from "sonner"
import { ChatProvider } from "@renderer/context/ChatContext"
import ChatSheetComponent from "@renderer/components/sys/ChatSheetComponent"
import ChatSheetHoverComponent from "@renderer/components/sys/ChatSheetHoverComponent"
import ChatWindowsComponent from "@renderer/components/chat/ChatWindowComponentV2"

export default () => {
    return (
        <div className="div-app app-dragable flex flex-col">
            <Toaster />
            <ChatProvider>
                <ChatWindowsComponent />
                <ChatSheetHoverComponent />
                <ChatSheetComponent />
            </ChatProvider>
        </div>
    )
}
