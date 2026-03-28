import { describe, expect, it } from 'vitest'
import { serializeError } from '../serializeError'

describe('serializeError', () => {
  it('serializes name, message, stack, code, and nested causes', () => {
    const root = new Error('root cause')
    root.name = 'RootError'

    const middle = new Error('middle cause', { cause: root })
    middle.name = 'MiddleError'
    ;(middle as Error & { code?: string }).code = 'MIDDLE'

    const top = new Error('top level', { cause: middle })
    top.name = 'TopError'

    expect(serializeError(top)).toEqual({
      name: 'TopError',
      message: 'top level',
      stack: top.stack,
      code: undefined,
      cause: {
        name: 'MiddleError',
        message: 'middle cause',
        stack: middle.stack,
        code: 'MIDDLE',
        cause: {
          name: 'RootError',
          message: 'root cause',
          stack: root.stack,
          code: undefined
        }
      }
    })
  })

  it('caps nested cause serialization depth', () => {
    const level4 = new Error('level 4')
    const level3 = new Error('level 3', { cause: level4 })
    const level2 = new Error('level 2', { cause: level3 })
    const level1 = new Error('level 1', { cause: level2 })
    const top = new Error('top', { cause: level1 })

    expect(serializeError(top)).toEqual({
      name: 'Error',
      message: 'top',
      stack: top.stack,
      code: undefined,
      cause: {
        name: 'Error',
        message: 'level 1',
        stack: level1.stack,
        code: undefined,
        cause: {
          name: 'Error',
          message: 'level 2',
          stack: level2.stack,
          code: undefined,
          cause: {
            name: 'Error',
            message: 'level 3',
            stack: level3.stack,
            code: undefined
          }
        }
      }
    })
  })
})
