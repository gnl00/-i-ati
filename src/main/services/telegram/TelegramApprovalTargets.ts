import { chatDb } from '@main/db/chat'
import type { TelegramConfirmationTarget } from '@shared/tools/confirmation'

export function resolveTelegramApprovalTargets(
  chatUuid: string | undefined,
  host?: ChatMessageHostMeta
): TelegramConfirmationTarget[] {
  if (!chatUuid) return []
  const targets = chatDb.getChatHostBindingsByChatUuid(chatUuid)
    .filter(binding => binding.hostType === 'telegram' && binding.status === 'active')
    .map(binding => ({ peerId: binding.hostChatId, threadId: binding.hostThreadId }))
  if (host?.type === 'telegram') targets.push({ peerId: host.peerId, threadId: host.threadId })
  return [...new Map(targets.map(target => [JSON.stringify([target.peerId, target.threadId ?? null]), target])).values()]
}
