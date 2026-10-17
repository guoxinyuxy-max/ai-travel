import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Loader2, Share2, TriangleAlert } from 'lucide-react'
import { AnnotatedPhoto, type HighlightPart } from '@/components/AnnotatedPhoto'
import { FeedbackBox } from '@/components/Feedback'
import { Button } from '@/components/ui/Button'
import { track } from '@/data/analytics'
import { useDemoStore } from '@/data/store'
import { generateShareCardBlob, shareOrDownload } from '@/lib/shareCard'
import { DIRECTION_LABELS, type DirectionId, type Mode } from '@/data/types'
import { cn } from '@/lib/cn'

const DIRECTIONS = Object.entries(DIRECTION_LABELS) as [DirectionId, string][]

/**
 * 结果页 —— 承载三种形态：
 * - ready：正常方案（站位框 + 四张建议卡）
 * - limited_uncertain：保守方案（黄色提示条 + 虚线弱化站位框）
 * - limited_safety：风险场景（无站位 + 红色安全卡；二次确认后显示红色虚线参考框）
 */
export function Result() {
  const navigate = useNavigate()
  const photo = useDemoStore((s) => s.photo)
  const mode = useDemoStore((s) => s.mode)
  const result = useDemoStore((s) => s.result)
  const taskId = useDemoStore((s) => s.taskId)

  const renderable = Boolean(
    photo &&
      mode &&
      result &&
      (result.status === 'ready' ||
        result.status === 'limited_uncertain' ||
        result.status === 'limited_safety'),
  )

  // limited_safety 的「仍要生成参考站位」二次确认状态（仅页面内，不进全局 store）
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const isSafety = result?.status === 'limited_safety'

  // 建议卡片 ↔ 标注联动：当前高亮的标注部件
  const [highlight, setHighlight] = useState<HighlightPart>(null)

  // 分享状态
  const [tip, setTip] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!renderable) navigate('/task', { replace: true })
  }, [renderable, navigate])

  useEffect(() => {
    if (renderable) track('view_result', { meta: { status: result?.status } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setConfirming(false)
    setConfirmed(false)
    setHighlight(null)
    setTip(null)
  }, [result?.status, taskId])

  if (!renderable || !photo || !result?.advice) return null

  const isSelfie = mode === 'selfie'
  const shootingTag = isSelfie ? '自拍提示' : '拍摄者提示'

  const cards: { tag: string; text: string; part: HighlightPart }[] = [
    { tag: '人物站位', text: result.advice.position, part: 'zone' },
    { tag: '构图建议', text: result.advice.composition, part: 'lines' },
    { tag: '动作建议', text: result.advice.pose, part: null },
    { tag: shootingTag, text: result.advice.shooting, part: 'direction' },
  ]

  const handleShare = async () => {
    if (!photo || !result || !mode || sharing) return
    setSharing(true)
    setTip(null)
    try {
      const blob = await generateShareCardBlob(photo.dataUrl, result, mode)
      const how = await shareOrDownload(blob)
      setTip(how === 'shared' ? '分享卡片已生成' : '分享卡片已保存到下载')
      track('plan_shared', { mode })
    } catch {
      setTip('卡片生成失败，请重试')
    } finally {
      setSharing(false)
    }
  }

  const handleDirection = (d: DirectionId) => {
    track('regenerate', { mode: mode ?? undefined, meta: { direction: d } })
    useDemoStore.getState().setDirection(d)
    navigate('/analysis')
  }

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <div>
        <h2 className="text-2xl font-bold">
          {isSafety ? (result.hazard ? '不建议在此拍照' : '场景需要注意安全') : '推荐拍摄方案'}
        </h2>
        <p className="mt-1 text-[13px] text-ink-400">
          {result.modeText}
          {result.planDirection && (
            <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500">
              方向：{DIRECTION_LABELS[result.planDirection]}
            </span>
          )}
        </p>

        {result.status === 'limited_uncertain' && (
          <NoticeBar
            text={
              result.message ??
              '当前光线或遮挡可能影响判断，以下建议仅供参考，建议现场确认后调整。'
            }
          />
        )}
        {!isSafety &&
          (result.notices ?? []).map((n) => <NoticeBar key={n} text={n} />)}
        {isSafety && (
          <div className="mt-4 rounded-card border border-danger-border bg-danger-soft p-4">
            <b className="flex items-center gap-1.5 text-[15px] text-danger-text">
              <TriangleAlert className="size-4" />
              安全提示
            </b>
            {result.message && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{result.message}</p>
            )}
            <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-ink-700">
              {(result.notices ?? ['请遵守现场安全标识，选择稳固、开阔的位置拍摄。']).map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <AnnotatedPhoto
            src={photo.dataUrl}
            zone={isSafety ? (confirmed ? result.zone : undefined) : result.zone}
            direction={isSafety && !confirmed ? undefined : result.direction}
            variant={isSafety ? 'danger' : result.status === 'limited_uncertain' ? 'uncertain' : 'normal'}
            highlight={highlight}
          />
          {isSafety && confirmed && (
            <p className="mt-2 text-xs text-danger-text">⚠ 参考站位未验证安全，仅供构图参考，请以现场观察为准。</p>
          )}
          {!isSafety && result.zone && (
            <ZoneReachFeedback status={result.status} mode={mode ?? 'companion'} />
          )}
        </div>
      </div>

      <div className="mt-6 lg:mt-0">
        {cards.map((c) => {
          const clickable = c.part !== null && !isSafety
          const active = c.part !== null && highlight === c.part
          return (
            <div
              key={c.tag}
              onClick={clickable ? () => setHighlight(active ? null : c.part) : undefined}
              className={cn(
                'mt-3 rounded-card bg-ink-100 p-4 transition-colors first:mt-0',
                clickable && 'cursor-pointer hover:bg-ink-150',
                active && 'bg-white ring-2 ring-primary',
              )}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-200 px-2.5 py-1 text-xs">
                {c.tag}
                {clickable && (
                  <Eye className={cn('size-3', active ? 'text-primary' : 'text-ink-400')} />
                )}
              </span>
              <p className="mt-2 text-sm leading-relaxed">{c.text}</p>
              {clickable && (
                <p className="mt-1.5 text-xs text-ink-400">
                  {active ? '已高亮图中对应标注，再点一下取消' : '点击可在图上高亮对应标注'}
                </p>
              )}
            </div>
          )
        })}

        <p className="mt-3 px-0.5 text-xs text-ink-400">
          {result.source === 'ai'
            ? '本次建议由 AI 结合照片内容与摄影规则生成，仅供参考。'
            : '本次建议由内置摄影规则引擎结合照片特征生成，仅供参考。'}
        </p>

        {/* 换个方向重新生成（R7）：limited_safety 场景不提供 */}
        {!isSafety && (
          <div className="mt-5 rounded-card border border-ink-200 p-4">
            <b className="text-sm">不满意？换个方向试试</b>
            <p className="mt-1 text-xs text-ink-400">保持当前环境分析，按新方向重新生成建议，无需重新上传照片。</p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {DIRECTIONS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => handleDirection(id)}
                  className={cn(
                    'min-h-11 rounded-xl bg-ink-150 px-1 text-[13px] transition',
                    result.planDirection === id
                      ? 'font-medium ring-2 ring-primary bg-white'
                      : 'hover:bg-ink-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          {isSafety ? (
            confirmed ? (
              <Button variant="secondary" onClick={() => navigate('/task')}>
                更换环境照片
              </Button>
            ) : confirming ? (
              <>
                <div className="rounded-card border border-danger-border bg-danger-soft p-4">
                  <p className="text-sm leading-relaxed text-ink-700">
                    参考站位未经过安全验证，生成后请勿直接按图站位，务必先确认脚下环境稳固。
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <Button
                      onClick={() => {
                        setConfirmed(true)
                        setConfirming(false)
                        track('safety_confirmed', { mode: mode ?? undefined })
                      }}
                    >
                      我已了解，生成参考站位
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirming(false)}>
                      取消
                    </Button>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => navigate('/task')}>
                  更换环境照片
                </Button>
              </>
            ) : result.hazard ? (
              // 车道有车 / 悬崖 / 水边这类场景：不提供参考站位，直接引导换位置
              <Button onClick={() => navigate('/task')}>换一个拍摄位置</Button>
            ) : (
              <>
                <Button onClick={() => setConfirming(true)}>仍要生成参考站位</Button>
                <Button variant="secondary" onClick={() => navigate('/task')}>
                  更换环境照片
                </Button>
              </>
            )
          ) : (
            <>
              {result.status === 'limited_uncertain' && (
                <Button
                  onClick={() => {
                    navigate('/analysis')
                  }}
                >
                  重新分析
                </Button>
              )}
              <Button variant="ghost" onClick={() => void handleShare()} disabled={sharing}>
                {sharing ? (
                  <>
                    <Loader2 className="mr-1.5 inline size-4 animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Share2 className="mr-1.5 inline size-4" />
                    分享卡片
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  track('conditions_edit', { mode: mode ?? undefined })
                  useDemoStore.getState().resetFlow()
                  navigate('/task')
                }}
              >
                修改拍摄条件
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  track('photo_changed', { mode: mode ?? undefined })
                  useDemoStore.getState().clearPhoto()
                  navigate('/task')
                }}
              >
                更换环境照片
              </Button>
            </>
          )}
        </div>

        {tip && <p className="mt-2.5 text-[13px] text-ink-500">{tip}</p>}

        {!isSafety && mode && <FeedbackBox taskId={taskId ?? 'saved'} mode={mode} />}
      </div>
    </div>
  )
}

