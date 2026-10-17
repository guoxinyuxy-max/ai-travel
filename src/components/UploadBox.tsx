import { useRef } from 'react'
import { Camera, Image as ImageIcon, Lock } from 'lucide-react'
import type { PhotoInput } from '@/data/types'
import { fileToCompressedDataUrl } from '@/lib/image'

interface Props {
  photo: PhotoInput | null
  onPhoto: (p: PhotoInput) => void
}

/**
 * 环境照片上传区。
 * 「拍摄现场照片」使用 capture 属性在移动端直接调起相机；PC 端两者均打开文件选择。
 */
export function UploadBox({ photo, onPhoto }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File | undefined, source: PhotoInput['source']) => {
    if (!file) return
    const dataUrl = await fileToCompressedDataUrl(file)
    onPhoto({ dataUrl, source, name: file.name })
  }

  if (photo) {
    return (
      <div>
        <div className="relative overflow-hidden rounded-block">
          <img
            src={photo.dataUrl}
            alt="当前旅行环境照片"
            className="max-h-72 w-full object-cover"
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[13px] text-ink-500">
          <span>来源：{photo.source === 'camera' ? '现场拍摄' : '相册选择'}</span>
          <span>照片已添加</span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <button
            onClick={() => cameraRef.current?.click()}
            className="min-h-11 rounded-btn border border-ink-300 bg-white text-sm font-medium hover:bg-ink-100"
          >
            重新拍摄
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="min-h-11 rounded-btn border border-ink-300 bg-white text-sm font-medium hover:bg-ink-100"
          >
            更换照片
          </button>
        </div>
        <HiddenInputs cameraRef={cameraRef} galleryRef={galleryRef} onFile={handleFile} />
      </div>
    )
  }

  return (
    <div className="rounded-block border-[1.5px] border-dashed border-ink-300 bg-ink-100/60 p-4">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => cameraRef.current?.click()}
          className="min-h-20 rounded-btn bg-ink-150 py-3 transition-colors hover:bg-ink-200"
        >
          <Camera className="mx-auto size-6" />
          <b className="mt-1.5 block text-sm">拍摄现场照片</b>
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          className="min-h-20 rounded-btn bg-ink-150 py-3 transition-colors hover:bg-ink-200"
        >
          <ImageIcon className="mx-auto size-6" />
          <b className="mt-1.5 block text-sm">从相册选择</b>
        </button>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-500">
        尽量拍到完整景点主体和周围空间，便于 AI 判断站位和构图。
      </p>
      <p className="mt-1 flex items-start gap-1 text-[13px] text-ink-400">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        上传照片仅用于当前拍摄任务分析，请避免上传包含敏感个人信息的图片。
      </p>
      <HiddenInputs cameraRef={cameraRef} galleryRef={galleryRef} onFile={handleFile} />
    </div>
  )
}

function HiddenInputs({
  cameraRef,
  galleryRef,
  onFile,
}: {
  cameraRef: React.RefObject<HTMLInputElement | null>
  galleryRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File | undefined, s: PhotoInput['source']) => void
}) {
  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0], 'camera')
          e.target.value = ''
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0], 'gallery')
          e.target.value = ''
        }}
      />
    </>
  )
}
