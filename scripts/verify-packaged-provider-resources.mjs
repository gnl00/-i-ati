import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const sourceFile = path.join(projectRoot, 'resources/providers/providers.json')

function getUnpackedDirectoryName(platform, arch) {
  if (platform === 'darwin') {
    return arch === 'x64' ? 'mac' : `mac-${arch}`
  }

  const platformPrefix = platform === 'win32' ? 'win' : platform
  return arch === 'x64'
    ? `${platformPrefix}-unpacked`
    : `${platformPrefix}-${arch}-unpacked`
}

async function getPackagedProviderFile() {
  const unpackedDir = path.join(
    projectRoot,
    'dist',
    getUnpackedDirectoryName(process.platform, process.arch)
  )

  if (process.platform !== 'darwin') {
    return path.join(unpackedDir, 'resources/providers/providers.json')
  }

  const appDirectories = (await readdir(unpackedDir, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.app'))

  if (appDirectories.length !== 1) {
    throw new Error(
      `Expected one macOS app bundle in ${unpackedDir}, found ${appDirectories.length}`
    )
  }

  return path.join(
    unpackedDir,
    appDirectories[0].name,
    'Contents/Resources/providers/providers.json'
  )
}

function parseProviderDefinitions(contents, label) {
  const definitions = JSON.parse(contents.toString('utf-8'))
  if (!Array.isArray(definitions)) {
    throw new Error(`${label} must contain a JSON array`)
  }

  const providerIds = new Set(definitions.map(definition => definition?.id))
  for (const requiredId of ['openai', 'anthropic']) {
    if (!providerIds.has(requiredId)) {
      throw new Error(`${label} is missing the required provider "${requiredId}"`)
    }
  }

  return definitions
}

async function main() {
  const packagedFile = await getPackagedProviderFile()
  const [sourceContents, packagedContents] = await Promise.all([
    readFile(sourceFile),
    readFile(packagedFile)
  ])

  const sourceDefinitions = parseProviderDefinitions(sourceContents, sourceFile)
  const packagedDefinitions = parseProviderDefinitions(packagedContents, packagedFile)

  if (!sourceContents.equals(packagedContents)) {
    throw new Error(`Packaged provider definitions differ from ${sourceFile}`)
  }

  console.log(
    `Packaged provider resources verified: ${path.relative(projectRoot, packagedFile)} ` +
    `(${packagedDefinitions.length}/${sourceDefinitions.length} definitions)`
  )
}

main().catch(error => {
  console.error(`[package-providers] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
