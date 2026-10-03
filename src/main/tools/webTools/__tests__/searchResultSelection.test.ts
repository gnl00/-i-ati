import { describe, expect, it } from 'vitest'
import type { SearchResultItem } from '../search-engine/types'
import { selectSearchResults } from '../search-engine/selectResults'

const result = (link: string, title = 'Article'): SearchResultItem => ({ link, title, snippet: '' })

describe('search result selection', () => {
  it('promotes first-party documentation and keeps engine order among peers', () => {
    const items = [result('https://tutorial.com/python'), result('https://docs.python.org/3/library/pathlib.html'), result('https://python.org/about')]
    expect(selectSearchResults(items, 'Python pathlib documentation', 3)).toEqual([items[1], items[2], items[0]])
  })

  it('merges tracking/hash variants without collapsing meaningful query parameters', () => {
    const items = [result('https://example.com/doc?utm_source=search#intro'), result('http://www.example.com/doc/'), result('https://example.com/doc?version=2'), result('https://example.com/doc?version=3')]
    expect(selectSearchResults(items, 'example doc', 3)).toEqual([items[0], items[2], items[3]])
  })

  it('deduplicates Apple regional mirrors while retaining languages and versions', () => {
    const items = [result('https://support.apple.com/en-tm/guide/mac-help/mchl72b408e0/mac'), result('https://support.apple.com/en-au/guide/mac-help/mchl72b408e0/mac'), result('https://support.apple.com/zh-cn/guide/mac-help/mchl72b408e0/mac'), result('https://support.apple.com/en-au/guide/mac-help/mchl72b408e0/15.0/mac')]
    expect(selectSearchResults(items, 'Apple Time Machine', 4)).toEqual([items[0], items[2], items[3]])
  })

  it('keeps community results below first-party articles', () => {
    const items = [result('https://discussions.apple.com/thread/1'), result('https://support.apple.com/en-us/104984')]
    expect(selectSearchResults(items, 'Apple Time Machine official', 1)).toEqual([items[1]])
  })

  it('demotes explicit prereleases unless the query requests them', () => {
    const items = [result('https://docs.python.org/3.16/library/pathlib.html', 'Python 3.16.0a0 documentation'), result('https://docs.python.org/3/library/pathlib.html', 'Python documentation')]
    expect(selectSearchResults(items, 'Python pathlib', 1)).toEqual([items[1]])
    expect(selectSearchResults(items, 'Python 3.16 pathlib', 1)).toEqual([items[0]])
  })

  it('rejects malformed and non-web URLs', () => {
    expect(selectSearchResults([result('bad'), result('javascript:alert(1)')], 'Article', 3)).toEqual([])
  })
})
