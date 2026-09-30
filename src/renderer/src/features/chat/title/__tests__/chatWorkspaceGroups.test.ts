import { describe, expect, it } from 'vitest'
import { projectChatWorkspaceGroups } from '../chatWorkspaceGroups'

const result = (id: number, path?: string, updateTime = id): ChatSearchResult => ({
  chat: { id, uuid: `chat-${id}`, title: `Chat ${id}`, messages: [], createTime: 0, updateTime, workspacePath: path },
  matchSource: 'title', messageHitCount: 0, score: updateTime
})

describe('workspace groups', () => {
  it('keeps empty and default paths in Recently, excludes scheduled and sentinel chats', () => {
    const scheduled = result(6, '/project')
    scheduled.chat.isScheduled = true
    const groups = projectChatWorkspaceGroups([
      result(1), result(2, './workspaces/tmp/'), result(3, '/data/workspaces/123e4567-e89b-42d3-a456-426614174000'),
      result(4, './workspaces/chat-4'), result(-1), scheduled, result(5, '/project')
    ])
    expect(groups.map(group => group.label)).toEqual(['Recently', 'project'])
    expect(groups[0].items.map(item => item.chat.id)).toEqual([4, 3, 2, 1])
  })

  it('groups normalized full paths and orders groups and rows by recent activity', () => {
    const groups = projectChatWorkspaceGroups([result(1, 'C:\\code\\app\\'), result(2, '/other'), result(3, 'C:/code/app')])
    expect(groups.map(group => group.label)).toEqual(['app', 'other'])
    expect(groups[0].items.map(item => item.chat.id)).toEqual([3, 1])
    expect(projectChatWorkspaceGroups([result(1, '/other'), result(2, '/other')])).toHaveLength(1)
  })

  it('distinguishes duplicate leaf and parent names, including a workspace named Recently', () => {
    const groups = projectChatWorkspaceGroups([result(1), result(2, '/Recently'), result(3, '/one/code/app'), result(4, '/two/code/app')])
    expect(new Set(groups.map(group => group.label)).size).toBe(4)
    expect(groups.find(group => group.path === '/one/code/app')?.label).toBe('/one/code/app')
  })
})
