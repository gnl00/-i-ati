// 导出所有错误类型
export * from './base'
export * from './types'

// 导出 Result 类型
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

// Result 工具函数
export const ok = <T>(data: T): Result<T, never> => ({
  success: true,
  data
})

export const err = <E extends Error>(error: E): Result<never, E> => ({
  success: false,
  error
})
