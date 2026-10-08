import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import {
  invokeSkillGetContent,
  invokeSkillList,
  invokeSkillLoad,
  invokeSkillUnload
} from '@renderer/infrastructure/ipc'
import { invokeEnsureWorkspaceDirectory } from '@renderer/infrastructure/tools/workspace/renderer/WorkspaceInvoker'
import { saveChat, updateChat } from '@renderer/infrastructure/persistence/ChatRepository'
import { getChatSkills } from '@renderer/infrastructure/persistence/ChatSkillRepository'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'
import { useChatStore } from '../state/chatStore'
import { useToolUserQuestionStore } from '../state/toolUserQuestionStore'

const EMPTY_ACTIVE_SKILLS: string[] = []

export function useSkillActivation(options: {
  onChatCreated?: (chatUuid: string) => void
} = {}): {
  skills: SkillMetadata[]
  activeSkills: string[]
  loading: boolean
  loadError: string | null
  refreshSkills: () => void
  activateSkill: (name: string) => Promise<boolean>
  deactivateSkill: (name: string) => Promise<boolean>
  isUpdatingSkills: boolean
} {
  const chatId = useChatStore(state => state.currentChatId)
  const chatUuid = useChatStore(state => state.currentChatUuid)
  const skillsRevision = useChatStore(state => state.currentChatUuid
    ? (state.chatSkillsRevisionByChatUuid[state.currentChatUuid] ?? 0)
    : 0)
  const [skills, setSkills] = useState<SkillMetadata[]>([])
  const [activeSkillsState, setActiveSkillsState] = useState<{ chatId: number | null; names: string[] }>({
    chatId: null,
    names: []
  })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isUpdatingSkills, setIsUpdatingSkills] = useState(false)
  const mountedRef = useRef(false)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const skillsMutationLock = useRef(false)
  const catalogRequest = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return (): void => { mountedRef.current = false }
  }, [])

  const refreshSkills = useCallback((): void => {
    const request = ++catalogRequest.current
    setLoading(true)
    setLoadError(null)
    void invokeSkillList()
      .then(availableSkills => {
        if (mountedRef.current && request === catalogRequest.current) setSkills(availableSkills)
      })
      .catch(() => {
        if (mountedRef.current && request === catalogRequest.current) {
          setLoadError('Failed to load skills. Try again.')
        }
      })
      .finally(() => {
        if (mountedRef.current && request === catalogRequest.current) setLoading(false)
      })
  }, [])

  useEffect(refreshSkills, [refreshSkills])

  useEffect(() => {
    if (!chatId) {
      setActiveSkillsState({ chatId: null, names: [] })
      return
    }
    let cancelled = false
    void getChatSkills(chatId)
      .then(names => {
        if (!cancelled) setActiveSkillsState({ chatId, names })
      })
      .catch(() => {
        if (!cancelled) setActiveSkillsState({ chatId, names: [] })
      })
    return (): void => { cancelled = true }
  }, [chatId, chatUuid, skillsRevision])

  const activateSkill = useCallback(async (name: string): Promise<boolean> => {
    if (skillsMutationLock.current || !mountedRef.current) return false
    const initialState = useChatStore.getState()
    let sourceId = initialState.currentChatId
    let sourceUuid = initialState.currentChatUuid
    let selectionEpoch = initialState.getSelectionEpoch()
    const isCurrent = (): boolean => {
      const state = useChatStore.getState()
      return mountedRef.current
        && state.getSelectionEpoch() === selectionEpoch
        && state.currentChatId === sourceId
        && state.currentChatUuid === sourceUuid
    }
    const isIdle = (): boolean => {
      const state = useChatStore.getState()
      return state.runPhase === 'idle'
        && state.postRunJobs.title !== 'pending'
        && state.postRunJobs.compression !== 'pending'
        && useToolUserQuestionStore.getState().pendingRequests.length === 0
    }
    if (!isIdle()) {
      toast.error('Wait for the current task to finish before activating a skill')
      return false
    }

    skillsMutationLock.current = true
    setIsUpdatingSkills(true)
    let savedChat: ChatEntity | undefined
    try {
      const availableSkills = await invokeSkillList()
      if (!isCurrent()) return false
      setSkills(availableSkills)
      setLoadError(null)
      if (!availableSkills.some(skill => skill.name === name)) {
        throw new Error(`Skill not found: ${name}`)
      }
      if (!isIdle()) throw new Error('Wait for the current task to finish before activating a skill')

      let targetId = sourceId
      let targetUuid = sourceUuid
      if (!targetId && !targetUuid) {
        // Validate the file before creating a persistent empty chat.
        await invokeSkillGetContent(name)
        if (!isCurrent()) return false
        if (!isIdle()) throw new Error('Wait for the current task to finish before activating a skill')
        targetUuid = uuidv4()
        const workspacePath = getDefaultWorkspacePath(targetUuid)
        const directory = await invokeEnsureWorkspaceDirectory({
          chat_uuid: targetUuid,
          workspace_path: workspacePath
        })
        if (!isCurrent()) return false
        if (!directory.success) throw new Error(directory.error || 'Failed to create the chat workspace')
        if (!isIdle()) throw new Error('Wait for the current task to finish before activating a skill')
        const draft = useChatStore.getState()
        const now = Date.now()
        savedChat = {
          uuid: targetUuid,
          title: 'NewChat',
          messages: [],
          workspacePath: directory.path || workspacePath,
          userInstruction: draft.userInstruction,
          modelRef: draft.selectedModelRef,
          permissionApprovalMode: draft.permissionApprovalMode,
          createTime: now,
          updateTime: now
        }
        targetId = await saveChat(savedChat)
        savedChat.id = targetId
        // Keep a saved chat accessible even if selection changes during the save.
        if (!isCurrent() || !isIdle()) {
          useChatStore.getState().prependChatListEntry(savedChat)
          if (!isCurrent()) return false
          throw new Error('Wait for the current task to finish before activating a skill')
        }
        const latestDraft = useChatStore.getState()
        const settingsChanged = savedChat.userInstruction !== latestDraft.userInstruction
          || savedChat.permissionApprovalMode !== latestDraft.permissionApprovalMode
          || savedChat.modelRef?.accountId !== latestDraft.selectedModelRef?.accountId
          || savedChat.modelRef?.modelId !== latestDraft.selectedModelRef?.modelId
        savedChat = {
          ...savedChat,
          userInstruction: latestDraft.userInstruction,
          permissionApprovalMode: latestDraft.permissionApprovalMode,
          modelRef: latestDraft.selectedModelRef,
          updateTime: Date.now()
        }
        // Send the correction before selecting; later edits use the existing chat persistence flow.
        const settingsUpdate = settingsChanged ? updateChat(savedChat) : undefined
        useChatStore.getState().prependChatListEntry(savedChat)
        optionsRef.current.onChatCreated?.(targetUuid)
        useChatStore.getState().selectChatShell(targetId, targetUuid, savedChat)
        sourceId = targetId
        sourceUuid = targetUuid
        selectionEpoch = useChatStore.getState().getSelectionEpoch()
        await settingsUpdate
        if (!isCurrent()) return false
      }
      if (!targetId || !targetUuid) throw new Error('Current chat is unavailable')
      if (!isIdle()) throw new Error('Wait for the current task to finish before activating a skill')
      const previousSkills = savedChat ? [] : await getChatSkills(targetId)
      if (!isCurrent()) return false
      if (!isIdle()) throw new Error('Wait for the current task to finish before activating a skill')
      const result = await invokeSkillLoad(name, targetUuid)
      if (!result.success || !result.loaded) throw new Error(result.message || `Failed to activate skill: ${name}`)
      useChatStore.getState().bumpChatSkillsRevision(targetUuid)
      if (!isCurrent()) return false
      if (!isIdle()) throw new Error('Wait for the current task to finish before activating a skill')
      setActiveSkillsState({ chatId: targetId, names: Array.from(new Set([...previousSkills, name])) })
      toast.success(previousSkills.includes(name) ? `Skill already active: ${name}` : `Skill activated: ${name}`)
      return true
    } catch (error) {
      if (isCurrent()) {
        toast.error(error instanceof Error ? error.message : `Failed to activate skill: ${name}`)
      }
      return false
    } finally {
      skillsMutationLock.current = false
      if (mountedRef.current) setIsUpdatingSkills(false)
    }
  }, [])

  const deactivateSkill = useCallback(async (name: string): Promise<boolean> => {
    if (skillsMutationLock.current || !mountedRef.current) return false
    const initialState = useChatStore.getState()
    if (initialState.currentChatId !== chatId || initialState.currentChatUuid !== chatUuid) return false
    if (!chatId || !chatUuid) {
      toast.error('Current chat is unavailable')
      return false
    }
    if (initialState.runPhase !== 'idle'
      || initialState.postRunJobs.title === 'pending'
      || initialState.postRunJobs.compression === 'pending'
      || useToolUserQuestionStore.getState().pendingRequests.length > 0) {
      toast.error('Wait for the current task to finish before deactivating a skill')
      return false
    }
    const selectionEpoch = initialState.getSelectionEpoch()
    const isCurrent = (): boolean => {
      const state = useChatStore.getState()
      return mountedRef.current
        && state.getSelectionEpoch() === selectionEpoch
        && state.currentChatId === chatId
        && state.currentChatUuid === chatUuid
    }
    skillsMutationLock.current = true
    setIsUpdatingSkills(true)
    try {
      const result = await invokeSkillUnload(name, chatUuid)
      if (!result.success || !result.removed) throw new Error(result.message || `Failed to deactivate skill: ${name}`)
      useChatStore.getState().bumpChatSkillsRevision(chatUuid)
      if (!isCurrent()) return false
      const names = await getChatSkills(chatId)
      if (!isCurrent()) return false
      setActiveSkillsState({ chatId, names })
      toast.success(`Skill deactivated: ${name}`)
      return true
    } catch (error) {
      if (isCurrent()) {
        toast.error(error instanceof Error ? error.message : `Failed to deactivate skill: ${name}`)
      }
      return false
    } finally {
      skillsMutationLock.current = false
      if (mountedRef.current) setIsUpdatingSkills(false)
    }
  }, [chatId, chatUuid])

  return {
    skills,
    activeSkills: activeSkillsState.chatId === chatId ? activeSkillsState.names : EMPTY_ACTIVE_SKILLS,
    loading,
    loadError,
    refreshSkills,
    activateSkill,
    deactivateSkill,
    isUpdatingSkills
  }
}
