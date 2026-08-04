export type UserInfoAction = 'get' | 'set'

export type UserInfoSetArgs = {
  name?: string
  preferredAddress?: string
  basicInfo?: string
  preferences?: string
}

export type UserInfoGetResponse = {
  success: boolean
  info: UserInfo
  isEmpty: boolean
  file_path?: string
  message: string
}

export type UserInfoResponse =
  | UserInfoGetResponse
  | UserInfoErrorResponse

export interface UserInfoErrorResponse {
  success: false
  message: string
}
