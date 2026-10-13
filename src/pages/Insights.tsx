import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { fetchUsageStats, type UsageStats } from '@/data/analytics'
import { Button } from '@/components/ui/Button'

/**
 * 看板访问口令。
 *
 * 说明：这是前端口令，编译后存在于 JS 产物中，只能挡住「顺手点开链接」的访客，
 * 不构成真正的安全边界。看板只暴露聚合计数（无明细、无会话标识、无照片），
 * 因此采用这一轻量方案；若日后需要真正受控，应改为服务端校验。
 */
const INSIGHTS_PASSCODE = 'travelphoto2026'
const UNLOCK_KEY = 'ai-photo-demo:insights:v1'

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 使用数据看板（/insights）—— 不挂在产品导航里，仅供作者查看。
 * 数据来自数据库只读聚合视图：只有计数，没有明细、没有会话标识、没有照片。
 */
export function Insights() {
  const [unlocked, setUnlocked] = useState(readUnlocked)
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  const load = useCallback(async () => {
    setState('loading')
    const data = await fetchUsageStats()
    if (!data) {
      setState('failed')
      return
    }
    setStats(data)
    setState('ready')
  }, [])

  useEffect(() => {
    if (unlocked) void load()
  }, [load, unlocked])

  if (!unlocked) {
    return (
      <PasscodeGate
        onUnlock={() => {
          try {
            sessionStorage.setItem(UNLOCK_KEY, '1')
          } catch {
            /* 隐私模式下无法持久化，仅本次会话有效 */
          }
          setUnlocked(true)
        }}
      />
    )
  }

  if (state === 'loading') {
    return (
      <div className="pt-24 text-center text-ink-500">
        <div className="animate-spin-slow mx-auto size-10 rounded-full border-4 border-ink-200 border-t-primary" />
        <p className="mt-4 text-sm">正在加载使用数据…</p>
      </div>
    )
  }

  if (state === 'failed' || !stats) {
    return (
      <div className="pt-20 text-center">
        <h2 className="text-xl font-bold">暂时取不到数据</h2>
        <p className="mt-2 text-sm text-ink-500">请检查网络后重试。</p>
        <div className="mx-auto mt-5 max-w-60">
          <Button onClick={() => void load()}>重新加载</Button>
        </div>
      </div>
    )
  }

  const hasData = stats.sessions > 0
  const rate = (n: number) => (stats.sessions > 0 ? Math.round((n / stats.sessions) * 100) : 0)
  const helpfulTotal = stats.feedback_helpful + stats.feedback_not_helpful
  const helpfulRate =
    helpfulTotal > 0 ? Math.round((stats.feedback_helpful / helpfulTotal) * 100) : 0

  const funnel = [
    { label: '打开首页', count: stats.step_visit },
    { label: '添加环境照片', count: stats.step_photo },
    { label: '选择拍摄方式', count: stats.step_mode },
    { label: '点击生成建议', count: stats.step_generate },
    { label: '拿到拍摄方案', count: stats.step_ok },
  ]

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">使用数据</h2>
          <p className="mt-1 text-[13px] text-ink-400">
            数据实时来自云端数据库，仅统计匿名操作步骤
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="shrink-0 rounded-btn border border-ink-300 bg-white px-3 py-2 text-[13px] hover:bg-ink-100"
        >
          刷新
        </button>
      </div>

      {!hasData && (
        <div className="mt-6 rounded-card bg-ink-100 p-5 text-center">
          <p className="text-sm font-medium">还没有人使用过</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
            把 demo 链接分享出去，有人打开并走完流程后，这里就会出现数据。
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* 关键数字 */}
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            <Metric label="独立访客" value={String(stats.sessions)} />
            <Metric label="走完完整链路" value={String(stats.complete_flow)} />
            <Metric
              label="反馈有帮助"
              value={helpfulTotal > 0 ? `${helpfulRate}%` : '—'}
            />
          </div>

          {/* 链路漏斗 */}
          <h3 className="mt-7 mb-2 text-base font-semibold">
            核心链路完成情况
            <span className="ml-2 text-xs font-normal text-ink-400">
              完整完成率 {rate(stats.complete_flow)}%
            </span>
          </h3>
          <div className="rounded-card bg-ink-100 p-4">
            {funnel.map((s, i) => (
              <div key={s.label} className={i > 0 ? 'mt-4' : ''}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-700">
                    <span className="mr-1.5 text-xs text-ink-400">{i + 1}</span>
                    {s.label}
                  </span>
                  <span className="tabular-nums">
                    <b>{s.count}</b>
                    <span className="ml-1.5 text-xs text-ink-400">{rate(s.count)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${rate(s.count)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 反馈 */}
          <h3 className="mt-7 mb-2 text-base font-semibold">方案反馈</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <Metric label="👍 有帮助" value={String(stats.feedback_helpful)} />
            <Metric label="👎 没帮助" value={String(stats.feedback_not_helpful)} />
          </div>

          {/* 其他行为 */}
          <h3 className="mt-7 mb-2 text-base font-semibold">其他行为</h3>
          <div className="rounded-card bg-ink-100 p-4">
            <Row label="重新生成建议" value={stats.regenerate_count} />
            <Row label="更换环境照片" value={stats.photo_changed_count} />
            <Row label="异常阻断（无法分析）" value={stats.step_blocked} />
            <Row label="累计事件数" value={stats.events_total} last />
          </div>

          <div className="mt-3 rounded-card bg-ink-200/60 p-4">
            <p className="text-xs font-medium text-ink-700">数据说明</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              只记录操作步骤（进入哪一步、是否提交反馈），
              <b className="font-medium text-ink-700">
                不记录照片内容、不记录文字输入、不记录任何可识别个人身份的信息
              </b>
              。会话标识为随机串，关掉浏览器即失效。反馈同时保存在访客本机，供其自行查看。
            </p>
            {stats.first_event_at && (
              <p className="mt-2 text-xs text-ink-400">
                首次记录：{new Date(stats.first_event_at).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-ink-100 px-3 py-4 text-center">
      <b className="block text-2xl leading-none tabular-nums">{value}</b>
      <span className="mt-1.5 block text-xs text-ink-500">{label}</span>
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: number; last?: boolean }) {
  return (
    <div
      className={
        last
          ? 'flex items-center justify-between pt-2.5 text-sm'
          : 'flex items-center justify-between border-b border-ink-200 pb-2.5 text-sm'
      }
    >
      <span className="text-ink-500">{label}</span>
      <b className="tabular-nums">{value}</b>
    </div>
  )
}

/** 口令闸门 —— 未解锁时不渲染任何统计数据 */
function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value === INSIGHTS_PASSCODE) {
      onUnlock()
      return
    }
    setError(true)
  }

  return (
    <div className="pt-16">
      <form onSubmit={submit} className="mx-auto max-w-72">
        <h2 className="text-center text-xl font-bold">使用数据</h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-ink-400">
          该页面仅供作者查看，请输入口令
        </p>
        <input
          type="password"
          value={value}
          autoFocus
          placeholder="口令"
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          className="mt-5 w-full rounded-btn border border-ink-300 bg-white px-4 py-3 text-base outline-none focus:border-primary"
        />
        {error && (
          <p className="mt-2 text-center text-[13px] text-danger-text">口令不对，请重试</p>
        )}
        <div className="mt-4">
          <Button type="submit">进入</Button>
        </div>
      </form>
    </div>
  )
}
