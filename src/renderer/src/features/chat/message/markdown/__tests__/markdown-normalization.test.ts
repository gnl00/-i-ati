import { describe, expect, it } from 'vitest'
import { fixMalformedCodeBlocks, normalizeLanguage } from '../markdown-normalization'

describe('markdown-normalization', () => {
  describe('normalizeLanguage', () => {
    it('normalizes common aliases', () => {
      expect(normalizeLanguage('typescript')).toBe('ts')
      expect(normalizeLanguage('javascript')).toBe('js')
      expect(normalizeLanguage('python')).toBe('py')
      expect(normalizeLanguage('txt')).toBe('text')
      expect(normalizeLanguage('c++')).toBe('cpp')
    })
  })

  describe('fixMalformedCodeBlocks', () => {
    it('splits text-prefixed malformed fences into language and content', () => {
      const input = '```textsubagent ok```'

      expect(fixMalformedCodeBlocks(input)).toBe('```text\nsubagent ok\n```')
    })

    it('splits exact language plus same-line code content', () => {
      const input = "```bashecho 'test'```"

      expect(fixMalformedCodeBlocks(input)).toBe("```bash\necho 'test'\n```")
    })

    it('splits structured languages with inline content', () => {
      const input = '```json{"ok":true}```'

      expect(fixMalformedCodeBlocks(input)).toBe('```json\n{"ok":true}\n```')
    })

    it('downgrades unknown malformed fence language to a plain code block', () => {
      const input = '```unknownstuff ok```'

      expect(fixMalformedCodeBlocks(input)).toBe('```\nunknownstuff ok\n```')
    })

    it('inserts a newline before fences glued to preceding text', () => {
      const input = 'before```jsconsole.log(1)```'

      expect(fixMalformedCodeBlocks(input)).toBe('before\n```js\nconsole.log(1)\n```')
    })

    it('keeps already valid fenced code blocks unchanged', () => {
      const input = '```text\nsubagent ok\n```'

      expect(fixMalformedCodeBlocks(input)).toBe(input)
    })
  })
})
