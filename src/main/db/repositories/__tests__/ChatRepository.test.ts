import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatRepository } from '../ChatRepository'

describe('ChatRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('materializes load_order and loaded_at before inserting a skill row', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000)

    const skillRepo = {
      getSkills: vi.fn().mockReturnValue([]),
      getMaxLoadOrder: vi.fn().mockReturnValue(4),
      insertSkill: vi.fn()
    }
    const repository = new ChatRepository({
      hasDb: () => true,
      getChatRepo: () => ({}) as any,
      getSkillRepo: () => skillRepo as any
    })

    repository.addSkill(7, 'memory')

    expect(skillRepo.getMaxLoadOrder).toHaveBeenCalledWith(7)
    expect(skillRepo.insertSkill).toHaveBeenCalledWith({
      chat_id: 7,
      skill_name: 'memory',
      load_order: 5,
      loaded_at: 1710000000000
    })
  })

  it('skips inserting a skill row that is already loaded for the chat', () => {
    const skillRepo = {
      getSkills: vi.fn().mockReturnValue([
        {
          chat_id: 7,
          skill_name: 'memory',
          load_order: 1,
          loaded_at: 1710000000000
        }
      ]),
      getMaxLoadOrder: vi.fn(),
      insertSkill: vi.fn()
    }
    const repository = new ChatRepository({
      hasDb: () => true,
      getChatRepo: () => ({}) as any,
      getSkillRepo: () => skillRepo as any
    })

    repository.addSkill(7, 'memory')

    expect(skillRepo.getSkills).toHaveBeenCalledWith(7)
    expect(skillRepo.getMaxLoadOrder).toHaveBeenCalledTimes(0)
    expect(skillRepo.insertSkill).toHaveBeenCalledTimes(0)
  })
})
