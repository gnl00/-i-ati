import UserInfoService from '@main/services/userInfo/UserInfoService'
import { buildUserInfoPrompt } from '@shared/prompts'

export class UserInfoPromptProvider {
  async build(): Promise<string> {
    const record = await UserInfoService.getUserInfo()
    return buildUserInfoPrompt(record.info)
  }
}
