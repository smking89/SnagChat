// Builds every SnagChat brand asset from the supplied artwork in brand-source/.
// The source PNGs are 180px, too small to scale up, so they are vector-traced
// with potrace and everything is rendered from those paths.
//
//   node scripts/build-brand.mjs
//
// Outputs: app/icon.svg, app/favicon.ico, app/apple-icon.png,
//          public/icons/icon-{192,512}.png, icon-maskable-512.png,
//          public/brand/wordmark.svg

import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import potrace from 'potrace'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'brand-source')
const TMP = path.join(SRC, '.work')
const BLACK = '#000000'
const PURPLE = '#9D00FF'
const WHITE = '#FFFFFF'
const UPSCALE = 8 // 180px is traced at 1440px for smoother curve fitting

await fs.mkdir(TMP, { recursive: true })

/* ---------------------------------------------------------------- helpers */

const trace = (file, options = {}) =>
  new Promise((resolve, reject) => {
    potrace.trace(
      file,
      { threshold: 128, turdSize: 6, optCurve: true, optTolerance: 0.3, ...options },
      (err, svg) => (err ? reject(err) : resolve(svg)),
    )
  })

// potrace emits `<svg viewBox="0 0 W H"><g transform="translate(0,H) scale(.1,-.1)">paths</g></svg>`
function innerOf(svg) {
  const body = svg.slice(svg.indexOf('<svg'), svg.indexOf('</svg>') + 6)
  const open = body.slice(body.indexOf('<svg'), body.indexOf('>') + 1)
  const viewBox = /viewBox="([^"]+)"/.exec(open)?.[1]
  const width = Number(/width="([\d.]+)/.exec(open)?.[1])
  const height = Number(/height="([\d.]+)/.exec(open)?.[1])
  // potrace bakes fill="black" / stroke="none" onto each path, which would
  // override the colour applied by the wrapping group.
  const inner = body
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/\s*fill="(?:black|#000000|#000)"/g, '')
    .replace(/\s*stroke="none"/g, '')
  return { inner: inner.trim(), width: viewBox ? Number(viewBox.split(' ')[2]) : width, height: viewBox ? Number(viewBox.split(' ')[3]) : height }
}

// Place traced art (its own box is w x h) centred inside a square `box`.
function place(art, w, h, box, cx = 256, cy = 256) {
  const s = box / Math.max(w, h)
  const tx = cx - (w * s) / 2
  const ty = cy - (h * s) / 2
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})">${art}</g>`
}

// Flatten to white, upscale, then trim to the ink's bounding box so the art
// fills its own coordinate space exactly.
async function prepare(name) {
  const src = path.join(SRC, `${name}.png`)
  const meta = await sharp(src).metadata()
  const big = await sharp(src)
    .flatten({ background: WHITE })
    .resize(meta.width * UPSCALE, meta.height * UPSCALE, { kernel: 'lanczos3' })
    .grayscale()
    .png()
    .toBuffer()

  const { data, info } = await sharp(big).trim({ threshold: 40 }).toBuffer({ resolveWithObject: true })
  const out = path.join(TMP, `${name}-ink.png`)
  await fs.writeFile(out, data)
  return { file: out, width: info.width, height: info.height, gray: data }
}

// Solid silhouette for the tiny sizes, where the hollow line art turns to mush:
// a light blur merges the strokes into the body, then the enclosed middle is
// filled, keeping the gaps between the fingers as the only detail.
async function silhouette(file, width, height) {
  const blurred = path.join(TMP, 'fist-blur.png')
  await sharp(file).blur(width / 45).png().toFile(blurred)
  return interiors(blurred, width, height, { suffix: '-solid' })
}
// Enclosed region: everything the ink cuts off from the border.
async function interiors(file, width, height, { threshold = 128, suffix = '-fill' } = {}) {
  const { data } = await sharp(file).grayscale().raw().toBuffer({ resolveWithObject: true })
  const n = width * height
  const outside = new Uint8Array(n)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = y * width + x
    if (outside[i] || data[i] < threshold) return
    outside[i] = 1
    stack.push(i)
  }
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }
  while (stack.length) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }

  const rgba = Buffer.alloc(n * 4)
  let filled = 0
  for (let i = 0; i < n; i++) {
    const inside = !outside[i] && data[i] >= threshold ? 1 : 0
    if (inside) filled++
    const v = inside ? 0 : 255
    rgba[i * 4] = v
    rgba[i * 4 + 1] = v
    rgba[i * 4 + 2] = v
    rgba[i * 4 + 3] = 255
  }
  const out = file.replace(/-(ink|blur)\.png$/, `${suffix}.png`)
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(out)
  console.log(`  masked region: ${((filled / n) * 100).toFixed(1)}% of canvas (${path.basename(out)})`)
  return out
}

