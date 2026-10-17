import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useDemoStore } from '@/data/store'
import type { AnalysisResult } from '@/data/types'

/**
 * 无法分析页 —— 承载三类「走不下去」的状态：
 * - needs_new_photo：照片本身不行（显示原因 + 补拍提示）
 * - bad_image：图片无法读取（提示重新上传）
 * - failed：服务失败（提供重试）
 */
export function ImageError() {
  const navigate = useNavigate()
  const result = useDemoStore((s) => s.result)

  useEffect(() => {
    if (!result) navigate('/task', { replace: true })
  }, [result, navigate])

  if (!result) return null

  const copy = errorCopy(result)
  const retryable = result.status === 'failed'

  return (
    <div>
      <h2 className="text-2xl font-bold">{copy.title}</h2>
      <div className="mt-4 rounded-card border border-danger-border bg-danger-soft p-4">
        <b className="block text-[15px]">{copy.headline}</b>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{copy.message}</p>
        {copy.hint && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
            补拍建议：{copy.hint}
          </p>
        )}
      </div>
      <div className="mt-5 space-y-2.5">
        {retryable ? (
          <>
            <Button onClick={() => navigate('/analysis')}>重试分析</Button>
            <Button variant="secondary" onClick={() => navigate('/task')}>
              更换照片
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => navigate('/task')}>重新拍摄</Button>
            <Button variant="secondary" onClick={() => navigate('/task')}>
              从相册选择
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function errorCopy(result: AnalysisResult): {
  title: string
  headline: string
  message: string
  hint?: string
} {
  if (result.status === 'bad_image') {
    return {
      title: '照片无法读取',
      headline: '图片文件不可用',
      message:
        result.reason === 'unsupported_format'
          ? '当前格式不受支持，请上传 JPG 或 PNG 格式的照片。'
          : result.reason === 'too_large'
            ? '照片文件过大，请压缩后重新上传。'
            : '这张照片可能已损坏，无法正常解码，请重新上传。',
    }
  }
  if (result.status === 'failed') {
    return {
      title: '分析服务暂时不可用',
      headline: '服务连接失败',
      message: '可能是网络波动或服务繁忙，稍后重试通常可以恢复。',
    }
  }
  // needs_new_photo：照片本身不行，给出原因与补拍建议
  return {
    title: '这张照片暂时无法分析',
    headline: '环境信息不足',
    message: result.message ?? '当前照片难以判断人物站位和构图空间。',
    hint: result.hint,
  }
}
