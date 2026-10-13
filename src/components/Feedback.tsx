import { useState } from 'react'
import type { Feedback, Mode } from '@/data/types'
import { track } from '@/data/analytics'
import { saveFeedback } from '@/data/storage'

interface Props {
  taskId: string
  mode: Mode
}

/** 用户反馈（满意度指标）：有帮助 / 没帮助 */
export function FeedbackBox({ taskId, mode }: Props) {
  const [choice, setChoice] = useState<boolean | null>(null)

  const send = (helpful: boolean) => {
    const first = choice === null
    setChoice(helpful)
    const f: Feedback = { taskId, mode, helpful, at: Date.now() }
    saveFeedback(f)
    // 只统计首次表态，避免反复切换按钮把分母刷大
    if (first) track('feedback', { helpful, mode })
  }

  return (
    <div className="mt-6 rounded-card bg-ink-100/70 p-4">
      <h3 className="text-base font-semibold">这个建议有帮助吗？</h3>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button
          onClick={() => send(true)}
          className={`min-h-12 rounded-xl bg-ink-150 text-sm transition ${
            choice === true ? 'ring-2 ring-primary bg-white font-medium' : 'hover:bg-ink-200'
          }`}
        >
          👍 有帮助
        </button>
        <button
          onClick={() => send(false)}
          className={`min-h-12 rounded-xl bg-ink-150 text-sm transition ${
            choice === false ? 'ring-2 ring-primary bg-white font-medium' : 'hover:bg-ink-200'
          }`}
        >
          👎 没帮助
        </button>
      </div>
      {choice !== null && <p className="mt-2.5 text-[13px] text-ink-500">感谢反馈。</p>}
    </div>
  )
}
