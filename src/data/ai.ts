import { cloud } from './cloud'
import type { Advice, AnalysisResult, DirectionHint, Mode, PhotoInput, Zone } from './types'
import { dataUrlToBase64 } from '@/lib/image'

/**
 * 环境分析入口：
 * 1. 优先调用云端多模态大模型，基于真实照片内容生成方案（视觉分析 + 规则约束 + 语言生成）；
 * 2. 模型不可用 / 调用失败 / 输出不合法时，降级为本地摄影规则引擎，保证流程永远可用。
 *
 * 异常分层（6 类状态，见 types.ts）：
 * - needs_new_photo：照片本身不行（模型判定 / 本地分辨率检测）
 * - limited_uncertain：模型置信度不足，或站位框未通过前端坐标校验
 * - limited_safety：站位区域本身有安全风险（二次校验判定），一票否决站位
 */
export async function analyzeEnvironment(
  photo: PhotoInput,
  mode: Mode,
): Promise<AnalysisResult> {
  const t0 = Date.now()
  try {
    const result = await analyzeWithAI(photo, mode)
    await minDuration(t0, 2600) // 保证分析页进度动画完整呈现
    return result
  } catch {
    await minDuration(t0, 2200)
    try {
      return await localAnalysis(photo, mode)
    } catch {
      // 连本地引擎都无法执行（如图片解码失败）→ 图片本身不可用
      return {
        status: 'bad_image',
        reason: 'corrupted',
        message: '这张照片无法读取，请重新上传 JPG 或 PNG 格式的照片。',
        source: 'fallback',
      }
    }
  }
}

// ---------------------------------------------------------------- AI 分析

const SYSTEM_PROMPT = `你是一位面向普通旅行者的 AI 拍摄指导，负责分析用户上传的旅行环境照片并生成可直接执行的拍摄方案。

必须输出一个 JSON 对象，字段如下：
{
  "status": "ok" 或 "needs_new_photo",
  "reason": "仅当 status=needs_new_photo 时提供，枚举：blurry | selfie_only | too_close | not_travel_scene | no_environment",
  "confidence": "high | medium | low，反映本次站位与构图判断的可信度",
  "risk_level": "high | medium | low | none，反映你推荐的站位区域本身的人身安全风险（落水/坠落/交通）",
  "zone": { "x": 数字, "y": 数字, "w": 数字, "h": 数字 },
  "direction": { "x": 数字, "y": 数字, "rotate": 数字 },
  "modeText": "一行中文，说明已结合的拍摄条件",
  "advice": {
    "position": "人物站位建议，2 句以内",
    "composition": "构图建议，2 句以内",
    "pose": "动作建议，2 句以内",
    "shooting": "拍摄提示，2 句以内"
  },
  "notices": ["仅当画面存在需要注意的安全因素时提供，1-2 条简短中文提示，如水边、道路、人流、高处"]
}

规则：
- zone 是人物推荐站位区域，使用百分比坐标（0-100，相对图片宽高，x/y 为区域左上角）。区域必须落在照片中合理、空旷、不遮挡主要景物的位置，并符合构图规律（如三分法）。
- direction 是画面中"拍摄方向"箭头出现的位置（百分比坐标），rotate 取 -30 到 30。
- status="needs_new_photo" 仅用于照片本身无法分析的情况：
  - blurry：照片过度模糊；
  - selfie_only：纯人物自拍、几乎没有环境；
  - too_close：背景范围过小（近距离特写）；
  - not_travel_scene：内容与旅行拍摄无关（室内物品、宠物等）；
  - no_environment：画面几乎完全被天空、云层、纯色墙面或大面积水面占据，找不到任何可站立参照物。
- 照片本身清晰完整、只是场景需要小心时（水边、街道、人多、有台阶），status 仍为 "ok"，用 notices 提醒注意，不要判 needs_new_photo。
- confidence 判定：低光、逆光、镜面反光、严重遮挡、空间结构不清晰、地面特征不明显时降为 medium 或 low；画面清晰、站位明确的正常照片一律 high。
- risk_level 判定的是**你推荐的站位区域**本身是否危险，而不是画面里有没有危险元素：区域落在人行道、广场、岸边步道上即使旁边有马路或水面也属于 low；区域落在水面中央、车道中央、悬崖边缘属于 high。
- 输出前必须自检：zone 必须落在人物实际可以站立或进入的地面、平台、道路等位置；若该位置是天空、云层或悬空处，必须先调整到可站立位置；确实找不到可站立位置才返回 needs_new_photo。
- modeText：同行拍摄模式填"同行拍摄 · 已结合拍摄者操作条件"；自拍模式填"自拍模式 · 已结合定时拍摄和设备固定条件"。
- advice 文案要求：避免专业摄影术语，普通用户能直接照做；结合照片里实际可见的场景元素（如建筑、水面、街道、树木）来描述位置和构图。
- 构图建议需符合照片的实际横竖幅方向。
- shooting：同行模式写给拍摄者本人（如何移动和取景）；自拍模式写给用户（设备如何固定、定时几秒、如何走入站位）。
- 文案中禁止出现"最佳机位""保证安全""一定好看"等绝对化表述，使用"建议""可以尝试"等措辞。`

