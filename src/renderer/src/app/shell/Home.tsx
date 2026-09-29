import { useEffect, type ReactElement } from 'react';
import {
  ChatSheet,
  ChatSheetHover,
  ChatWindow,
  TasksPage,
  useChatStore,
} from '@renderer/features/chat';
import { Toaster as SonnerToaster } from '@renderer/shared/components/ui/sonner';
import { Toaster } from '@renderer/shared/components/ui/toaster';
import { rendererStartupTracer } from '@renderer/shared/lib/startupTracer';

export default function Home(): ReactElement {
  const tasksPageOpen = useChatStore((state) => state.tasksPageOpen);
  useEffect(() => {
    rendererStartupTracer.mark('route.home.mounted');
  }, []);

  return (
    <div className="div-app flex flex-col">
      <Toaster />
      <SonnerToaster duration={3000} />
      <ChatWindow />
      {tasksPageOpen && <TasksPage />}
      {/* Keep the shared edge trigger above the Tasks page at the same stacking level. */}
      <ChatSheetHover />
      <ChatSheet />
    </div>
  );
}
