import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import UserInfoService from '@main/services/userInfo/UserInfoService'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { buildUserInfoContextContent, buildUserInfoSystemPrompt } from '@shared/prompts'

export class UserInfoPromptProvider {
  constructor(
    private readonly appConfigStore = new AppConfigStore()
  ) {}

  async build(): Promise<string> {
    return buildUserInfoSystemPrompt()
  }

  async buildContext(): Promise<ChatMessage> {
    const record = await UserInfoService.getUserInfo()
    const content = buildUserInfoContextContent(record.info, {
      telegram: this.buildTelegramRuntime()
    })

    return {
      role: 'user',
      source: MESSAGE_SOURCE.USER_INFO_CONTEXT,
      content,
      segments: []
    }
  }

  private buildTelegramRuntime() {
    const telegram = this.appConfigStore.getConfig()?.telegram

    return {
      enabled: telegram?.enabled,
      botUsername: telegram?.botUsername,
      botId: telegram?.botId,
      mode: telegram?.mode,
      proactiveMessagingAvailable: Boolean(telegram?.enabled && telegram?.botToken)
    }
  }
}
