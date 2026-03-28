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

export type UserInfoSetResponse = {
  success: boolean
  info: UserInfo
  isEmpty: boolean
  file_path?: string
  message: string
}
