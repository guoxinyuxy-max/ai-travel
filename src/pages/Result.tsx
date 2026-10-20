import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Loader2, RotateCcw, Share2, TriangleAlert } from 'lucide-react'
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

/** 建议卡片：全部平铺展示；part 非空的卡片可点击，联动高亮图中标注 */
type AdviceCard = { tag: string; text: string; part: HighlightPart }

/**
 * 结果页 —— 承载三种形态：
 * - ready：正常方案（标注图 + 四条建议全部平铺）
 * - limited_uncertain：保守方案（黄色提示条 + 虚线弱化站位框）
 * - limited_safety：风险场景（无站位 + 红色安全卡；二次确认后显示红色虚线参考框）
 *
 * 交互：点「人物站位 / 构图」建议卡，在图上高亮对应标注，再点取消；
 * 动作与拍摄建议只以文字呈现，不在图上标注。
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
    if (!renderable) return
    track('view_result', { meta: { status: result?.status } })
    // 风险场景（车道/悬崖/水边/人群）出现的频次，用于评估安全拦截覆盖
    if (result?.hazard && result.hazard !== 'none') {
      track('hazard_shown', {
        mode: mode ?? undefined,
        meta: { hazard: result.hazard, status: result.status },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setConfirming(false)
    setConfirmed(false)
    setHighlight(null)
    setTip(null)
  }, [result?.status, taskId])

  if (!renderable || !photo || !result?.advice) return null

  const cards: AdviceCard[] = [
    { tag: '人物站位', text: result.advice.position, part: 'zone' },
    { tag: '构图建议', text: result.advice.composition, part: 'lines' },
    { tag: '动作建议', text: result.advice.pose, part: null },
    // 拍摄建议只以文字给出，原图不画机位/箭头
    { tag: '拍摄建议', text: result.advice.shooting, part: null },
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
    } catch (err) {
      // 用户在系统分享面板里点了取消：不是故障，静默返回，也不计入分享数
      const name = (err as DOMException | undefined)?.name
      if (name === 'AbortError' || name === 'NotAllowedError') {
        setTip(null)
        return
      }
      setTip('卡片生成失败，请重试')
    } finally {
      setSharing(false)
    }
  }

  /** 建议卡 ↔ 标注联动：同一个部件再点一次取消高亮 */
  const togglePart = (part: Exclude<HighlightPart, null>) => {
    const next = highlight === part ? null : part
    setHighlight(next)
    // 只看选中（点开）这一次，衡量图文联动是否被理解和使用
    if (next) {
      track('plan_card_highlight', { mode: mode ?? undefined, meta: { part: next } })
    }
  }

  const handleDirection = (d: DirectionId) => {
    track('regenerate', { mode: mode ?? undefined, meta: { direction: d } })
    useDemoStore.getState().setDirection(d)
    // replace：换方向是"重算当前结果"，不该在历史栈里堆一层结果页
    navigate('/analysis', { replace: true })
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
      {!isSafety && (
        <>
          <h2 className="text-2xl font-bold">推荐拍摄方案</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            {result.modeText}
            {result.planDirection && (
              <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500">
                方向：{DIRECTION_LABELS[result.planDirection]}
              </span>
            )}
          </p>

          <div className="mt-4">
            <AnnotatedPhoto
              src={photo.dataUrl}
              zone={result.zone}
              altZone={result.altZone}
              variant={result.status === 'limited_uncertain' ? 'uncertain' : 'normal'}
              highlight={highlight}
            />
          </div>

          {/* 四条建议全部平铺；站位/构图卡可点击联动图中标注 */}
          <div className="mt-4 space-y-3">
            {cards.map((c) => {
              const clickable = c.part !== null
              const active = c.part !== null && highlight === c.part
              return (
                <div
                  key={c.tag}
                  // 可交互卡片用 role="button" 而非 <button>：卡内含 <p>，<button> 里嵌段落是非法结构
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-pressed={clickable ? active : undefined}
                  onClick={clickable ? () => togglePart(c.part!) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            togglePart(c.part!)
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'rounded-card bg-ink-100 p-4 transition-colors',
                    clickable &&
                      'cursor-pointer hover:bg-ink-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                    active && 'bg-white ring-2 ring-primary',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-200 px-2.5 py-1 text-xs">
                    {c.tag}
                    {clickable && (
                      <Eye className={cn('size-3', active ? 'text-primary' : 'text-ink-500')} />
                    )}
                  </span>
                  <p className="mt-2 text-sm leading-relaxed">{c.text}</p>
                  {c.part === 'zone' && result.altZone && (
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                      图中虚线框是备选站位
                      {result.altNote
                        ? `：${result.altNote}`
                        : '，首选位置被占用或站不下时改站这里'}
                      。
                    </p>
                  )}
                  {clickable && (
                    <p className="mt-1.5 text-xs text-ink-500">
                      {active ? '已高亮图中对应标注，再点一下取消' : '点击可在图上高亮对应标注'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* 提示条（保守方案 + 风险提示） */}
          {result.status === 'limited_uncertain' && (
            <NoticeBar
              text={
                result.message ??
                '当前光线或遮挡可能影响判断，以下建议仅供参考，建议现场确认后调整。'
              }
            />
          )}
          {(result.notices ?? []).map((n) => (
            <NoticeBar key={n} text={n} />
          ))}

          {/* 站位可达性快捷反馈 */}
          {result.zone && (
            <div className="mt-3">
              <ZoneReachFeedback status={result.status} mode={mode ?? 'companion'} />
            </div>
          )}

          {/* 保守方案的重新分析 */}
          {result.status === 'limited_uncertain' && (
            <button
              onClick={() => navigate('/analysis', { replace: true })}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-ink-500 underline underline-offset-2"
            >
              <RotateCcw className="size-3.5" />
              重新分析这张照片
            </button>
          )}
        </>
      )}

      {/* 安全场景 */}
      {isSafety && (
        <>
          <h2 className="text-2xl font-bold">
            {result.hazard ? '不建议在此拍照' : '场景需要注意安全'}
          </h2>
          {result.modeText && <p className="mt-1 text-[13px] text-ink-500">{result.modeText}</p>}
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
        </>
      )}

      {/* 换个方向重新生成（R7）：三方向平铺；limited_safety 场景不提供 */}
      {!isSafety && (
        <div className="mt-5 rounded-card border border-ink-200 p-4">
          <b className="text-sm">不满意？换个方向试试</b>
          <p className="mt-1 text-xs text-ink-500">
            保持当前环境分析，按新方向重新生成建议，无需重新上传照片。
          </p>
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

      <p className="mt-3 px-0.5 text-xs text-ink-500">
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
      <p className="text-xs text-ink-500">
        已记录，感谢反馈。
        {vote === 'no' && '可点击下方「换个方向试试」重新生成，或更换环境照片。'}
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
