import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeEnvironment } from '@/data/ai'
import { track } from '@/data/analytics'
import { useDemoStore } from '@/data/store'
import { cn } from '@/lib/cn'

const STEPS = ['理解当前环境', '分析可用构图空间', '生成可执行拍摄建议']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function Analysis() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0) // 已完成的步骤数

  useEffect(() => {
    const { photo, mode } = useDemoStore.getState()
    if (!photo || !mode) {
      navigate('/task', { replace: true })
      return
    }

    let cancelled = false
    const timers = [setTimeout(() => setStep(1), 800), setTimeout(() => setStep(2), 1700)]

    Promise.all([analyzeEnvironment(photo, mode), sleep(2600)])
      .then(([result]) => {
        if (cancelled) return
        setStep(3)
        useDemoStore.getState().setResult(result)
        const blocked =
          result.status === 'needs_new_photo' ||
          result.status === 'bad_image' ||
          result.status === 'failed'
        track(blocked ? 'analyze_blocked' : 'analyze_ok', {
          mode,
          source: result.source,
          meta: { status: result.status },
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
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pt-14 text-center">
      <div className="animate-spin-slow mx-auto size-12 rounded-full border-4 border-ink-200 border-t-primary" />
      <h2 className="mt-5 text-2xl font-bold">AI 正在分析当前环境</h2>
      <p className="mt-2 text-ink-500">会结合现场空间和你的拍摄方式生成建议。</p>

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
    </div>
  )
}
