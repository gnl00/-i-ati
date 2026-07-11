import { useEffect } from 'react'
import { Toaster as SonnerToaster } from 'sonner'
import { ChatSheet, ChatSheetHover, ChatWindow } from '@renderer/features/chat'
import { Toaster } from '@renderer/shared/components/ui/toaster'
import { rendererStartupTracer } from '@renderer/shared/lib/startupTracer'

export default () => {
  useEffect(() => {
    rendererStartupTracer.mark('route.home.mounted')
  }, [])

  return (
    <div className="div-app flex flex-col">
      <Toaster />
      <SonnerToaster
        richColors
        duration={3000}
      />
      <ChatWindow />
      <ChatSheetHover />
      <ChatSheet />
    </div>
  )
}
