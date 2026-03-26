import fs from 'node:fs/promises'
import path from 'node:path'
import { app, protocol } from 'electron'
import { createLogger } from '@main/services/logging/LogService'
import { EMOTION_ASSET_PROTOCOL } from '@shared/emotion/constants'
import { EMOTION_LABELS, type EmotionLabel, normalizeEmotionLabel } from '@shared/emotion/emotionAssetCatalog'

const logger = createLogger('EmotionAssetService')

const BUILTIN_EMOTION_ROOT = path.join('emotions', 'packs')
const USER_EMOTION_ROOT = path.join('emotions', 'packs')

export interface EmotionAssetPackInfo {
  name: string
  source: 'builtin' | 'user'
}

function normalizePackName(name: string | undefined): string | undefined {
  const normalized = name?.trim()
  if (!normalized) {
    return undefined
  }
  return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : undefined
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function hasFiles(directoryPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true })
    return entries.some(entry => entry.isFile() && /\.webp$/i.test(entry.name))
  } catch {
    return false
  }
}

export class EmotionAssetService {
  private protocolRegistered = false

  getBuiltinPacksRoot(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, BUILTIN_EMOTION_ROOT)
      : path.join(process.cwd(), 'resources', 'emotions', 'packs')
  }

  getUserPacksRoot(): string {
    return path.join(app.getPath('userData'), USER_EMOTION_ROOT)
  }

  async ensureUserPacksRoot(): Promise<void> {
    await fs.mkdir(this.getUserPacksRoot(), { recursive: true })
  }

  private async listPackDirectories(rootPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter((name): name is string => Boolean(normalizePackName(name)))
        .sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  private async isPackComplete(packRoot: string): Promise<boolean> {
    for (const label of EMOTION_LABELS) {
      const labelDir = path.join(packRoot, label)
      if (!(await hasFiles(labelDir))) {
        return false
      }
    }
    return true
  }

  async listAvailablePacks(): Promise<EmotionAssetPackInfo[]> {
    await this.ensureUserPacksRoot()

    const builtinRoot = this.getBuiltinPacksRoot()
    const userRoot = this.getUserPacksRoot()
    const [builtinNames, userNames] = await Promise.all([
      this.listPackDirectories(builtinRoot),
      this.listPackDirectories(userRoot)
    ])

    const available: EmotionAssetPackInfo[] = []

    for (const name of builtinNames) {
      if (await this.isPackComplete(path.join(builtinRoot, name))) {
        available.push({ name, source: 'builtin' })
      }
    }

    for (const name of userNames) {
      if (await this.isPackComplete(path.join(userRoot, name))) {
        available.push({ name, source: 'user' })
      }
    }

    return available.sort((a, b) => {
      if (a.name === 'default') return -1
      if (b.name === 'default') return 1
      return a.name.localeCompare(b.name)
    })
  }

  private async resolvePackRoot(packName: string): Promise<string | undefined> {
    const normalizedPackName = normalizePackName(packName)
    if (!normalizedPackName) {
      return undefined
    }

    const userRoot = path.join(this.getUserPacksRoot(), normalizedPackName)
    if (await exists(userRoot)) {
      return userRoot
    }

    const builtinRoot = path.join(this.getBuiltinPacksRoot(), normalizedPackName)
    if (await exists(builtinRoot)) {
      return builtinRoot
    }

    return undefined
  }

  async resolveAssetPath(
    packName: string | undefined,
    label: string | undefined,
    emojiName: string | undefined
  ): Promise<string | undefined> {
    const normalizedPackName = normalizePackName(packName) || 'default'
    const normalizedLabel = normalizeEmotionLabel(label)
    const normalizedEmojiName = emojiName?.trim()

    if (!normalizedLabel || !normalizedEmojiName) {
      return undefined
    }

    const packRoots: string[] = []
    const requestedPackRoot = await this.resolvePackRoot(normalizedPackName)
    if (requestedPackRoot) {
      packRoots.push(requestedPackRoot)
    }

    if (normalizedPackName !== 'default') {
      const defaultPackRoot = await this.resolvePackRoot('default')
      if (defaultPackRoot) {
        packRoots.push(defaultPackRoot)
      }
    }

    const fileName = `${normalizedEmojiName}.webp`
    for (const packRoot of packRoots) {
      const candidatePath = path.join(packRoot, normalizedLabel, fileName)
      if (await exists(candidatePath)) {
        return candidatePath
      }
    }

    return undefined
  }

  buildAssetUrl(
    packName: string | undefined,
    label: EmotionLabel | string | undefined,
    emojiName: string | undefined
  ): string | undefined {
    const normalizedPackName = normalizePackName(packName) || 'default'
    const normalizedLabel = normalizeEmotionLabel(label)
    const normalizedEmojiName = emojiName?.trim()

    if (!normalizedLabel || !normalizedEmojiName) {
      return undefined
    }

    return `${EMOTION_ASSET_PROTOCOL}://${encodeURIComponent(normalizedPackName)}/${encodeURIComponent(normalizedLabel)}/${encodeURIComponent(normalizedEmojiName)}.webp`
  }

  async registerProtocol(): Promise<void> {
    if (this.protocolRegistered) {
      return
    }

    protocol.handle(EMOTION_ASSET_PROTOCOL, async (request) => {
      try {
        const url = new URL(request.url)
        const packName = decodeURIComponent(url.hostname)
        const [, rawLabel = '', rawFileName = ''] = url.pathname.split('/')
        const label = decodeURIComponent(rawLabel)
        const emojiName = decodeURIComponent(rawFileName).replace(/\.webp$/i, '')
        const assetPath = await this.resolveAssetPath(packName, label, emojiName)

        if (!assetPath) {
          return new Response('Not Found', { status: 404 })
        }

        const content = await fs.readFile(assetPath)
        return new Response(new Uint8Array(content), {
          headers: {
            'content-type': 'image/webp',
            'cache-control': 'public, max-age=86400'
          }
        })
      } catch (error) {
        logger.error('emotion_asset.protocol_failed', error)
        return new Response('Internal Server Error', { status: 500 })
      }
    })

    this.protocolRegistered = true
  }
}

export const emotionAssetService = new EmotionAssetService()
