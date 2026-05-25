import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResultFact } from '../../ToolResultFact'
import {
  DefaultToolResultNormalizer,
  isNormalizedToolResultContent
} from '../ToolResultNormalizer'

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3vWQAAAABJRU5ErkJggg=='

let tempDir = ''

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

const createNormalizer = (maxInlineCharacters?: number): DefaultToolResultNormalizer => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'tool-result-normalizer-'))
  return new DefaultToolResultNormalizer({
    baseDir: tempDir,
    scopeId: 'chat-1',
    maxInlineCharacters
  })
}

const createResult = (content: unknown): ToolResultFact => ({
  stepId: 'step-1',
  toolCallId: 'tool-1',
  toolCallIndex: 0,
  toolName: 'test_tool',
  status: 'success',
  content
})

describe('DefaultToolResultNormalizer', () => {
  it('keeps small text inline', () => {
    const normalizer = createNormalizer()
    const result = createResult('small output')

    expect(normalizer.normalize(result)).toEqual(result)
  })

  it('extracts inline image data into artifacts', () => {
    const normalizer = createNormalizer()
    const result = normalizer.normalize(createResult({
      screenshot: `data:image/png;base64,${PNG_1X1_BASE64}`
    }))

    expect(isNormalizedToolResultContent(result.content)).toBe(true)
    if (!isNormalizedToolResultContent(result.content)) {
      throw new Error('Expected normalized content')
    }

    expect(result.content.original.triggers).toContain('inline_image')
    expect(result.content.modelContent).not.toContain(PNG_1X1_BASE64)
    const imageArtifact = result.content.artifacts.find(artifact => artifact.kind === 'image')
    const rawArtifact = result.content.artifacts.find(artifact => artifact.kind === 'raw_result')

    expect(imageArtifact?.mimeType).toBe('image/png')
    expect(imageArtifact?.path).toContain(path.join('chat-1', 'step-1', 'tool-1'))
    expect(imageArtifact ? statSync(imageArtifact.path).size : 0).toBeGreaterThan(0)
    expect(rawArtifact?.path.endsWith('raw-result.json.gz')).toBe(true)
  })

  it('writes large payloads to a raw artifact', () => {
    const normalizer = createNormalizer(20)
    const raw = 'x'.repeat(100)
    const result = normalizer.normalize(createResult(raw))

    expect(isNormalizedToolResultContent(result.content)).toBe(true)
    if (!isNormalizedToolResultContent(result.content)) {
      throw new Error('Expected normalized content')
    }

    expect(result.content.original.triggers).toEqual(['large_content'])
    const rawArtifact = result.content.artifacts.find(artifact => artifact.kind === 'raw_result')
    expect(rawArtifact).toBeTruthy()
    expect(gunzipSync(readFileSync(rawArtifact!.path)).toString('utf8')).toBe(raw)
  })
})
