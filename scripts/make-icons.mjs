// Generates PWA PNG icons (teal rounded square + white paper plane)
// with a minimal pure-Node PNG encoder. Run once; PNGs are committed.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const inTriangle = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
  const t = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const u = (cx - bx) * (py - by) - (cy - by) * (px - bx)
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0)
}

function makeIcon(size) {
  const S = size / 512 // design space is 512
  const r = 112 * S
  const teal = [15, 118, 110]
  const white = [255, 255, 255]
  const mint = [204, 251, 241]
  const t1 = [
    [96 * S, 272 * S],
    [416 * S, 128 * S],
    [296 * S, 400 * S],
  ]
  const t1b = [
    [96 * S, 272 * S],
    [296 * S, 400 * S],
    [256 * S, 296 * S],
  ]
  const t2 = [
    [256 * S, 296 * S],
    [416 * S, 128 * S],
    [272 * S, 264 * S],
  ]

  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      // rounded-rect alpha
      const dx = Math.max(r - x, x - (size - 1 - r), 0)
      const dy = Math.max(r - y, y - (size - 1 - r), 0)
      const inside = dx * dx + dy * dy <= r * r
      let [cr, cg, cb, ca] = inside ? [...teal, 255] : [0, 0, 0, 0]
      if (inside) {
        const cx = x + 0.5
        const cy = y + 0.5
        if (inTriangle(cx, cy, ...t2)) [cr, cg, cb] = mint
        else if (inTriangle(cx, cy, ...t1) || inTriangle(cx, cy, ...t1b))
          [cr, cg, cb] = white
      }
      const o = y * (1 + size * 4) + 1 + x * 4
      raw[o] = cr
      raw[o + 1] = cg
      raw[o + 2] = cb
      raw[o + 3] = ca
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir =
  process.argv[2] ?? new URL('../public/icons', import.meta.url).pathname
mkdirSync(outDir, { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(`${outDir}/icon-${size}.png`, makeIcon(size))
  console.log(`icon-${size}.png written`)
}
