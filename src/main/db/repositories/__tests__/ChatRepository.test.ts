import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatRepository } from '../ChatRepository'

describe('ChatRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('materializes load_order and loaded_at before inserting a skill row', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000)

    const skillRepo = {
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
})
