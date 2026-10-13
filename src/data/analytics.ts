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
  | 'view_result'
  | 'feedback'
  | 'regenerate'
  | 'photo_changed'
  | 'safety_confirmed'

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
}

export async function fetchUsageStats(): Promise<UsageStats | null> {
  const { data, error } = await cloud.database.from('usage_stats').select('*').maybeSingle()
  if (error || !data) return null
  return data as UsageStats
}
