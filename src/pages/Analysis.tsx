import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeEnvironment, type AnalysisStage } from '@/data/ai'
import { blockCategoryOf, track } from '@/data/analytics'
import { useDemoStore } from '@/data/store'
import { DIRECTION_LABELS, type DirectionId } from '@/data/types'
import { cn } from '@/lib/cn'

const STEPS = ['理解当前环境', '校验站位与安全', '生成可执行建议']

/** AI 管线真实阶段 → 步骤下标（步骤 i 处于进行中） */
const STAGE_STEP: Record<AnalysisStage, number> = { env: 0, verify: 1, compose: 2 }

export function Analysis() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 进行中的步骤下标；3 = 全部完成
  const [direction, setDirection] = useState<DirectionId | null>(null)
  // 取消埋点用：跟随渲染的 step 之外再留一份，避免闭包拿到旧值
  const stepRef = useRef(0)

  useEffect(() => {
    const { photo, mode, direction: dir } = useDemoStore.getState()
    if (!photo || !mode) {
      navigate('/task', { replace: true })
      return
    }
    setDirection(dir)

    let cancelled = false

    analyzeEnvironment(photo, mode, {
      onStage: (stage) => {
        if (!cancelled) {
          stepRef.current = STAGE_STEP[stage]
          setStep(STAGE_STEP[stage])
        }
      },
      direction: dir ?? undefined,
    })
      .then((result) => {
        if (cancelled) return
        setStep(3)
        useDemoStore.getState().setResult(result)
        // 方向偏好为一次性输入：本次分析完成后清空，避免影响下一次新任务
        useDemoStore.getState().setDirection(null)
        const blocked =
          result.status === 'needs_new_photo' ||
          result.status === 'bad_image' ||
          result.status === 'failed'
        track(blocked ? 'analyze_blocked' : 'analyze_ok', {
          mode,
          source: result.source,
          // 被拦截时记录细分原因与归类，用于统计"哪一类拦截最多、误拦多少"
          meta: blocked
            ? {
                status: result.status,
                reason: result.reason,
                category: blockCategoryOf(result.status, result.reason),
                direction: dir ?? undefined,
              }
            : { status: result.status, direction: dir ?? undefined },
        })
        setTimeout(() => {
          if (!cancelled) navigate(blocked ? '/image-error' : '/result')
        }, 450)
      })
      .catch(() => {
        if (!cancelled) navigate('/image-error')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pt-14 pb-16 text-center">
      <div className="animate-spin-slow mx-auto size-12 rounded-full border-4 border-ink-200 border-t-primary" />
      <h2 className="mt-5 text-2xl font-bold">
        {direction ? `正在按「${DIRECTION_LABELS[direction]}」调整方案` : 'AI 正在分析当前环境'}
      </h2>
      <p className="mt-2 text-ink-500">
        {direction ? '保持环境分析结果，换一个方向重新生成建议。' : '会结合现场空间和你的拍摄方式生成建议。'}
      </p>

      <div className="mt-6 text-left">
        {STEPS.map((label, i) => {
          const done = i < step
          const active = i === step
          return (
            <div
              key={label}
              className={cn(
                'mt-2.5 flex items-center gap-2.5 rounded-[13px] p-3.5 transition-colors',
                done && 'bg-ink-100',
                active && 'bg-ink-200/70',
                !done && !active && 'bg-ink-100',
              )}
            >
              <span className={cn('w-5 text-center', done || active ? 'text-primary' : 'text-ink-300')}>
                {done ? '✓' : active ? '●' : '○'}
              </span>
              <span className={cn('text-sm', done && 'text-ink-900', active && 'font-medium', !done && !active && 'text-ink-400')}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* 弱网兜底：允许取消返回（照片与拍摄方式保留，可直接重新开始） */}
      <button
        onClick={() => {
          // 中途放弃是流失信号：记录停在第几步（0 环境 / 1 校验 / 2 建议）
          track('analysis_cancelled', {
            mode: useDemoStore.getState().mode ?? undefined,
            meta: { stage: stepRef.current },
          })
          navigate('/task')
        }}
        className="mt-8 min-h-11 rounded-full px-6 text-sm text-ink-400 underline underline-offset-2 transition hover:text-ink-700"
      >
        取消分析，返回任务页
      </button>
    </div>
  )
}
