import { useState } from 'react'
import {
  FEEDBACK_REASON_LABELS,
  type FeedbackReason,
  type Mode,
} from '@/data/types'
import { track } from '@/data/analytics'
import { saveFeedback } from '@/data/storage'
import { cn } from '@/lib/cn'

interface Props {
  taskId: string
  mode: Mode
}

const REASONS = Object.entries(FEEDBACK_REASON_LABELS) as [FeedbackReason, string][]

/** 用户反馈（满意度指标）：有帮助 / 没帮助；点踩时收集原因标签 */
export function FeedbackBox({ taskId, mode }: Props) {
  const [choice, setChoice] = useState<boolean | null>(null)
  const [reason, setReason] = useState<FeedbackReason | null>(null)

  const send = (helpful: boolean) => {
    const first = choice === null
    setChoice(helpful)
    if (!helpful) return // 点踩后先等用户选原因，再落库
    const f = { taskId, mode, helpful, at: Date.now() }
    saveFeedback(f)
    // 只统计首次表态，避免反复切换按钮把分母刷大
    if (first) track('feedback', { helpful, mode })
  }

  const sendReason = (r: FeedbackReason) => {
    setReason(r)
    const f = { taskId, mode, helpful: false, reason: r, at: Date.now() }
    saveFeedback(f)
    track('feedback', { helpful: false, mode })
    track('feedback_reason', { mode, meta: { reason: r } })
  }

  return (
    <div className="mt-6 rounded-card bg-ink-100/70 p-4">
      <h3 className="text-base font-semibold">这个建议有帮助吗？</h3>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          onClick={() => send(true)}
          className={cn(
            'min-h-12 rounded-xl bg-ink-150 text-sm transition',
            choice === true ? 'bg-white font-medium ring-2 ring-primary' : 'hover:bg-ink-200',
          )}
        >
          👍 有帮助
        </button>
        <button
          onClick={() => send(false)}
          className={cn(
            'min-h-12 rounded-xl bg-ink-150 text-sm transition',
            choice === false ? 'bg-white font-medium ring-2 ring-primary' : 'hover:bg-ink-200',
          )}
        >
          👎 没帮助
        </button>
      </div>

      {choice === false && reason === null && (
        <div className="mt-3">
          <p className="text-[13px] text-ink-500">主要是哪里没帮上忙？（可帮我们改进）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => sendReason(id)}
                className="min-h-10 rounded-full bg-white px-3.5 text-[13px] ring-1 ring-ink-300 transition hover:ring-ink-500"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {choice !== null && (choice === true || reason !== null) && (
        <p className="mt-2.5 text-[13px] text-ink-500">
          {reason ? `已记录：${FEEDBACK_REASON_LABELS[reason]}。` : ''}感谢反馈。
        </p>
      )}
    </div>
  )
}
