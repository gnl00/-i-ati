import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  if (aboveDistance <= upperLeftDistance) return above
  return upperLeft
}

function decodeRgbaPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  assert.ok(buffer.subarray(0, 8).equals(signature), 'asset must be a PNG file')

  let offset = 8
  let header
  const imageData = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += length + 12

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      }
    } else if (type === 'IDAT') {
      imageData.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  assert.ok(header, 'asset must contain an IHDR chunk')
  assert.deepEqual(
    {
      bitDepth: header.bitDepth,
      colorType: header.colorType,
      compression: header.compression,
      filter: header.filter,
      interlace: header.interlace
    },
    { bitDepth: 8, colorType: 6, compression: 0, filter: 0, interlace: 0 },
    'asset must be an 8-bit, non-interlaced RGBA PNG'
  )

  const bytesPerPixel = 4
  const rowLength = header.width * bytesPerPixel
  const filtered = inflateSync(Buffer.concat(imageData))
  assert.equal(filtered.length, header.height * (rowLength + 1))

  const pixels = Buffer.alloc(header.height * rowLength)
  let inputOffset = 0

  for (let y = 0; y < header.height; y += 1) {
    const filterType = filtered[inputOffset]
    inputOffset += 1
    const rowOffset = y * rowLength

    for (let x = 0; x < rowLength; x += 1) {
      const raw = filtered[inputOffset + x]
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0
      const above = y > 0 ? pixels[rowOffset - rowLength + x] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowOffset - rowLength + x - bytesPerPixel]
        : 0

      let value
      switch (filterType) {
        case 0:
          value = raw
          break
        case 1:
          value = raw + left
          break
        case 2:
          value = raw + above
          break
        case 3:
          value = raw + Math.floor((left + above) / 2)
          break
        case 4:
          value = raw + paethPredictor(left, above, upperLeft)
          break
        default:
          assert.fail(`unsupported PNG filter type: ${filterType}`)
      }

      pixels[rowOffset + x] = value & 0xff
    }

    inputOffset += rowLength
  }

  return { ...header, pixels }
}

function getAlphaBounds({ width, height, pixels }) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  assert.ok(maxX >= minX && maxY >= minY, 'asset must contain visible pixels')
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

test('macOS application icon matches the native visual footprint', async () => {
  const icon = decodeRgbaPng(await readFile(resolve(repoRoot, 'build/icon.png')))
  assert.deepEqual({ width: icon.width, height: icon.height }, { width: 1024, height: 1024 })

  const bounds = getAlphaBounds(icon)
  const longestSide = Math.max(bounds.width, bounds.height)
  assert.ok(
    longestSide >= 864 && longestSide <= 872,
    `alpha bounds longest side must be within 864..872 pixels; received ${bounds.width}x${bounds.height}`
  )

  const alphaAt = (x, y) => icon.pixels[(y * icon.width + x) * 4 + 3]
  for (let x = 0; x < icon.width; x += 1) {
    assert.equal(alphaAt(x, 0), 0, `top edge must be transparent at x=${x}`)
    assert.equal(alphaAt(x, icon.height - 1), 0, `bottom edge must be transparent at x=${x}`)
  }
  for (let y = 0; y < icon.height; y += 1) {
    assert.equal(alphaAt(0, y), 0, `left edge must be transparent at y=${y}`)
    assert.equal(alphaAt(icon.width - 1, y), 0, `right edge must be transparent at y=${y}`)
  }

  const canvasCenter = (icon.width - 1) / 2
  const horizontalBias = Math.abs((bounds.minX + bounds.maxX) / 2 - canvasCenter)
  const verticalBias = Math.abs((bounds.minY + bounds.maxY) / 2 - canvasCenter)
  assert.ok(horizontalBias <= 1, `alpha bounds horizontal center bias must be <= 1px; received ${horizontalBias}px`)
  assert.ok(verticalBias <= 1, `alpha bounds vertical center bias must be <= 1px; received ${verticalBias}px`)
})