interface RawResult {
  status?: string
  reason?: string
  confidence?: string
  riskLevel?: string
  zone?: Record<string, unknown>
  direction?: Record<string, unknown>
  modeText?: string
  advice?: Record<string, unknown>
  notices?: unknown
}

let cachedImageModel: string | null = null

/**
 * 固定的视觉模型（经横向实测选定，见 docs/model-compare.html）：
 * Kimi K2.5 —— 2026-01-27 发布，原生多模态；4/4 成功，平均 6.2s，无长尾；
 * 输出能结合照片真实元素（船、棕榈树、篮球架），特写照片正确判定为「无法分析」。
 * 备选（若该模型不可用）：glm-5v-turbo。
 */
const PINNED_MODEL_ID = 'kimi-k2.5'
const FALLBACK_MODEL_ID = 'glm-5v-turbo'

async function getImageModelId(): Promise<string> {
  if (cachedImageModel) return cachedImageModel
  const models = await cloud.llm.models.list()

  // 1) 优先使用指定模型
  let model = models.find((m) => m.id === PINNED_MODEL_ID && m.disabled !== true)

  // 2) 指定模型不可用时，退到备选
  if (!model) model = models.find((m) => m.id === FALLBACK_MODEL_ID && m.disabled !== true)

  // 3) 都不在目录里时，按原逻辑自动选第一个支持图像的模型，保证流程不断
  if (!model) model = models.find((m) => m.supportsImages === true && m.disabled !== true)
  if (!model) {
    model = models.find(
      (m) => m.supportsImages !== false && m.disabledMultimodal !== true && m.disabled !== true,
    )
  }

  if (!model) throw new Error('NO_IMAGE_MODEL')
  cachedImageModel = model.id
  return model.id
}

