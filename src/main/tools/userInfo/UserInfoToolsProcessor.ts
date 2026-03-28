import UserInfoService from '@main/services/userInfo/UserInfoService'
import type {
  UserInfoGetResponse,
  UserInfoSetArgs,
  UserInfoSetResponse
} from '@tools/userInfo/index.d'

const MAX_NAME_LENGTH = 80
const MAX_PREFERRED_ADDRESS_LENGTH = 80
const MAX_BASIC_INFO_LENGTH = 500
const MAX_PREFERENCES_LENGTH = 500

const trimValue = (value?: string): string => value?.trim() || ''

export async function processUserInfoGet(): Promise<UserInfoGetResponse> {
  try {
    const record = await UserInfoService.getUserInfo()
    return {
      success: true,
      info: record.info,
      isEmpty: record.isEmpty,
      file_path: record.filePath,
      message: record.isEmpty
        ? 'User info is currently empty.'
        : 'User info loaded successfully.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: `Failed to load user info: ${message}`
    }
  }
}

export async function processUserInfoSet(
  args: UserInfoSetArgs
): Promise<UserInfoSetResponse> {
  const name = trimValue(args.name)
  const preferredAddress = trimValue(args.preferredAddress)
  const basicInfo = trimValue(args.basicInfo)
  const preferences = trimValue(args.preferences)

  if (!name && !preferredAddress && !basicInfo && !preferences) {
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: 'At least one user info field must be provided.'
    }
  }

  if (name.length > MAX_NAME_LENGTH) {
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: `name must be at most ${MAX_NAME_LENGTH} characters.`
    }
  }
  if (preferredAddress.length > MAX_PREFERRED_ADDRESS_LENGTH) {
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: `preferredAddress must be at most ${MAX_PREFERRED_ADDRESS_LENGTH} characters.`
    }
  }
  if (basicInfo.length > MAX_BASIC_INFO_LENGTH) {
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: `basicInfo must be at most ${MAX_BASIC_INFO_LENGTH} characters.`
    }
  }
  if (preferences.length > MAX_PREFERENCES_LENGTH) {
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: `preferences must be at most ${MAX_PREFERENCES_LENGTH} characters.`
    }
  }

  try {
    const record = await UserInfoService.setUserInfo({
      name,
      preferredAddress,
      basicInfo,
      preferences
    })

    return {
      success: true,
      info: record.info,
      isEmpty: record.isEmpty,
      file_path: record.filePath,
      message: 'User info saved successfully.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      info: {},
      isEmpty: true,
      message: `Failed to save user info: ${message}`
    }
  }
}
