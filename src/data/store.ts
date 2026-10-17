import { create } from 'zustand'
import type { AnalysisResult, DirectionId, Mode, PhotoInput } from './types'

interface DemoState {
  photo: PhotoInput | null
  mode: Mode | null
  result: AnalysisResult | null
  taskId: string | null
  /** 重新生成的方向偏好（进入分析页前设置，分析完成后清空） */
  direction: DirectionId | null

  setPhoto: (p: PhotoInput | null) => void
  setMode: (m: Mode | null) => void
  setResult: (r: AnalysisResult | null) => void
  setDirection: (d: DirectionId | null) => void
  startTask: () => string
  /** 更换环境照片：清空照片但保留模式 */
  clearPhoto: () => void
  /** 修改拍摄条件：进入 task 页重新选择 */
  resetFlow: () => void
}

export const useDemoStore = create<DemoState>((set) => ({
  photo: null,
  mode: null,
  result: null,
  taskId: null,
  direction: null,

  setPhoto: (photo) => set({ photo }),
  setMode: (mode) => set({ mode }),
  setResult: (result) => set({ result }),
  setDirection: (direction) => set({ direction }),

  startTask: () => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    // 新任务：清空方向偏好
    set({ taskId: id, direction: null })
    return id
  },

  clearPhoto: () => set({ photo: null }),

  resetFlow: () => set({ result: null }),
}))
