import { AppConfigStore } from '@main/hosts/chat/config/AppConfigStore'
import UserInfoService from '@main/services/userInfo/UserInfoService'
import { buildUserInfoPrompt } from '@shared/prompts'

export class UserInfoPromptProvider {
  constructor(
    private readonly appConfigStore = new AppConfigStore()
  ) {}

  async build(): Promise<string> {
    const record = await UserInfoService.getUserInfo()
    const telegram = this.appConfigStore.getConfig()?.telegram

    return buildUserInfoPrompt(record.info, {
      telegram: {
        enabled: telegram?.enabled,
        botUsername: telegram?.botUsername,
        botId: telegram?.botId,
        mode: telegram?.mode,
        proactiveMessagingAvailable: Boolean(telegram?.enabled && telegram?.botToken)
      }
    })
  }
}