function NoticeBar({ text }: { text: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-card border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-900">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <span>{text}</span>
    </div>
  )
}

/**
 * 站位可达性快捷反馈（现场人最有发言权）：
 * 「到不了」代表 AI 画了人物实际走不到的站位框（俯拍越景等误判），
 * 计入 zone_feedback 事件用于看板监控误判率。
 */
function ZoneReachFeedback({ status, mode }: { status: string; mode: Mode }) {
  const [vote, setVote] = useState<null | 'ok' | 'no'>(null)

  const voteOn = (v: 'ok' | 'no') => {
    setVote(v)
    track('zone_feedback', { mode, meta: { vote: v, resultStatus: status } })
  }

  if (vote) {
    return (
      <p className="mt-2 text-xs text-ink-400">
        已记录，感谢反馈。
        {vote === 'no' && '可点击下方「换个方向试试」重新生成，或更换环境照片。'}
      </p>
    )
  }
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-card bg-ink-100 px-3.5 py-2.5 text-[13px]">
      <span className="text-ink-500">图中的站位位置，现场能实际走到吗？</span>
      <span className="ml-auto flex gap-1.5">
        <button
          onClick={() => voteOn('ok')}
          className="min-h-8 rounded-full bg-white px-3 py-1 text-xs text-ink-700 ring-1 ring-ink-200 transition hover:ring-primary"
        >
          能走到
        </button>
        <button
          onClick={() => voteOn('no')}
          className="min-h-8 rounded-full bg-white px-3 py-1 text-xs text-ink-700 ring-1 ring-ink-200 transition hover:ring-danger-text"
        >
          到不了
        </button>
      </span>
    </div>
  )
}
