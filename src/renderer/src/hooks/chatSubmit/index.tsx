import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'
import { ChatDependencyContainer } from './container'

function useChatSubmitV2() {
  // 收集依赖
  const chatContext = useChatContext()
  const chatStore = useChatStore()
  const appConfig = useAppConfigStore()

  // 创建容器
  // 注意：不使用 useMemo，因为 Zustand store 每次渲染都会返回新的对象引用
  // Container 创建开销很小，直接创建即可
  const container = new ChatDependencyContainer(chatContext, chatStore, appConfig)

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ): Promise<void> => {
    const machine = container.createMachine()

    try {
      await machine.start({
        prepareParams: container.buildPrepareParams({
          textCtx,
          mediaCtx,
          tools: options.tools,
          prompt: options.prompt
        }),
        finalizeDeps: container.buildFinalizeDeps()
      })
    } catch (error: any) {
      container.resetStates()

      if (error.name !== 'AbortError') {
        toast.error(error.message)
      }
    } finally {
      chatStore.setCurrentReqCtrl(undefined)
    }
  }

  return onSubmit
}

export default useChatSubmitV2
