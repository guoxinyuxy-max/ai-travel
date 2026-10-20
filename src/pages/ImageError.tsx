import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { track, blockCategoryOf, type BlockCategory } from '@/data/analytics'
import { useDemoStore } from '@/data/store'
import type { AnalysisResult } from '@/data/types'

/**
 * 无法分析页 —— 承载三类「走不下去」的状态：
 * - needs_new_photo：照片本身不行（按原因分成三类，给不同的补拍指引）
 * - bad_image：图片无法读取
 * - failed：服务失败（提供重试）
 *
 * v1.6 起：拦截不再只给一句"重拍"，而是按「画面质量 / 环境信息 / 视角机位」
 * 三类给出可执行的补拍步骤，并让用户当场判一次"这张其实能拍吗"，
 * 用于统计误拦比例（不含照片本身，隐私安全）。
 */

interface BlockCopy {
  title: string
  headline: string
  message: string
  /** 「这样拍，AI 就能分析了」的分步指引 */
  tips: string[]
}

const CATEGORY_COPY: Record<BlockCategory, BlockCopy> = {
  photo_quality: {
    title: '这张照片看不清环境',
    headline: '画面信息不足，AI 判断不了空间关系',
    message: '模糊或压缩过度的照片，AI 看不清地面、边界和远近关系，硬给建议反而容易误导。',
    tips: [
      '在光线稳定的地方，双手持稳手机，等取景框里画面清晰再按快门',
      '把手机靠在栏杆或墙上，避免边走边随手拍',
      '尽量用相册里的原图，不要上传截图或多次转发过的图',
    ],
  },
  environment: {
    title: '照片里缺少环境信息',
    headline: 'AI 需要看到「能站人的地方」',
    message: '只拍人、只拍特写或拍了与旅行无关的物体时，AI 找不到可以安放人物的空间。',
    tips: [
      '后退 2–3 步，让人物和身后的景点同时进入画面',
      '把脚下的地面、步道或广场一起拍进去，哪怕只露出一点',
      '拍你即将取景的那个方向，而不是回身拍别处',
    ],
  },
  viewpoint: {
    title: '这个角度，人物走不进画面',
    headline: '照片是从高处或隔着障碍物拍的',
    message:
      '从阳台、观景台、楼上或隔着栏杆玻璃俯拍远处地面时，画面里虽然看得到地面，但人物没法走进去站在那儿。',
    tips: [
      '换成地面平视的机位：拍摄者和被拍的人站在同一层',
      '如果人在阳台或观景台上，把人物和脚下的平台一起拍进来',
      '不要隔着玻璃、栏杆或水面去拍对面的地面',
    ],
  },
  file: {
    title: '照片无法读取',
    headline: '图片文件不可用',
    message: '文件格式或编码有问题，浏览器没能解码成功。',
    tips: [
      '重新从相册选一张 JPG 或 PNG 照片',
      '如果是截图或特殊格式，先用相册「编辑 → 另存」转换一次',
      '照片体积过大时，先用系统相册导出一次再上传',
    ],
  },
  service: {
    title: '分析服务暂时不可用',
    headline: '这次不是照片的问题',
    message: '网络波动或模型服务繁忙，照片本身大概率是可以分析的，重试通常就能恢复。',
    tips: [
      '确认网络正常后点「重试分析」，照片和拍摄方式都还在，不用重新选',
      '连续两次失败的话，可以先换一张照片试试，排除单张图片的问题',
    ],
  },
}

