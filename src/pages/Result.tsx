import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { AnnotatedPhoto } from '@/components/AnnotatedPhoto'
import { FeedbackBox } from '@/components/Feedback'
import { Button } from '@/components/ui/Button'
import { track } from '@/data/analytics'
import { useDemoStore } from '@/data/store'

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
  }, [result?.status])

  if (!renderable || !photo || !result?.advice) return null

  const isSelfie = mode === 'selfie'
  const shootingTag = isSelfie ? '自拍提示' : '拍摄者提示'

  const cards = [
    { tag: '人物站位', text: result.advice.position },
    { tag: '构图建议', text: result.advice.composition },
    { tag: '动作建议', text: result.advice.pose },
    { tag: shootingTag, text: result.advice.shooting },
  ]

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      <div>
        <h2 className="text-2xl font-bold">
          {isSafety ? '场景需要注意安全' : '推荐拍摄方案'}
        </h2>
        <p className="mt-1 text-[13px] text-ink-400">{result.modeText}</p>

        {result.status === 'limited_uncertain' && (
          <NoticeBar
            text={
              result.message ??
              '当前光线或遮挡可能影响判断，以下建议仅供参考，建议现场确认后调整。'
            }
          />
        )}
        {isSafety && (
          <div className="mt-4 rounded-card border border-danger-border bg-danger-soft p-4">
            <b className="flex items-center gap-1.5 text-[15px] text-danger-text">
              <TriangleAlert className="size-4" />
              安全提示
            </b>
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
          />
          {isSafety && confirmed && (
            <p className="mt-2 text-xs text-danger-text">⚠ 参考站位未验证安全，仅供构图参考，请以现场观察为准。</p>
          )}
        </div>
      </div>

      <div className="mt-6 lg:mt-0">
        {cards.map((c) => (
          <div key={c.tag} className="mt-3 rounded-card bg-ink-100 p-4 first:mt-0">
            <span className="inline-block rounded-full bg-ink-200 px-2.5 py-1 text-xs">{c.tag}</span>
            <p className="mt-2 text-sm leading-relaxed">{c.text}</p>
          </div>
        ))}

        <p className="mt-3 px-0.5 text-xs text-ink-400">
          本次建议由内置摄影规则引擎结合照片特征生成，仅供参考。
        </p>

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
              <Button
                onClick={() => {
                  track('regenerate', { mode: mode ?? undefined })
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

        {!isSafety && taskId && mode && <FeedbackBox taskId={taskId} mode={mode} />}
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
