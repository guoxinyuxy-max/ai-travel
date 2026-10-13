/** 图片处理：压缩 + dataURL 转换（降低上传体积，maxSize 1280px） */
export async function fileToCompressedDataUrl(
  file: File,
  maxSize = 1280,
  quality = 0.82,
): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
    // 老浏览器不支持该选项时退回默认调用
    createImageBitmap(file),
  )
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return canvas.toDataURL('image/jpeg', quality)
}

/** dataURL -> 纯 base64（供 AI 接口使用） */
export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}