export function ImageError() {
  const navigate = useNavigate()
  const result = useDemoStore((s) => s.result)
  const photo = useDemoStore((s) => s.photo)

  useEffect(() => {
    if (!result) navigate('/task', { replace: true })
  }, [result, navigate])

  if (!result) return null

  const category = resolveCategory(result)
  const copy = CATEGORY_COPY[category]
  const retryable = result.status === 'failed'
  const message = result.status === 'needs_new_photo' ? (result.message ?? copy.message) : copy.message

  return (
    <div className="pb-6">
      <h2 className="text-2xl font-bold">{copy.title}</h2>

      {/* 把用户刚上传的照片一并显示出来：让"这张为什么不行"有具体所指 */}
      {photo && (
        <div className="mt-4">
          <div className="relative overflow-hidden rounded-block bg-ink-100">
            <img
              src={photo.dataUrl}
              alt="本次提交的照片"
              className="max-h-[42vh] w-full object-contain"
            />
            <span className="absolute top-2.5 left-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
              你上传的照片
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-card border border-danger-border bg-danger-soft p-4">
        <b className="block text-[15px]">{copy.headline}</b>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{message}</p>
        {result.status === 'needs_new_photo' && result.hint && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">提示：{result.hint}</p>
        )}
      </div>

      {/* 分步补拍指引：不再只丢一句"重拍吧" */}
      <div className="mt-4 rounded-card bg-ink-100 p-4">
        <b className="text-sm">{retryable ? '可以这样恢复' : '这样拍，AI 就能分析了'}</b>
        <ol className="mt-2 space-y-1.5">
          {copy.tips.map((tip, i) => (
            <li key={tip} className="flex gap-2 text-[13px] leading-relaxed text-ink-700">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-medium text-ink-500">
                {i + 1}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 误拦样本回流：只收"判断"这一条，不收集照片本身 */}
      {result.status === 'needs_new_photo' && (
        <BlockFeedback category={category} result={result} />
      )}

      <div className="mt-5 space-y-2.5">
        {retryable ? (
          <>
            <Button onClick={() => navigate('/analysis', { replace: true })}>重试分析</Button>
            <Button variant="secondary" onClick={() => navigate('/task')}>
              更换照片
            </Button>
          </>
        ) : (
          <>
            {/* 两个按钮分别直达相机/相册，不再是同一个去处 */}
            <Button onClick={() => navigate('/task', { state: { open: 'camera' } })}>
              重新拍摄
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate('/task', { state: { open: 'gallery' } })}
            >
              从相册选择
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** 归类：先看 status，再看 reason（口径与埋点共用 blockCategoryOf，避免两处漂移） */
function resolveCategory(result: AnalysisResult): BlockCategory {
  return blockCategoryOf(result.status, result.reason)
}

/**
 * 「这张其实能拍吗」——一次点击就能判断误拦。
 * 只上报判断与原因枚举，不上报照片、位置或任何可识别信息。
 */
function BlockFeedback({ category, result }: { category: BlockCategory; result: AnalysisResult }) {
  const [vote, setVote] = useState<null | 'should_work' | 'agree'>(null)

  const voteOn = (v: 'should_work' | 'agree') => {
    setVote(v)
    track('block_feedback', {
      mode: useDemoStore.getState().mode ?? undefined,
      source: result.source,
      meta: { vote: v, reason: result.reason, category },
    })
  }

  if (vote) {
    return (
      <p className="mt-3 rounded-card bg-ink-100 px-3.5 py-3 text-xs leading-relaxed text-ink-500">
        已记录，谢谢。
        {vote === 'should_work'
          ? '这张会进入误判复核池，我们会优先检查这一类判断。'
          : '我们会继续保持这类照片的拦截。'}
      </p>
    )
  }

  return (
    <div className="mt-3 rounded-card bg-ink-100 px-3.5 py-3">
      <p className="text-[13px] text-ink-700">你觉得这张照片其实能分析吗？</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => voteOn('should_work')}
          className="min-h-9 rounded-full bg-white px-3 py-1.5 text-xs text-ink-700 ring-1 ring-ink-200 transition hover:ring-primary"
        >
          其实能拍，是误判
        </button>
        <button
          onClick={() => voteOn('agree')}
          className="min-h-9 rounded-full bg-white px-3 py-1.5 text-xs text-ink-700 ring-1 ring-ink-200 transition hover:ring-ink-300"
        >
          确实分析不了
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        只记录你的判断，不会上传或保存这张照片。
      </p>
    </div>
  )
}