async function analyzeWithAI(
  photo: PhotoInput,
  mode: Mode,
  retryFeedback?: string,
): Promise<AnalysisResult> {
  const modelId = await getImageModelId()

  const modeText =
    mode === 'selfie'
      ? '自拍模式：用户将使用三脚架、自拍杆或定时拍摄，无人帮忙按快门。'
      : '同行拍摄模式：由朋友、伴侣或家人帮忙拍摄，拍摄者可在现场自由移动取景。'

  let answer = ''
  for await (const chunk of cloud.llm.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: photo.dataUrl } },
          {
            type: 'text',
            text: `拍摄方式：${modeText}\n请分析这张旅行环境照片，生成拍摄方案 JSON。${
              retryFeedback ? `\n注意：${retryFeedback}` : ''
            }`,
          },
        ],
      },
    ],
    stream: true,
    response_format: { type: 'json_object' },
    temperature: 0.3, // 异常判定需要稳定可复现，降低随机性
  })) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) answer += delta
  }

  const raw = parseResult(answer)

  // 第一层：照片本身无法分析 → needs_new_photo（细分原因 + 补拍提示）
  if (raw.status === 'needs_new_photo') {
    return needsNewPhotoResult(raw.reason)
  }

  const advice = normalizeAdvice(raw.advice)
  if (!advice) throw new Error('BAD_ADVICE')

  const confidence = normalizeConfidence(raw.confidence)
  const riskLevel = normalizeRiskLevel(raw.riskLevel)
  const notices = normalizeNotices(raw.notices)

  // 第二层：前端坐标校验（宁可不画框，不可画错框）
  // 框未落在地面区域、或尺寸明显不可信 → 放弃画框，转保守建议
  let zone = normalizeZone(raw.zone)
  if (zone && !isPlausibleZone(zone)) zone = undefined

  // 第三层：站位区域二次校验（独立轻量调用）
  // 拦两类明显异常：悬空（不可站）与危险位置（可站但不该站）。
  // 首次被拦时带反馈让模型重试一次（多数是框放错位置，换个框即可）；
  // 重试仍被拦，才按拦截结论降级。
  if (zone) {
    const verdict = await verifyZone(photo.dataUrl, zone)
    if (!verdict.standable || !verdict.safe) {
      if (!retryFeedback) {
        const why = !verdict.standable
          ? `你给出的站位区域（x=${zone.x}, y=${zone.y}, w=${zone.w}, h=${zone.h}）经校验人物无法站立（${verdict.note ?? '位置悬空'}）。请重新给出一个落在画面中可站立地面上的区域。`
          : `你给出的站位区域（x=${zone.x}, y=${zone.y}, w=${zone.w}, h=${zone.h}）经校验存在安全风险（${verdict.note ?? '不应进入'}）。请重新给出一个安全且可站立的区域，远离水面边缘、机动车道、高处边缘。`
        return analyzeWithAI(photo, mode, why)
      }
      if (!verdict.standable) {
        return needsNewPhotoResult('no_ground')
      }
      // 一票否决：不提供站位，只保留保守文字建议
      return {
        status: 'limited_safety',
        message: '该场景的推荐站位存在安全风险，本次不提供具体站位，请以现场观察为准。',
        zone,
        advice: { ...advice, position: '本次不提供具体站位，请以现场观察为准。' },
        notices: mergeNotices(notices, verdict.note ? [`站位区域存在风险：${verdict.note}`] : []),
        source: 'ai',
      }
    }
  }

  // 第四层：置信度不足、无框，或主模型与二次校验对风险意见不一致 → 保守建议
  // （二次校验对"是否危险"存在偶发漏判，主模型的 risk_level=high 时从严处理）
  const limited = confidence !== 'high' || !zone || riskLevel === 'high'
  const uncertainMessage = !zone
    ? '本次无法确认推荐站位的位置，以下仅为保守建议。'
    : riskLevel === 'high'
      ? '推荐站位附近存在需要注意的安全因素，建议现场确认脚下环境后再站位。'
      : '当前光线或遮挡可能影响判断，以下建议仅供参考，建议现场确认后调整。'
  return {
    status: limited ? 'limited_uncertain' : 'ready',
    message: limited ? uncertainMessage : undefined,
    modeText:
      typeof raw.modeText === 'string' && raw.modeText ? raw.modeText : defaultModeText(mode),
    zone,
    direction: normalizeDirection(raw.direction),
    advice,
    notices: notices.length ? notices : undefined,
    confidence,
    source: 'ai',
  }
}

// ---------------------------------------------------------------- needs_new_photo 文案

const NEEDS_NEW_PHOTO_COPY: Record<string, { message: string; hint: string }> = {
  blurry: {
    message: '照片比较模糊，难以判断环境空间。',
    hint: '请在光线稳定的环境下持稳手机重新拍摄。',
  },
  selfie_only: {
    message: '照片以人物为主，缺少周围环境信息。',
    hint: '后退一步，把景点主体和周围空间一起拍进画面。',
  },
  too_close: {
    message: '照片背景范围较小，难以判断站位和构图空间。',
    hint: '后退一些，拍出更完整的景点和周围环境。',
  },
  not_travel_scene: {
    message: '照片内容看起来不是旅行拍摄场景。',
    hint: '换一张包含景点、街道或自然风景的照片。',
  },
  no_environment: {
    message: '照片里找不到人物可以站立的环境空间。',
    hint: '把可站立的地面（如步道、广场、岸边）拍进画面再试。',
  },
  no_ground: {
    message: '照片里找不到人物可以站立的环境空间。',
    hint: '把可站立的地面（如步道、广场、岸边）拍进画面再试。',
  },
  low_resolution: {
    message: '照片分辨率过低，难以判断环境细节。',
    hint: '尽量使用原图重新上传，避免过度压缩的截图。',
  },
}

function needsNewPhotoResult(reason: string | undefined): AnalysisResult {
  const copy = NEEDS_NEW_PHOTO_COPY[reason ?? ''] ?? NEEDS_NEW_PHOTO_COPY.no_environment
  return {
    status: 'needs_new_photo',
    reason: copy === NEEDS_NEW_PHOTO_COPY.no_environment ? 'no_environment' : reason,
    message: copy.message,
    hint: copy.hint,
    source: 'ai',
  }
}

// ---------------------------------------------------------------- 前端校验层

/** 站位框合理性校验（规格：框贴地 + 尺寸上限）。不通过 → 放弃画框 */
function isPlausibleZone(z: Zone): boolean {
  // 框贴地：底边应延伸到画面下方 65% 以后（地面通常在画面下半部）
  if (z.y + z.h < 65) return false
  // 框尺寸：过高或过宽说明模型把"环境"当成了"站位"，不可信
  if (z.h > 35 || z.w > 25) return false
  return true
}

