import { configDb } from '@main/db/config'
import { telegramGatewayService } from '@main/services/telegram'
import type { TelegramSetupToolArgs, TelegramSetupToolResponse } from '@tools/telegram/index.d'

const buildNextTelegramConfig = (config: IAppConfig, botToken: string): IAppConfig => {
  const {
    providerDefinitions: _providerDefinitions,
    accounts: _accounts,
    ...baseConfig
  } = config

  return {
    ...baseConfig,
  telegram: {
    ...config.telegram,
    enabled: true,
    botToken,
    mode: config.telegram?.mode ?? 'polling'
  }
  }
}

export async function processTelegramSetupTool(
  args: TelegramSetupToolArgs
): Promise<TelegramSetupToolResponse> {
  const botToken = args.bot_token?.trim()
  if (!botToken) {
    return {
      success: false,
      configured: false,
      running: false,
      starting: false,
      message: 'bot_token is required.'
    }
  }

  try {
    const baseConfig = configDb.getConfig() ?? configDb.initConfig()
    await telegramGatewayService.startWithToken(botToken)

    try {
      configDb.saveConfig(buildNextTelegramConfig(baseConfig, botToken))
    } catch (saveError) {
      telegramGatewayService.stop()
      throw saveError
    }

    const status = telegramGatewayService.getStatus()
    return {
      success: true,
      configured: true,
      running: status.running,
      starting: status.starting,
      botUsername: status.botUsername,
      botId: status.botId,
      message: status.botUsername
        ? `Telegram gateway started as @${status.botUsername} and configuration was saved.`
        : 'Telegram gateway started and configuration was saved.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = telegramGatewayService.getStatus()
    return {
      success: false,
      configured: Boolean(status.configured),
      running: status.running,
      starting: status.starting,
      botUsername: status.botUsername,
      botId: status.botId,
      message: `Failed to set up Telegram gateway: ${message}`
    }
  }
}
