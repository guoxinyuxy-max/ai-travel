import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { fetchInsights, type ReasonStat, type UsageStats } from '@/data/analytics'
import { FEEDBACK_REASON_LABELS, type FeedbackReason } from '@/data/types'
import { Button } from '@/components/ui/Button'

/**
 * 看板口令校验在服务端完成：
 * - 前端不再硬编码口令，只把访客输入的口令交给数据库函数比对，错误则返回空集
 * - 聚合视图已撤销匿名读权限，绕过页面直接查接口也拿不到数据
 * - 输入过的口令只记在 sessionStorage，关掉浏览器即失效
 */
const UNLOCK_KEY = 'ai-photo-demo:insights:v2'

function readStoredPasscode(): string | null {
  try {
    return sessionStorage.getItem(UNLOCK_KEY)
  } catch {
    return null
  }
}

type LoadState = 'idle' | 'loading' | 'ready' | 'failed' | 'denied'

/**
 * 使用数据看板（/insights）—— 不挂在产品导航里，仅供作者查看。
 * 数据来自数据库只读聚合视图：只有计数，没有明细、没有会话标识、没有照片。
 */
export function Insights() {
  const [passcode, setPasscode] = useState<string | null>(readStoredPasscode)
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [reasons, setReasons] = useState<ReasonStat[] | null>(null)
  const [state, setState] = useState<LoadState>('idle')

  const load = useCallback(async (code: string) => {
    setState('loading')
    const res = await fetchInsights(code)
    if (res.status === 'ok') {
      setStats(res.stats)
      setReasons(res.reasons)
      setState('ready')
      return
    }
    if (res.status === 'denied') {
      // 口令不对（或已被更换）：清掉记住的口令，退回输入框
      try {
        sessionStorage.removeItem(UNLOCK_KEY)
      } catch {
        /* 隐私模式 */
      }
      setStats(null)
      setReasons(null)
      setPasscode(null)
      setState('denied')
      return
    }
    setState('failed')
  }, [])

  useEffect(() => {
    if (passcode) void load(passcode)
  }, [passcode, load])

  const handlePasscode = (value: string) => {
    try {
      sessionStorage.setItem(UNLOCK_KEY, value)
    } catch {
      /* 隐私模式下仅本次有效 */
    }
    setPasscode(value)
  }

  if (!passcode) {
    return (
      <PasscodeGate
        onSubmit={handlePasscode}
        denied={state === 'denied'}
        verifying={state === 'loading'}
      />
    )
  }

  if (state === 'idle' || state === 'loading') {
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
          <Button onClick={() => void load(passcode)}>重新加载</Button>
        </div>
      </div>
    )
  }

  const hasData = stats.sessions > 0
  const rate = (n: number) => (stats.sessions > 0 ? Math.round((n / stats.sessions) * 100) : 0)
  const helpfulTotal = stats.feedback_helpful + stats.feedback_not_helpful
  const helpfulRate =
    helpfulTotal > 0 ? Math.round((stats.feedback_helpful / helpfulTotal) * 100) : 0
  // 图文联动使用率：用过联动的会话 / 看过结果的会话
  const highlightRate =
    stats.step_view > 0
      ? Math.round((stats.card_highlight_sessions / stats.step_view) * 100)
      : 0
  // 分析取消率：取消次数 / 点击生成的次数
  const cancelRate =
    stats.step_generate > 0 ? Math.round((stats.cancel_count / stats.step_generate) * 100) : 0
  // 站位误判率：现场反馈「到不了」的占比
  const zoneMissRate =
    stats.zone_vote_total > 0
      ? Math.round((stats.zone_vote_unreachable / stats.zone_vote_total) * 100)
      : 0

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
          onClick={() => void load(passcode)}
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

          {/* 没帮助原因分布 */}
          {reasons && reasons.length > 0 && (
            <>
              <h3 className="mt-7 mb-2 text-base font-semibold">没帮助原因分布</h3>
              <div className="rounded-card bg-ink-100 p-4">
                {reasons
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .map((r, i) => {
                    const total = reasons.reduce((s, x) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((r.count / total) * 100) : 0
                    const label =
                      FEEDBACK_REASON_LABELS[r.reason as FeedbackReason] ?? r.reason
                    return (
                      <div key={r.reason} className={i > 0 ? 'mt-3.5' : ''}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-ink-700">{label}</span>
                          <span className="tabular-nums">
                            <b>{r.count}</b>
                            <span className="ml-1.5 text-xs text-ink-400">{pct}%</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}

          {/* 交互与质量 */}
          <h3 className="mt-7 mb-2 text-base font-semibold">交互与质量</h3>
          <div className="rounded-card bg-ink-100 p-4">
            <Row label={`图文联动点击（${stats.card_highlight_count} 次）`} value={stats.card_highlight_sessions} />
            <Row label="分析中途取消" value={stats.cancel_count} />
            <Row label="出现风险场景的会话" value={stats.hazard_sessions} />
            <Row label="分享给拍摄者" value={stats.share_count} last />
          </div>
          <p className="mt-2 px-1 text-xs leading-relaxed text-ink-400">
            联动使用率 {highlightRate}%（点开过标注的会话 / 看过结果的会话）；分析取消率{' '}
            {cancelRate}%（取消 / 点击生成）。「图文联动点击」右侧数字是会话数。
          </p>

          {/* 站位可用性（现场反馈） */}
          {stats.zone_vote_total > 0 && (
            <>
              <h3 className="mt-7 mb-2 text-base font-semibold">
                站位可用性
                <span className="ml-2 text-xs font-normal text-ink-400">
                  现场说「到不了」{zoneMissRate}%
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <Metric
                  label="能走到"
                  value={String(stats.zone_vote_total - stats.zone_vote_unreachable)}
                />
                <Metric label="到不了" value={String(stats.zone_vote_unreachable)} />
              </div>
              <p className="mt-2 px-1 text-xs leading-relaxed text-ink-400">
                共 {stats.zone_vote_total} 票现场反馈。这一比例越高，说明图上画的站位越不可达，
                需要收紧俯拍/越景照片的判定。
              </p>
            </>
          )}

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

/** 口令闸门 —— 口令交给服务端校验，未通过不渲染任何统计数据 */
function PasscodeGate({
  onSubmit,
  denied,
  verifying,
}: {
  onSubmit: (value: string) => void
  denied: boolean
  verifying: boolean
}) {
  const [value, setValue] = useState('')
  // 输错后重新输入即隐藏错误提示（denied 来自父组件，故用本地态"抹掉"它）
  const [dismissed, setDismissed] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (verifying) return
    const v = value.trim()
    if (!v) return
    setDismissed(false)
    onSubmit(v)
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
            setDismissed(true)
          }}
          className="mt-5 w-full rounded-btn border border-ink-300 bg-white px-4 py-3 text-base outline-none focus:border-primary"
        />
        {denied && !dismissed && (
          <p className="mt-2 text-center text-[13px] text-danger-text">口令不对，请重试</p>
        )}
        <div className="mt-4">
          <Button type="submit" disabled={verifying || !value.trim()}>
            {verifying ? '验证中…' : '进入'}
          </Button>
        </div>
      </form>
    </div>
  )
}