function normalizeConfidence(v: unknown): 'high' | 'medium' | 'low' {
  return v === 'medium' || v === 'low' ? v : 'high'
}

function normalizeRiskLevel(v: unknown): 'high' | 'medium' | 'low' | 'none' {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'none'
}

function normalizeNotices(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 3)
}

function mergeNotices(base: string[], extra: string[]): string[] | undefined {
  const merged = [...base, ...extra].slice(0, 3)
  return merged.length ? merged : undefined
}

/**
 * 站位区域二次校验（独立调用，只拦明显异常，正常构图一律放行）：
 * - standable：区域内人物能否站立（拦悬空，如天空/云层/纯色背景）
 * - safe：站位是否安全（拦落水/坠落/车道中央等不应进入的位置）
 * 校验通道本身失败时放行（不阻断正常流程），交由主判定的稳定性兜底。
 */
interface ZoneVerdict {
  standable: boolean
  safe: boolean
  note?: string
}

async function verifyZone(dataUrl: string, zone: Zone): Promise<ZoneVerdict> {
  try {
    const modelId = await getImageModelId()
    let out = ''
    for await (const chunk of cloud.llm.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: `你是图像区域安全校验器，只负责拦截明显的异常，正常摄影构图一律放行。给定一张照片和一个百分比坐标矩形（x,y 为左上角，w,h 为宽高，均相对图片宽高，范围 0-100）。
standable（人物能否站在此区域）：地面、平台、人行道、台阶、草地、沙滩、浅滩、水岸边，或人物站在岸边/前景时在画面中的自然投影位置 → true；区域主要覆盖天空、云层、纯色背景等人物绝不可能出现的位置 → false。
safe（站在此处是否安全）：区域落在开阔水面中央、船只边缘外沿、悬崖或高处边缘、栏杆外侧、机动车道中央等人员不应进入的位置 → false，否则 true。
拿不准时一律 standable=true、safe=true。只输出 JSON：{"standable": true 或 false, "safe": true 或 false, "reason": "10字以内原因"}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: `站位区域：x=${zone.x}, y=${zone.y}, w=${zone.w}, h=${zone.h}。请校验。` },
          ],
        },
      ],
      stream: true,
      response_format: { type: 'json_object' },
      temperature: 0, // 校验器要的是确定性结论
    })) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) out += delta
    }
    const start = out.indexOf('{')
    const end = out.lastIndexOf('}')
    if (start < 0 || end <= start) return { standable: true, safe: true } // 输出不合法 → 放行
    const j = JSON.parse(out.slice(start, end + 1)) as {
      standable?: unknown
      safe?: unknown
      reason?: unknown
    }
    const note = typeof j.reason === 'string' && j.reason.trim() ? j.reason.trim() : undefined
    // 只有明确 false 才拦截（保守放行原则）
    if (j.standable === false) return { standable: false, safe: false, note }
    if (j.safe === false) return { standable: true, safe: false, note }
    return { standable: true, safe: true }
  } catch {
    return { standable: true, safe: true } // 校验通道失败 → 放行，不阻断正常流程
  }
}

function parseResult(answer: string): RawResult {
  // 兼容模型偶尔在 JSON 外包裹 ```json 代码块
  const text = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('BAD_JSON')
  return JSON.parse(text.slice(start, end + 1)) as RawResult
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeZone(z: Record<string, unknown> | undefined): Zone | undefined {
  if (!z || typeof z !== 'object') return undefined
  const x = z.x
  const y = z.y
  const w = z.w
  const h = z.h
  // 坐标明显越界（超出 0-100 范围）→ 判定不可信，交由上层放弃画框
  const outOfRange = [x, y, w, h].some((v) => {
    const n = typeof v === 'number' ? v : Number(v)
    return !Number.isFinite(n) || n < 0 || n > 100
  })
  if (outOfRange) return undefined
  return {
    x: clamp(x, 0, 90, 58),
    y: clamp(y, 0, 80, 42),
    w: clamp(w, 8, 45, 26),
    h: clamp(h, 10, 55, 40),
  }
}

function normalizeDirection(d: Record<string, unknown> | undefined): DirectionHint {
  if (!d || typeof d !== 'object') return { x: 22, y: 60, rotate: -14 }
  return {
    x: clamp(d.x, 2, 80, 22),
    y: clamp(d.y, 5, 85, 60),
    rotate: clamp(d.rotate, -30, 30, -14),
  }
}

function normalizeAdvice(a: Record<string, unknown> | undefined): Advice | null {
  if (!a || typeof a !== 'object') return null
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const position = s(a.position)
  const composition = s(a.composition)
  const pose = s(a.pose)
  const shooting = s(a.shooting)
  if (!position || !composition || !pose || !shooting) return null
  return { position, composition, pose, shooting }
}

function defaultModeText(mode: Mode): string {
  return mode === 'selfie'
    ? '自拍模式 · 已结合定时拍摄和设备固定条件'
    : '同行拍摄 · 已结合拍摄者操作条件'
}

// ---------------------------------------------------------------- 本地降级引擎

async function localAnalysis(photo: PhotoInput, mode: Mode): Promise<AnalysisResult> {
  const features = await extractFeatures(photo.dataUrl)

  if (features.minSide < 480) {
    return { ...needsNewPhotoResult('low_resolution'), source: 'fallback' }
  }

  const advice = buildAdvice(features, mode)
  const zone: Zone = features.portrait
    ? { x: 56 + Math.random() * 10, y: 42 + Math.random() * 10, w: 24 + Math.random() * 8, h: 36 + Math.random() * 10 }
    : { x: 60 + Math.random() * 10, y: 38 + Math.random() * 12, w: 20 + Math.random() * 8, h: 40 + Math.random() * 12 }
  const direction: DirectionHint = {
    x: 18 + Math.random() * 10,
    y: 58 + Math.random() * 12,
    rotate: -18 + Math.random() * 12,
  }
  const lowLight = features.brightness < 70

  return {
    status: 'ready',
    modeText: defaultModeText(mode),
    zone,
    direction,
    advice: lowLight
      ? { ...advice, shooting: `${advice.shooting}另外，当前光线偏暗，尽量让人物面向光源，必要时开启夜景模式。` }
      : advice,
    source: 'fallback',
  }
}

interface PhotoFeatures {
  width: number
  height: number
  portrait: boolean
  brightness: number
  minSide: number
}

async function extractFeatures(dataUrl: string): Promise<PhotoFeatures> {
  const img = await loadImage(dataUrl)
  const width = img.naturalWidth
  const height = img.naturalHeight

  const canvas = document.createElement('canvas')
  const sw = 48
  const sh = Math.max(1, Math.round((48 * height) / width))
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  let brightness = 128
  if (ctx) {
    ctx.drawImage(img, 0, 0, sw, sh)
    const d = ctx.getImageData(0, 0, sw, sh).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    }
    brightness = Math.round(sum / (d.length / 4))
  }

  return {
    width,
    height,
    portrait: height >= width,
    brightness,
    minSide: Math.min(width, height),
  }
}

function buildAdvice(f: PhotoFeatures, mode: Mode): Advice {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

  const composition = f.portrait
    ? '采用竖幅构图，让人物靠近一侧三分线，保留主体完整，并带出环境的纵深感。'
    : '采用横幅构图，把人物放在三分线附近，利用横向空间表现环境的开阔感。'

  if (mode === 'selfie') {
    return {
      position: pick([
        '站在画面一侧的推荐区域内，给另一侧留出更多环境空间。',
        '站在主体前方偏侧的位置，避免身体完全挡住背后的景色。',
      ]),
      composition,
      pose: pick([
        '身体微侧，一只脚自然向前，可看向远处风景或短暂看向镜头。',
        '双手自然下垂或轻触周边护栏，避免正对镜头的僵硬站姿。',
      ]),
      shooting:
        '将手机固定在稳定位置，先确认取景，再走到标记区域；建议开启 5–10 秒定时拍摄，并根据现场情况微调设备位置。',
    }
  }

  return {
    position: pick([
      '站在主体一侧的推荐区域，避免遮挡主体，同时让人物成为画面视觉重点。',
      '站在画面边缘三分之一处，与主体保持一定距离，形成人与环境的呼应。',
    ]),
    composition,
    pose: pick([
      '身体稍向主体方向侧转，手臂自然放松，可用行走或回头动作减少僵硬感。',
      '面朝远方风景，肩膀放松，让抓拍姿态显得自然不刻意。',
    ]),
    shooting:
      '拍摄者向主体反方向侧后方微调取景位置，优先保证主体不被裁切，再根据现场距离调整人物在画面中的大小。',
  }
}

// ---------------------------------------------------------------- utils

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

async function minDuration(t0: number, ms: number): Promise<void> {
  const rest = ms - (Date.now() - t0)
  if (rest > 0) await new Promise((r) => setTimeout(r, rest))
}

// base64 工具保留：后续若需直传 base64 而非 dataURL 时使用
void dataUrlToBase64
