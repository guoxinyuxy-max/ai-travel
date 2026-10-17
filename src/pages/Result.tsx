import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Loader2, RotateCcw, Share2, TriangleAlert } from 'lucide-react'
import { AnnotatedPhoto, type HighlightPart } from '@/components/AnnotatedPhoto'
import { BottomBar } from '@/components/layout/Layout'
import { FeedbackBox } from '@/components/Feedback'
import { Button } from '@/components/ui/Button'
import { track } from '@/data/analytics'
import { useDemoStore } from '@/data/store'
import { generateShareCardBlob, shareOrDownload } from '@/lib/shareCard'
import { DIRECTION_LABELS, type DirectionId, type Mode } from '@/data/types'
import { cn } from '@/lib/cn'

const DIRECTIONS = Object.entries(DIRECTION_LABELS) as [DirectionId, string][]

/** 建议分段（与标注部件联动） */
type Segment = { key: string; label: string; text: string; part: HighlightPart }

/**
 * 结果页（APP 规格）—— 承载三种形态：
 * - ready：正常方案（站位框 + 四段建议）
 * - limited_uncertain：保守方案（黄色提示条 + 虚线弱化站位框）
 * - limited_safety：风险场景（无站位 + 红色安全卡；二次确认后显示红色虚线参考框）
 *
 * 布局：标注图吸顶 + 建议分段切换（点分段联动高亮图中标注，无需上下滚动对照）；
 * 主操作固定贴底；「换个方向」收纳为展开区。
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

  // 建议分段 ↔ 标注联动
  const [activeSeg, setActiveSeg] = useState(0)

  // 换方向展开区
  const [dirOpen, setDirOpen] = useState(false)

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
    setActiveSeg(0)
    setDirOpen(false)
    setTip(null)
  }, [result?.status, taskId])

  if (!renderable || !photo || !result?.advice) return null

  const isSelfie = mode === 'selfie'
  const shootingTag = isSelfie ? '拍摄者提示' : '拍摄者提示'

  const segments: Segment[] = [
    { key: 'position', label: '人物站位', text: result.advice.position, part: 'zone' },
    { key: 'composition', label: '构图', text: result.advice.composition, part: 'lines' },
    { key: 'pose', label: '动作', text: result.advice.pose, part: null },
    { key: 'shooting', label: shootingTag, text: result.advice.shooting, part: 'direction' },
  ]
  const current = segments[activeSeg] ?? segments[0]

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

  /** 再来一张：保留拍摄方式，换环境照片（快速连拍的闭环） */
  const retake = () => {
    track('photo_changed', { mode: mode ?? undefined, meta: { from: 'result' } })
    useDemoStore.getState().clearPhoto()
    navigate('/task')
  }

  /** 调整方式：保留照片，重选谁来拍 */
  const editMode = () => {
    track('conditions_edit', { mode: mode ?? undefined })
    useDemoStore.getState().resetFlow()
    navigate('/task')
  }

  // 底部固定操作栏内容（按状态给出主操作）
  const bottomBar = isSafety ? (
    confirmed ? (
      <Button variant="secondary" onClick={retake}>
        更换环境照片
      </Button>
    ) : confirming ? (
      <div className="grid grid-cols-2 gap-2.5">
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
    ) : result.hazard ? (
      // 车道有车 / 悬崖 / 水边这类场景：不提供参考站位，直接引导换位置
      <Button onClick={editMode}>换一个拍摄位置</Button>
    ) : (
      <div className="grid grid-cols-2 gap-2.5">
        <Button onClick={() => setConfirming(true)}>仍要生成参考站位</Button>
        <Button variant="secondary" onClick={retake}>
          更换环境照片
        </Button>
      </div>
    )
  ) : (
    <>
      <Button onClick={() => void handleShare()} disabled={sharing}>
        {sharing ? (
          <>
            <Loader2 className="mr-1.5 inline size-4 animate-spin" />
            生成中…
          </>
        ) : (
          <>
            <Share2 className="mr-1.5 inline size-4" />
            分享给拍摄者
          </>
        )}
      </Button>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          onClick={retake}
          className="min-h-11 rounded-btn bg-ink-150 text-sm font-medium transition hover:bg-ink-200"
        >
          再来一张
        </button>
        <button
          onClick={editMode}
          className="min-h-11 rounded-btn bg-ink-150 text-sm font-medium transition hover:bg-ink-200"
        >
          调整拍摄方式
        </button>
      </div>
    </>
  )

  return (
    <div className="pb-44">
      {/* 标注图 + 分段切换（吸顶，滚动时保持对照） */}
      {!isSafety && (
        <div className="sticky top-14 z-10 -mx-5 bg-page px-5 pt-1 pb-3">
          <AnnotatedPhoto
            src={photo.dataUrl}
            zone={result.zone}
            direction={result.direction}
            variant={result.status === 'limited_uncertain' ? 'uncertain' : 'normal'}
            highlight={current.part}
          />
          {/* 建议分段切换 */}
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-btn bg-ink-100 p-1">
            {segments.map((seg, i) => (
              <button
                key={seg.key}
                onClick={() => setActiveSeg(i)}
                className={cn(
                  'min-h-9 rounded-[11px] text-[13px] transition',
                  i === activeSeg ? 'bg-white font-semibold shadow-sm' : 'text-ink-500',
                )}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 安全场景：保持常规上下布局（无分段联动） */}
      {isSafety && (
        <div>
          <h2 className="text-2xl font-bold">
            {result.hazard ? '不建议在此拍照' : '场景需要注意安全'}
          </h2>
          {result.modeText && <p className="mt-1 text-[13px] text-ink-400">{result.modeText}</p>}
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
          <div className="mt-4">
            <AnnotatedPhoto
              src={photo.dataUrl}
              zone={confirmed ? result.zone : undefined}
              variant="danger"
              showLegend={false}
            />
            {confirmed && (
              <p className="mt-2 text-xs text-danger-text">
                ⚠ 参考站位未验证安全，仅供构图参考，请以现场观察为准。
              </p>
            )}
          </div>
        </div>
      )}

      {/* 当前分段建议（普通/保守方案） */}
      {!isSafety && (
        <div className="rounded-card bg-ink-100 p-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-200 px-2.5 py-1 text-xs">
            {current.label}
          </span>
          <p className="mt-2 text-sm leading-relaxed">{current.text}</p>
          {current.part && (
            <p className="mt-1.5 text-xs text-ink-400">图中对应标注已高亮。</p>
          )}
        </div>
      )}

      {/* 提示条（保守方案） */}
      {!isSafety && result.status === 'limited_uncertain' && (
        <NoticeBar
          text={
            result.message ??
            '当前光线或遮挡可能影响判断，以下建议仅供参考，建议现场确认后调整。'
          }
        />
      )}
      {!isSafety && (result.notices ?? []).map((n) => <NoticeBar key={n} text={n} />)}

      {/* 站位可达性快捷反馈 */}
      {!isSafety && result.zone && (
        <div className="mt-3">
          <ZoneReachFeedback status={result.status} mode={mode ?? 'companion'} />
        </div>
      )}

      {/* 保守方案的重新分析 */}
      {!isSafety && result.status === 'limited_uncertain' && (
        <button
          onClick={() => navigate('/analysis')}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-ink-500 underline underline-offset-2"
        >
          <RotateCcw className="size-3.5" />
          重新分析这张照片
        </button>
      )}

      {/* 换个方向重新生成（R7）：收纳为展开区；limited_safety 场景不提供 */}
      {!isSafety && (
        <div className="mt-5 rounded-card border border-ink-200">
          <button
            onClick={() => setDirOpen((v) => !v)}
            className="flex min-h-12 w-full items-center justify-between px-4 text-left"
          >
            <span>
              <b className="text-sm">不满意？换个方向试试</b>
              <small className="block text-xs text-ink-400">
                保持环境分析，按新方向重新生成，无需重新上传照片
              </small>
            </span>
            <ChevronDown
              className={cn('size-4 shrink-0 text-ink-400 transition-transform', dirOpen && 'rotate-180')}
            />
          </button>
          {dirOpen && (
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
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
          )}
        </div>
      )}

      <p className="mt-3 px-0.5 text-xs text-ink-400">
        {result.source === 'ai'
          ? '本次建议由 AI 结合照片内容与摄影规则生成，仅供参考。'
          : '本次建议由内置摄影规则引擎结合照片特征生成，仅供参考。'}
      </p>

      {tip && <p className="mt-2.5 text-[13px] text-ink-500">{tip}</p>}

      {!isSafety && mode && <FeedbackBox taskId={taskId ?? 'saved'} mode={mode} />}

      {/* 主操作固定贴底 */}
      <BottomBar>{bottomBar}</BottomBar>
    </div>
  )
}

function NoticeBar({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-card border border-amber-300 bg-amber-50 px-3.5 py-3 text-[13px] leading-relaxed text-amber-900">
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
      <p className="text-xs text-ink-400">
        已记录，感谢反馈。
        {vote === 'no' && '可展开「换个方向试试」重新生成，或更换环境照片。'}
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card bg-ink-100 px-3.5 py-2.5 text-[13px]">
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
