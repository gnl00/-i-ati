import { SidebarProvider, SidebarTrigger } from "@renderer/components/ui/sidebar"
import { AppSidebar } from "@renderer/components/app-sidebar"

export default () => {
    return (
        <SidebarProvider>
          <AppSidebar />
          <main>
            <SidebarTrigger />
          </main>
        </SidebarProvider>
      )
}