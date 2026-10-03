import { mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResultFact } from '../../ToolResultFact'
import { DefaultToolResultNormalizer } from '../ToolResultNormalizer'
import { createToolFailure } from '@shared/tools/toolFailure'

const roots: string[] = []
const workspace = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'tool-normalize-'))
  roots.push(root)
  return root
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
const fact = (content: unknown): ToolResultFact => ({
  status: 'success',
  stepId: 's',
  toolCallId: 'c',
  toolCallIndex: 0,
  toolName: 'exec',
  content
})
const readPath = (modelContent: string): string => modelContent.match(/raw_result: ([^\n]+)/)![1]

describe('DefaultToolResultNormalizer', () => {
  it('preserves literal image data in a bounded text view without producing artifacts', () => {
    const root = workspace()
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
    const modelContent = `file_version=sha256:test\nconst image = "data:image/png;base64,${png}"\n${'\\'.repeat(29_000)}`
    const content = { content: modelContent, file_version: 'sha256:test' }
    const input: ToolResultFact = {
      ...fact(content),
      modelContent,
      modelContentKind: 'text'
    }
    const normalizer = new DefaultToolResultNormalizer({ workspaceRoot: root })

    expect(JSON.stringify(content).length).toBeGreaterThan(32_000)
    expect(normalizer.normalize(input)).toBe(input)
    expect(normalizer.normalize(input).content).toBe(content)
    expect(readdirSync(root)).toEqual([])
  })

  it.each([true, false])(
    'extracts images from a custom JSON view and preserves its tail selection (data URL=%s)',
    (dataUrl) => {
      const root = workspace()
      const png =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
      const image = dataUrl ? `data:image/png;base64,${png}\nFINAL STDOUT` : png
      const content = { stdout: 'OMITTED HEAD', screenshot: image, stderr: 'FINAL ERROR' }
      const custom = {
        ...fact(content),
        modelContent: JSON.stringify({ screenshot: image, stderr: 'FINAL ERROR' })
      }
      const normalizer = new DefaultToolResultNormalizer({ workspaceRoot: root })
      const result = normalizer.normalize(custom)
      expect(result.content).toBe(content)
      expect(result.modelContent).not.toContain(png)
      expect(result.modelContent).not.toContain('OMITTED HEAD')
      expect(result.modelContent).toContain('FINAL ERROR')
    if (dataUrl) expect(result.modelContent).toContain('FINAL STDOUT')
      const imagePath = result.modelContent!.match(/image: ([^\n]+)/)![1]
      expect(imagePath).toMatch(/^\.tmp\/images\/[^/]+\.png$/)
      expect(readFileSync(path.join(root, imagePath))).toEqual(Buffer.from(png, 'base64'))
      expect(normalizer.normalize(result)).toBe(result)
    }
  )
  it('preserves the structured failure prefix while extracting a custom view image', () => {
    const root = workspace()
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
    const modelContent =
      '[tool_failure]\ncode=COMMAND_EXIT_NONZERO\n' +
      JSON.stringify({ stdout: png, stderr: 'failed' })
    const result = new DefaultToolResultNormalizer({ workspaceRoot: root }).normalize({
      ...fact({ stdout: png }),
      modelContent
    })
    expect(result.modelContent).toMatch(/^\[tool_failure\]\ncode=COMMAND_EXIT_NONZERO/)
    expect(result.modelContent).not.toContain(png)
    expect(result.modelContent).toContain('failed')
  })
  it('rejects image directory symlink escapes', () => {
    const root = workspace()
    const outside = workspace()
    mkdirSync(path.join(root, '.tmp'))
    symlinkSync(outside, path.join(root, '.tmp/images'))
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
    const result = new DefaultToolResultNormalizer({ workspaceRoot: root }).normalize({
      ...fact(png),
      modelContent: png
    })
    expect(result.modelContent).toContain('not recoverable')
    expect(result.modelContent).not.toContain(png)
    expect(readdirSync(outside)).toEqual([])
  })

  it('accepts a bounded tool view and falls back when the view exceeds its budget', () => {
    const normalizer = new DefaultToolResultNormalizer({ workspaceRoot: workspace() })
    const custom = { ...fact('raw log'), modelContent: 'tail log' }
    expect(normalizer.normalize(custom)).toBe(custom)
    expect(normalizer.normalize({ ...custom, modelContent: 'x'.repeat(32_001), modelContentKind: 'text' })).toMatchObject({
      content: 'raw log',
      modelContent: 'raw log',
      modelContentKind: undefined
    })
  })

  it('preserves small values and prepares empty results', () => {
    const root = workspace()
    const normalizer = new DefaultToolResultNormalizer({ workspaceRoot: root })
    const raw = { value: 123 }
    expect(normalizer.normalize(fact(raw))).toMatchObject({
      content: raw,
      modelContent: '{"value":123}'
    })
    expect(normalizer.normalize(fact('')).modelContent).toBe('[Tool completed with no output]')
    expect(readdirSync(root)).toEqual([])
  })
  it('bounds large model content including metadata and saves an exact readable original', () => {
    const root = workspace()
    const normalizer = new DefaultToolResultNormalizer({ workspaceRoot: root })
    const raw = 'HEAD\n' + '中文😀 long line '.repeat(8_000) + '\nTAIL'
    const result = normalizer.normalize(fact(raw))
    expect(result.content).toBe(raw)
    expect(result.modelContent!.length).toBeLessThanOrEqual(32_000)
    expect(result.modelContent).toContain('HEAD')
    expect(result.modelContent).toContain('TAIL')
    expect(readFileSync(path.join(root, readPath(result.modelContent!)), 'utf8')).toBe(raw)
    expect(normalizer.normalize(result)).toBe(result)
    expect(normalizer.normalize(fact(raw)).modelContent).toBe(result.modelContent)
  })
  it('extracts images without removing program content', () => {
    const root = workspace()
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='
    const content = {
      screenshot: `data:image/png;base64,${png}`,
      windowText: 'Useful accessibility evidence'
    }
    const result = new DefaultToolResultNormalizer({
      workspaceRoot: root
    }).normalize(fact(content))
    expect(result.content).toBe(content)
    expect(result.modelContent).not.toContain(png)
    expect(result.modelContent).toContain('Useful accessibility evidence')
    const imagePath = result.modelContent!.match(/image: ([^\n]+)/)![1]
    expect(readFileSync(path.join(root, imagePath))).toEqual(Buffer.from(png, 'base64'))
  })
  it('reuses small tool-managed artifact descriptors without writing duplicates', () => {
    const root = workspace()
    const content = {
      artifact: { readPath: '.tmp/web-fetch/doc.tmp', sourcePath: '.tmp/web-fetch/doc.tmp' }
    }
    const result = new DefaultToolResultNormalizer({ workspaceRoot: root }).normalize(fact(content))
    expect(result.modelContent).toBe(JSON.stringify(content))
    expect(readdirSync(root)).toEqual([])
  })
  it('keeps failure diagnostics ahead of a long/media result', () => {
    const root = workspace()
    const failure = createToolFailure({
      category: 'operation',
      code: 'EXEC_FAILED',
      message: 'command failed',
      recovery: { action: 'change_strategy', message: 'inspect log' }
    })
    const result = new DefaultToolResultNormalizer({
      workspaceRoot: root
    }).normalize({
      ...fact('data:image/png;base64,' + 'a'.repeat(200) + 'x'.repeat(40_000)),
      status: 'error',
      failure
    })
    expect(result.modelContent).toMatch(/^\[tool_failure\]/)
    expect(result.modelContent).toContain('code=EXEC_FAILED')
    expect(result.modelContent!.length).toBeLessThanOrEqual(32_000)
  })
  it('reports save failure and rejects artifact symlink escapes', () => {
    const root = workspace()
    const outside = workspace()
    mkdirSync(path.join(root, '.ati'))
    symlinkSync(outside, path.join(root, '.ati/artifacts'))
    const result = new DefaultToolResultNormalizer({
      workspaceRoot: root
    }).normalize(fact('x'.repeat(40_000)))
    expect(result.modelContent).toContain('not recoverable')
    expect(result.modelContent).not.toContain('raw_result:')
    expect(result.modelContent!.length).toBeLessThanOrEqual(32_000)
    expect(readdirSync(outside)).toEqual([])
  })
})
