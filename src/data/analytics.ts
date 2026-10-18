import { cloud } from './cloud'

/**
 * 匿名使用行为统计。
 *
 * 只上报「操作事件」（进入了哪一步、有没有提交反馈），
 * 不上报照片内容、文字输入或任何可识别个人身份的信息。
 * 会话标识为随机串，存在浏览器的 sessionStorage 里，关掉页面即失效。
 *
 * 所有上报静默失败 —— 统计不可用绝不能影响产品主流程。
 */
export type UsageEvent =
  | 'visit'
  | 'photo_added'
  | 'mode_selected'
  | 'generate_clicked'
  | 'analyze_ok'
  | 'analyze_blocked'
  | 'analysis_cancelled'
  | 'view_result'
  | 'hazard_shown'
  | 'plan_card_highlight'
  | 'feedback'
  | 'feedback_reason'
  | 'regenerate'
  | 'conditions_edit'
  | 'photo_changed'
  | 'safety_confirmed'
  | 'plan_saved'
  | 'plan_shared'
  | 'zone_feedback'

const SESSION_KEY = 'ai-photo-demo:session:v1'

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return 's_unknown'
  }
}

interface TrackProps {
  mode?: 'companion' | 'selfie'
  source?: 'ai' | 'fallback'
  helpful?: boolean
  meta?: Record<string, unknown>
}

export function track(event: UsageEvent, props: TrackProps = {}): void {
  void (async () => {
    try {
      const row: Record<string, unknown> = { session_id: sessionId(), event }
      if (props.mode) row.mode = props.mode
      if (props.source) row.result_source = props.source
      if (typeof props.helpful === 'boolean') row.helpful = props.helpful
      if (props.meta) row.meta = props.meta
      // SDK 未声明本应用的表结构（Database 泛型默认 unknown），from() 推导出的
      // 行类型退化为 never。这里断言为宽松写入类型，只影响类型检查，不影响运行时。
      const table = cloud.database.from('usage_events') as unknown as {
        insert: (r: Record<string, unknown>) => Promise<{ error: unknown }>
      }
      const { error } = await table.insert(row)
      if (error) throw error
    } catch {
      /* 统计失败不影响业务流程 */
    }
  })()
}

/** 使用行为聚合统计（来自数据库只读视图，仅含聚合计数） */
export interface UsageStats {
  sessions: number
  events_total: number
  step_visit: number
  step_photo: number
  step_mode: number
  step_generate: number
  step_ok: number
  step_blocked: number
  step_view: number
  step_feedback: number
  feedback_helpful: number
  feedback_not_helpful: number
  regenerate_count: number
  photo_changed_count: number
  complete_flow: number
  first_event_at: string | null
  last_event_at: string | null
  /** 图文联动：点击建议卡高亮图中标注的次数 / 用过这个交互的会话数 */
  card_highlight_count: number
  card_highlight_sessions: number
  /** 分析中途取消（弱网或等待不耐） */
  cancel_count: number
  /** 出现风险场景（车道/悬崖/水边/人群）的会话数 */
  hazard_sessions: number
  /** 分享给拍摄者次数 */
  share_count: number
  /** 站位可达性投票：总票数 / 「到不了」票数 */
  zone_vote_total: number
  zone_vote_unreachable: number
}

/**
 * 取看板数据 —— 单次 RPC 完成「口令校验 + 取数」，口令不进前端代码。
 *
 * 服务端（get_insights）行为：
 * - 口令正确：返回 { ok: true, stats, reasons }
 * - 口令错误：返回 { ok: false, state: 'denied' }，并累计失败次数
 * - 连续错 5 次：锁定 15 分钟，返回 { ok: false, state: 'locked', retry_after }
 */
export async function fetchInsights(passcode: string): Promise<InsightsResult> {
  const rpc = cloud.database.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>

  try {
    const res = await rpc('get_insights', { passcode })
    if (res.error) return { status: 'failed' }
    if (!res.data || typeof res.data !== 'object') return { status: 'failed' }

    const payload = res.data as {
      ok?: boolean
      state?: string
      retry_after?: number
      stats?: UsageStats
      reasons?: ReasonStat[]
    }

    if (payload.ok && payload.stats) {
      return { status: 'ok', stats: payload.stats, reasons: payload.reasons ?? [] }
    }
    if (payload.state === 'locked') {
      return { status: 'locked', retryAfter: payload.retry_after ?? 900 }
    }
    return { status: 'denied' }
  } catch {
    return { status: 'failed' }
  }
}

/** 看板数据读取结果：denied = 口令不对；locked = 连续错误被临时锁定 */
export type InsightsResult =
  | { status: 'ok'; stats: UsageStats; reasons: ReasonStat[] }
  | { status: 'denied' }
  | { status: 'locked'; retryAfter: number }
  | { status: 'failed' }

/** 没帮助原因分布（feedback_reason_stats 视图，仅聚合计数；经服务端口令校验读取） */
export interface ReasonStat {
  reason: string
  count: number
}
