/** 领域模型 —— 见 docs/design-spec.md 第 7 节 */

export type Mode = 'companion' | 'selfie'

export interface PhotoInput {
  /** 压缩后的 dataURL（image/jpeg） */
  dataUrl: string
  source: 'camera' | 'gallery'
  name?: string
}

/** 人物推荐区域（百分比坐标，相对图片宽高） */
export interface Zone {
  x: number
  y: number
  w: number
  h: number
}

/** 拍摄方向箭头（百分比位置 + 旋转角度） */
export interface DirectionHint {
  x: number
  y: number
  rotate: number
}

export interface Advice {
  /** 人物站位 */
  position: string
  /** 构图建议 */
  composition: string
  /** 动作建议 */
  pose: string
  /** 拍摄提示（同行：给拍摄者；自拍：设备与定时操作） */
  shooting: string
}

/**
 * 分析结果状态（6 类）：
 * - ready：正常方案
 * - limited_uncertain：模型置信度不足或坐标校验未过 → 保守建议（黄条提示）
 * - limited_safety：站位区域存在安全风险 → 不提供站位，仅保守文字（红卡提示）
 * - needs_new_photo：照片本身无法分析（模糊/自拍/过近/无关/无可站立环境/分辨率低）
 * - bad_image：图片无法读取（格式/损坏/过大）
 * - failed：服务失败（超时/模型错误/网络）
 */
export type AnalysisStatus =
  | 'ready'
  | 'limited_uncertain'
  | 'limited_safety'
  | 'needs_new_photo'
  | 'bad_image'
  | 'failed'

export type NeedsNewPhotoReason =
  | 'blurry'
  | 'selfie_only'
  | 'too_close'
  | 'not_travel_scene'
  | 'no_environment'
  | 'no_ground'
  | 'low_resolution'

export type BadImageReason = 'unsupported_format' | 'corrupted' | 'too_large'
export type FailedReason = 'timeout' | 'model_error' | 'network_error'

export interface AnalysisResult {
  status: AnalysisStatus
  /** 机器可读的细分原因，枚举随 status 不同（见上方各 Reason 类型） */
  reason?: string
  /** 用户可读的说明（受限 / 异常态） */
  message?: string
  /** 补拍提示（needs_new_photo） */
  hint?: string
  modeText?: string
  zone?: Zone
  direction?: DirectionHint
  advice?: Advice
  /** 安全 / 注意事项提示（limited_safety 为红卡，其余为普通提示条） */
  notices?: string[]
  /** 模型自报置信度（limited_uncertain 的判定来源之一） */
  confidence?: 'high' | 'medium' | 'low'
  /** 结果来源：ai = 真实模型分析；fallback = 规则版降级建议 */
  source: 'ai' | 'fallback'
}

export interface Feedback {
  taskId: string
  mode: Mode
  helpful: boolean
  at: number
}
