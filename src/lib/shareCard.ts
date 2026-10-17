import type { AnalysisResult, Mode } from '@/data/types'

/**
 * 分享卡片图合成（R9）：
 * 把「标注图 + 拍摄模式 + 四条建议」画到一张 canvas 上导出 PNG，
 * 供用户保存到相册或通过系统分享面板发给同行拍摄者。
 */

const W = 1080
const PAD = 56
const HEADER_H = 150
const FOOTER_H = 96

interface AdviceItem {
  tag: string
  text: string
}

export async function generateShareCardBlob(
  photoDataUrl: string,
  result: AnalysisResult,
  mode: Mode,
): Promise<Blob> {
  const img = await load(photoDataUrl)

  // 图片按卡片宽度铺满
  const imgW = W - PAD * 2
  const imgH = Math.round((img.naturalHeight / img.naturalWidth) * imgW)

  // 建议文本换行预计算 → 得到文本区总高
  const advices = collectAdvices(result)
  const textBlocks = advices.map((a) => ({ ...a, lines: wrap(a.text, 620) }))
  const adviceBlockH = textBlocks.reduce((h, b) => h + 44 + b.lines.length * 40 + 26, 0)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = HEADER_H + imgH + 60 + adviceBlockH + FOOTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')

  // 背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 头部
  ctx.fillStyle = '#171717'
  ctx.font = '600 44px -apple-system, "PingFang SC", sans-serif'
  ctx.fillText(isSafety(result) ? '场景需要注意安全' : '推荐拍摄方案', PAD, 76)
  ctx.font = '28px -apple-system, "PingFang SC", sans-serif'
  ctx.fillStyle = '#8a8a8a'
  ctx.fillText(
    result.modeText ?? (mode === 'selfie' ? '自拍模式' : '同伴拍摄模式'),
    PAD,
    122,
  )

  // 标注图
  const imgY = HEADER_H
  ctx.drawImage(img, PAD, imgY, imgW, imgH)

  // 三分参考线
  ctx.strokeStyle = 'rgba(255,255,255,.7)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 10])
  for (const fx of [1 / 3, 2 / 3]) {
    ctx.beginPath()
    ctx.moveTo(PAD + imgW * fx, imgY + imgH * 0.08)
    ctx.lineTo(PAD + imgW * fx, imgY + imgH * 0.92)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // 站位框
  if (result.zone) {
    const z = result.zone
    ctx.fillStyle = 'rgba(255,255,255,.18)'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 5
    roundRect(
      ctx,
      PAD + (imgW * z.x) / 100,
      imgY + (imgH * z.y) / 100,
      (imgW * z.w) / 100,
      (imgH * z.h) / 100,
      18,
    )
    ctx.fill()
    ctx.stroke()
  }

  // 建议区
  let ty = imgY + imgH + 60
  for (const b of textBlocks) {
    // 标签胶囊
    ctx.font = '500 26px -apple-system, "PingFang SC", sans-serif'
    const tw = ctx.measureText(b.tag).width
    ctx.fillStyle = '#f1f1f3'
    roundRect(ctx, PAD, ty - 32, tw + 36, 44, 22)
    ctx.fill()
    ctx.fillStyle = '#444444'
    ctx.fillText(b.tag, PAD + 18, ty)

    // 正文
    ctx.font = '30px -apple-system, "PingFang SC", sans-serif'
    ctx.fillStyle = '#171717'
    let ly = ty + 46
    for (const line of b.lines) {
      ctx.fillText(line, PAD, ly)
      ly += 40
    }
    ty = ly + 10
  }

  // 底部
  ctx.font = '24px -apple-system, "PingFang SC", sans-serif'
  ctx.fillStyle = '#b1b1b4'
  ctx.fillText('由 AI 旅行拍照助手生成 · 建议仅供参考，站位前请确认脚下环境', PAD, canvas.height - 40)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('导出失败'))), 'image/png')
  })
}

export async function shareOrDownload(blob: Blob): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], 'ai-travel-photo-plan.png', { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean
    share?: (d: { files: File[]; title?: string }) => Promise<void>
  }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: 'AI 拍摄方案' })
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}

// ---------------------------------------------------------------- helpers

function isSafety(r: AnalysisResult): boolean {
  return r.status === 'limited_safety'
}

function collectAdvices(r: AnalysisResult): AdviceItem[] {
  if (!r.advice) return []
  return [
    { tag: '人物站位', text: r.advice.position },
    { tag: '构图建议', text: r.advice.composition },
    { tag: '动作建议', text: r.advice.pose },
    { tag: '拍摄建议', text: r.advice.shooting },
  ]
}

/** 按像素宽度折行（中文场景按字符宽度近似处理） */
function wrap(text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctxMeasure(line + ch) > maxWidth) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

let measureCtx: CanvasRenderingContext2D | null = null
function ctxMeasure(text: string): number {
  if (!measureCtx) {
    const c = document.createElement('canvas')
    measureCtx = c.getContext('2d')
  }
  if (!measureCtx) return text.length * 30
  measureCtx.font = '30px -apple-system, "PingFang SC", sans-serif'
  return measureCtx.measureText(text).width
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}
