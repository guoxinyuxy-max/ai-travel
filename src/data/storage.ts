import type { Feedback } from './types'

const FEEDBACK_KEY = 'ai-photo-demo:feedback:v1'

function read(): Feedback[] {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '[]') as Feedback[]
  } catch {
    return []
  }
}

export function saveFeedback(f: Feedback): void {
  const list = read()
  list.push(f)
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list))
}

export function getFeedbacks(): Feedback[] {
  return read()
}

/** 重置演示数据（设置入口使用） */
export function resetDemoData(): void {
  localStorage.removeItem(FEEDBACK_KEY)
  localStorage.removeItem('ai-photo-demo:plans:v1') // 已下线功能的历史数据清理
}
