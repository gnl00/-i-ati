#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const DEFAULT_RIPGREP_VERSION = '15.1.0'
const GITHUB_RELEASE_BASE_URL = 'https://github.com/BurntSushi/ripgrep/releases/download'
const CURRENT_PLATFORM_TARGET = 'current'

const PLATFORM_ASSETS = {
  'darwin-arm64': { target: 'aarch64-apple-darwin', extension: 'tar.gz', binary: 'rg' },
  'darwin-x64': { target: 'x86_64-apple-darwin', extension: 'tar.gz', binary: 'rg' },
  'linux-arm64': { target: 'aarch64-unknown-linux-gnu', extension: 'tar.gz', binary: 'rg' },
  'linux-x64': { target: 'x86_64-unknown-linux-musl', extension: 'tar.gz', binary: 'rg' },
  'win32-arm64': { target: 'aarch64-pc-windows-msvc', extension: 'zip', binary: 'rg.exe' },
  'win32-x64': { target: 'x86_64-pc-windows-msvc', extension: 'zip', binary: 'rg.exe' }
}

export function resolveRipgrepAsset({ platform = process.platform, arch = process.arch, version = ripgrepVersion() } = {}) {
  const platformKey = `${platform}-${arch}`
  const asset = PLATFORM_ASSETS[platformKey]
  if (!asset) {
    const supported = Object.keys(PLATFORM_ASSETS).sort().join(', ')
    throw new Error(`Unsupported ripgrep platform "${platformKey}". Supported platforms: ${supported}.`)
  }

  const assetName = `ripgrep-${version}-${asset.target}.${asset.extension}`
  return {
    ...asset,
    assetName,
    platformKey,
    url: `${GITHUB_RELEASE_BASE_URL}/${version}/${assetName}`
  }
}

export function resolveRipgrepAssets({ version = ripgrepVersion(), target = process.env.RIPGREP_TARGET || 'all' } = {}) {
  if (target === CURRENT_PLATFORM_TARGET) {
    return [resolveRipgrepAsset({ version })]
  }

  if (target !== 'all') {
    throw new Error(`Unsupported RIPGREP_TARGET "${target}". Use "all" or "${CURRENT_PLATFORM_TARGET}".`)
  }

  return Object.keys(PLATFORM_ASSETS).sort().map((platformKey) => {
    const [platform, arch] = platformKey.split('-')
    return resolveRipgrepAsset({ platform, arch, version })
  })
}

function ripgrepVersion() {
  return process.env.RIPGREP_VERSION || DEFAULT_RIPGREP_VERSION
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      ['--location', '--fail', '--show-error', '--output', destination, url],
      { maxBuffer: 1024 * 1024 * 4, windowsHide: true },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve()
          return
        }

        if (error.code === 'ENOENT') {
          reject(new Error('curl is required to download ripgrep, but it was not found on PATH. Install curl or add it to PATH.'))
          return
        }

        const detail = stderr.trim()
        const suffix = detail ? `\n${detail}` : ''
        reject(new Error(`curl failed while downloading ${url} to ${destination}.${suffix}`))
      }
    )
  })
}

function isRipgrepBinary(entryName, binaryName) {
  return entryName.split('/').pop() === binaryName
}

function stripTrailingNulls(value) {
  const nullIndex = value.indexOf('\0')
  return nullIndex >= 0 ? value.slice(0, nullIndex) : value
}

function parseTarSize(header) {
  const raw = stripTrailingNulls(header.subarray(124, 136).toString('utf8')).trim()
  return raw ? Number.parseInt(raw, 8) : 0
}

async function extractTarGzBinary(archivePath, binaryName, destination) {
  const archive = await readFile(archivePath)
  const tar = zlib.gunzipSync(archive)
  let offset = 0

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break

    const name = stripTrailingNulls(header.subarray(0, 100).toString('utf8'))
    const prefix = stripTrailingNulls(header.subarray(345, 500).toString('utf8'))
    const entryName = prefix ? `${prefix}/${name}` : name
    const size = parseTarSize(header)
    const contentOffset = offset + 512
    const nextOffset = contentOffset + Math.ceil(size / 512) * 512

    if (isRipgrepBinary(entryName, binaryName)) {
      await writeFile(destination, tar.subarray(contentOffset, contentOffset + size))
      return
    }

    offset = nextOffset
  }

  throw new Error(`Could not find ${binaryName} in ${path.basename(archivePath)}`)
}

function findEndOfCentralDirectory(zip) {
  const minimumOffset = Math.max(0, zip.length - 65_557)
  for (let offset = zip.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset
  }
  throw new Error('Could not find zip central directory')
}

function inflateZipEntry(zip, entry) {
  if (zip.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid zip local header for ${entry.name}`)
  }

  const fileNameLength = zip.readUInt16LE(entry.localHeaderOffset + 26)
  const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28)
  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength
  const compressed = zip.subarray(dataOffset, dataOffset + entry.compressedSize)

  if (entry.compressionMethod === 0) return compressed
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed)

  throw new Error(`Unsupported zip compression method ${entry.compressionMethod} for ${entry.name}`)
}

async function extractZipBinary(archivePath, binaryName, destination) {
  const zip = await readFile(archivePath)
  const eocdOffset = findEndOfCentralDirectory(zip)
  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  let offset = zip.readUInt32LE(eocdOffset + 16)

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid zip central directory entry at offset ${offset}`)
    }

    const compressionMethod = zip.readUInt16LE(offset + 10)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const fileNameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localHeaderOffset = zip.readUInt32LE(offset + 42)
    const name = zip.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')

    if (isRipgrepBinary(name, binaryName)) {
      const content = inflateZipEntry(zip, {
        name,
        compressionMethod,
        compressedSize,
        localHeaderOffset
      })
      await writeFile(destination, content)
      return
    }

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  throw new Error(`Could not find ${binaryName} in ${path.basename(archivePath)}`)
}

async function extractBinary(archivePath, asset, destination) {
  if (asset.extension === 'zip') {
    await extractZipBinary(archivePath, asset.binary, destination)
    return
  }

  await extractTarGzBinary(archivePath, asset.binary, destination)
}

async function prepareRipgrepAsset(asset) {
  const destinationDir = path.join(process.cwd(), 'resources', 'native', 'ripgrep', asset.platformKey)
  const destination = path.join(destinationDir, asset.binary)
  const tempDir = await mkdtemp(path.join(tmpdir(), 'ati-ripgrep-'))
  const archivePath = path.join(tempDir, asset.assetName)

  try {
    await mkdir(destinationDir, { recursive: true })
    console.log(`Downloading ${asset.url}`)
    await downloadFile(asset.url, archivePath)
    await extractBinary(archivePath, asset, destination)

    if (process.platform !== 'win32') {
      await chmod(destination, 0o755)
    }

    console.log(destination)
    return destination
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function prepareRipgrep() {
  const assets = resolveRipgrepAssets()
  const destinations = []

  for (const asset of assets) {
    destinations.push(await prepareRipgrepAsset(asset))
  }

  console.log(`Prepared ${destinations.length} ripgrep binary/binaries.`)
  return destinations
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  prepareRipgrep().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
