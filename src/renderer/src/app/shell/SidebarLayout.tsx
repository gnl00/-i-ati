import { SidebarProvider, SidebarTrigger } from "@renderer/shared/components/ui/sidebar"
import { AppSidebar } from "@renderer/app/shell/AppSidebar"

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