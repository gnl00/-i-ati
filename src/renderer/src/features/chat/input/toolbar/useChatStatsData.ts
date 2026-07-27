import { getChatSkills } from '@renderer/infrastructure/persistence/ChatSkillRepository'
import { getCompressedSummariesByChatId } from '@renderer/infrastructure/persistence/CompressedSummaryRepository'
import React from 'react'

type ChatStatsPersistenceData = {
  chatId: number | null
  activeSkills: string[]
  compressionCount: number
  activeCompressedMessageIds: Set<number>
  loading: boolean
  hasSnapshot: boolean
}

type SkillsState = {
  chatId: number | null
  activeSkills: string[]
  loading: boolean
}

type SummariesState = {
  chatId: number | null
  compressionCount: number
  activeCompressedMessageIds: Set<number>
  loading: boolean
  hasSnapshot: boolean
}

const EMPTY_SKILLS_STATE: SkillsState = {
  chatId: null,
  activeSkills: [],
  loading: false
}

const EMPTY_SUMMARIES_STATE: SummariesState = {
  chatId: null,
  compressionCount: 0,
  activeCompressedMessageIds: new Set(),
  loading: false,
  hasSnapshot: false
}

function collectActiveCompressedMessageIds(
  summaries: CompressedSummaryEntity[]
): Set<number> {
  const activeCompressedMessageIds = new Set<number>()
  summaries
    .filter(summary => summary.status === 'active')
    .forEach(summary => {
      summary.messageIds.forEach(id => activeCompressedMessageIds.add(id))
    })
  return activeCompressedMessageIds
}

export function useChatStatsData(
  chatId: number | null,
  compressionSummaryRevision: number
): ChatStatsPersistenceData {
  const skillsRequestSequenceRef = React.useRef(0)
  const summariesRequestSequenceRef = React.useRef(0)
  const [skillsState, setSkillsState] = React.useState<SkillsState>(EMPTY_SKILLS_STATE)
  const [summariesState, setSummariesState] = React.useState<SummariesState>(
    EMPTY_SUMMARIES_STATE
  )

  React.useEffect(() => {
    const requestSequence = skillsRequestSequenceRef.current + 1
    skillsRequestSequenceRef.current = requestSequence

    if (!chatId) {
      setSkillsState(EMPTY_SKILLS_STATE)
      return
    }

    setSkillsState(previous => previous.chatId === chatId
      ? { ...previous, loading: true }
      : {
        chatId,
        activeSkills: [],
        loading: true
      })

    void getChatSkills(chatId)
      .then(activeSkills => {
        if (skillsRequestSequenceRef.current !== requestSequence) {
          return
        }
        setSkillsState({
          chatId,
          activeSkills,
          loading: false
        })
      })
      .catch(() => {
        if (skillsRequestSequenceRef.current !== requestSequence) {
          return
        }
        setSkillsState(previous => ({
          chatId,
          activeSkills: previous.chatId === chatId ? previous.activeSkills : [],
          loading: false
        }))
      })
  }, [chatId])

  React.useEffect(() => {
    const requestSequence = summariesRequestSequenceRef.current + 1
    summariesRequestSequenceRef.current = requestSequence

    if (!chatId) {
      setSummariesState(EMPTY_SUMMARIES_STATE)
      return
    }

    setSummariesState(previous => previous.chatId === chatId
      ? { ...previous, loading: true }
      : {
        ...EMPTY_SUMMARIES_STATE,
        chatId,
        loading: true
      })

    void getCompressedSummariesByChatId(chatId)
      .then(summaries => {
        if (summariesRequestSequenceRef.current !== requestSequence) {
          return
        }
        setSummariesState({
          chatId,
          compressionCount: summaries.length,
          activeCompressedMessageIds: collectActiveCompressedMessageIds(summaries),
          loading: false,
          hasSnapshot: true
        })
      })
      .catch(() => {
        if (summariesRequestSequenceRef.current !== requestSequence) {
          return
        }
        setSummariesState(previous => previous.chatId === chatId
          ? { ...previous, loading: false }
          : {
            ...EMPTY_SUMMARIES_STATE,
            chatId
          })
      })
  }, [chatId, compressionSummaryRevision])

  const currentSkills = skillsState.chatId === chatId
    ? skillsState
    : { ...EMPTY_SKILLS_STATE, chatId }
  const currentSummaries = summariesState.chatId === chatId
    ? summariesState
    : { ...EMPTY_SUMMARIES_STATE, chatId }

  return {
    chatId,
    activeSkills: currentSkills.activeSkills,
    compressionCount: currentSummaries.compressionCount,
    activeCompressedMessageIds: currentSummaries.activeCompressedMessageIds,
    loading: currentSkills.loading || currentSummaries.loading,
    hasSnapshot: currentSummaries.hasSnapshot
  }
}