/* ------------------------------------------------------------------ trace */

console.log('Tracing the fist…')
const fist = await prepare('icon')
const fistPaths = innerOf(await trace(fist.file))
const fistSolidFile = await silhouette(fist.file, fist.width, fist.height)
const fistSolid = innerOf(await trace(fistSolidFile))
console.log(`  fist art ${fist.width}x${fist.height}, paths ${fistPaths.inner.length}b, solid ${fistSolid.inner.length}b`)

console.log('Tracing the wordmark…')
const mark = await prepare('wordmark')
const markPaths = innerOf(await trace(mark.file))
const markFillFile = await interiors(mark.file, mark.width, mark.height)
const markFill = innerOf(await trace(markFillFile))
console.log(`  wordmark art ${mark.width}x${mark.height}`)

/* ------------------------------------------------------------- app icons */

// Light identity, per brand: white fill, thick black outer stroke.
const INK = '#000000'
const PAPER = '#FFFFFF'

function tile({ art, w, h, box = 300, frame = 13, radius = 112, strokeWidth = 14 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${radius}" fill="${PAPER}"/>
  <rect x="19" y="19" width="474" height="474" rx="${radius - 14}" fill="none" stroke="${INK}" stroke-width="${frame}"/>
  <g fill="${PAPER}" stroke="${INK}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">${place(art, w, h, box)}</g>
</svg>
`
}

const iconSvg = tile({ art: fistPaths.inner, w: fistPaths.width, h: fistPaths.height })
await fs.writeFile(path.join(ROOT, 'app/icon.svg'), iconSvg)

// Maskable: full bleed white, no frame, art inside the centre safe zone.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${PAPER}"/>
  <g fill="${PAPER}" stroke="${INK}" stroke-width="14" stroke-linejoin="round" stroke-linecap="round">${place(fistPaths.inner, fistPaths.width, fistPaths.height, 250)}</g>
</svg>
`
await fs.writeFile(path.join(ROOT, 'public/icons/icon-maskable.svg'), maskableSvg)

// The mark on its own, for in-app use (profile, empty camera).
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fistPaths.width} ${fistPaths.height}" width="${fistPaths.width}" height="${fistPaths.height}" role="img" aria-label="SnagChat">
  <title>SnagChat</title>
  <g fill="${PAPER}" stroke="${INK}" stroke-width="22" stroke-linejoin="round" stroke-linecap="round">${fistPaths.inner}</g>
</svg>
`
await fs.writeFile(path.join(ROOT, 'public/brand/fist.svg'), markSvg)

// Next decodes these metadata images, and its pipeline only accepts RGBA PNGs —
// the tile paints its own background, so the alpha channel must be preserved.
const render = async (svg, size, out) => {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .ensureAlpha()
    .png()
    .toFile(path.join(ROOT, out))
  console.log(`  ${out} ${size}px`)
}

console.log('Rendering icon PNGs…')
await render(iconSvg, 180, 'app/apple-icon.png')
await render(iconSvg, 192, 'public/icons/icon-192.png')
await render(iconSvg, 512, 'public/icons/icon-512.png')
await render(maskableSvg, 512, 'public/icons/icon-maskable-512.png')

// Favicon: outline line work turns to mush below ~48px, so tab sizes carry the
// solid black silhouette of the fist instead.
console.log('Rendering favicon…')
const frames = []
for (const size of [16, 32, 48]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="${PAPER}"/>
  <rect x="26" y="26" width="460" height="460" rx="74" fill="none" stroke="${INK}" stroke-width="${size <= 16 ? 34 : 22}"/>
  <g fill="${INK}">${place(fistSolid.inner, fistSolid.width, fistSolid.height, 300)}</g>
</svg>
`
  frames.push({
    size,
    png: await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).ensureAlpha().png().toBuffer(),
  })
}

function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(({ size, png }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

await fs.writeFile(path.join(ROOT, 'app/favicon.ico'), ico(frames))
console.log(`  app/favicon.ico ${frames.map((f) => f.size).join('/')}px`)

/* -------------------------------------------------------------- wordmark */

// Black line work over white letter bodies: the supplied mark, on a light page.
const markBox = 268
const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${mark.width} ${mark.height}" width="${markBox}" height="${Math.round((markBox * mark.height) / mark.width)}" role="img" aria-label="SnagChat">
  <title>SnagChat</title>
  <g fill="${PAPER}">${markFill.inner}</g>
  <g fill="${INK}">${markPaths.inner}</g>
</svg>
`
await fs.writeFile(path.join(ROOT, 'public/brand/wordmark.svg'), wordmarkSvg)
console.log(`  public/brand/wordmark.svg ${mark.width}x${mark.height}`)
