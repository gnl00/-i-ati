import { describe, expect, it } from 'vitest'

import {
  AVAILABLE_PROVIDERS,
  DEFAULT_PROVIDER_ICON_DESCRIPTOR,
  getProviderIcon,
  getProviderIconDescriptor,
  PROVIDER_ICON_DESCRIPTOR_MAP,
  PROVIDER_ICON_MAP
} from '../providerIcons'

describe('provider icon descriptors', () => {
  it('covers every source mapping with appearance metadata', () => {
    expect(Object.keys(PROVIDER_ICON_DESCRIPTOR_MAP)).toEqual([...AVAILABLE_PROVIDERS])

    for (const [provider, src] of Object.entries(PROVIDER_ICON_MAP)) {
      const descriptor = PROVIDER_ICON_DESCRIPTOR_MAP[provider]
      expect(descriptor?.src).toBe(src)
      expect(['brand', 'monochrome']).toContain(descriptor?.appearance)
    }
  })

  it('classifies colorful and monochrome edge cases explicitly', () => {
    expect(getProviderIconDescriptor('kimi').appearance).toBe('brand')
    expect(getProviderIconDescriptor('zhipu').appearance).toBe('brand')
    expect(getProviderIconDescriptor('xiaomimimo').appearance).toBe('monochrome')
    expect(getProviderIconDescriptor('deepseek').appearance).toBe('monochrome')
  })

  it('reuses descriptors across aliases and keeps source lookup compatibility', () => {
    expect(PROVIDER_ICON_DESCRIPTOR_MAP.google).toBe(PROVIDER_ICON_DESCRIPTOR_MAP.gemini)
    expect(PROVIDER_ICON_DESCRIPTOR_MAP.xiaomi).toBe(PROVIDER_ICON_DESCRIPTOR_MAP.mimo)
    expect(getProviderIconDescriptor('GEMINI')).toBe(PROVIDER_ICON_DESCRIPTOR_MAP.gemini)
    expect(getProviderIcon('gemini')).toBe(PROVIDER_ICON_MAP.gemini)
    expect(getProviderIconDescriptor('unknown-provider')).toBe(DEFAULT_PROVIDER_ICON_DESCRIPTOR)
  })
})
