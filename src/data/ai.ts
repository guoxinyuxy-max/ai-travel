import { cloud } from './cloud'
import type { Advice, AnalysisResult, DirectionHint, DirectionId, HazardType, Mode, PhotoInput, Zone } from './types'
import { dataUrlToBase64 } from '@/lib/image'

/**
 * 分析管线真实阶段（供分析页进度展示，替代固定定时器）：
 * - env：主分析调用（理解环境 + 生成方案）
 * - verify：站位区域校验（前端坐标校验 / 二次安全校验 / 地面检查）
 * - compose：结果组装（校验后的最终整理）
 */
export type AnalysisStage = 'env' | 'verify' | 'compose'

export interface AnalyzeOptions {
  onStage?: (stage: AnalysisStage) => void
  /** 方案方向偏好（R7 重新生成时传入） */
  direction?: DirectionId
}

/** 方向偏好 → 注入提示词的偏好描述 */
const DIRECTION_PROMPTS: Record<DirectionId, string> = {
  subject: '人物更突出：让人物离镜头更近、在画面中占比更大，突出人物状态，同时保留主要景点。',
  wide: '环境更开阔：把更多环境收进画面，人物占比适中偏小，强调场景的开阔感与空间感。',
  mood: '氛围感更强：结合现场光线、前后景层次或框景元素，让画面更有旅行氛围感。',
}

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
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const t0 = Date.now()
  try {
    const result = await analyzeWithAI(photo, mode, options)
    await minDuration(t0, 2600) // 保证分析页进度动画完整呈现
    return result
  } catch {
    await minDuration(t0, 2200)
    try {
      const fallback = await localAnalysis(photo, mode)
      fallback.planDirection = options.direction
      return fallback
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
  "reason": "仅当 status=needs_new_photo 时提供，枚举：blurry | selfie_only | too_close | not_travel_scene | no_environment | aerial_view | unreachable_view",
  "confidence": "high | medium | low，反映本次站位与构图判断的可信度",
  "risk_level": "high | medium | low | none，反映你推荐的站位区域本身的人身安全风险（车辆/坠落/落水）",
  "hazard": "none | road | cliff | water | crowd，画面中与本次拍摄直接相关的风险类型：road=推荐站位在车道/路肩/斑马线或紧邻机动车道且画面中有车辆通行；cliff=悬崖或高处边缘、护栏外；water=无护栏水边、湿滑礁石；crowd=热门机位人流密集；none=无明显风险",
  "zone": { "x": 数字, "y": 数字, "w": 数字, "h": 数字 },
  "personScale": 数字,
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
- zone 是人物推荐站位区域，使用百分比坐标（0-100，相对图片宽高，x/y 为区域左上角）。区域必须同时满足三个条件：
  ① 可站立——区域是地面、步道、平台、台阶等人物真实可以站立的位置；
  ② 可到达——人物从拍摄这张照片的机位出发能实际走到（与机位之间没有明显落差、水面、围栏、悬崖等阻隔）；
  ③ 就近优先——优先画在靠近镜头的前景地面（画面下部 1/3、人物能直接走到的位置）。
  禁止把站位画在远处需要跨越落差、水面或障碍才能到达的位置（如从高处俯拍的对面地面、隔水的岸边）。区域应空旷、不遮挡主要景物，并符合构图规律（如三分法）。
- 透视与比例（重要）：zone 的高度必须等于「人物站在该位置时在画面中的视觉高度」，宽度按人体比例同步收窄，禁止所有场景都用同一个尺寸。
  - 距离镜头越远、脚部位置在画面中越靠上，人物在画面中越小：近景（人物 3 米内）视觉高度约占画面高度 25%–40%；中景（3–8 米）约 12%–22%；远景（8–20 米）约 6%–12%；更远约 3%–6%。
  - 广角、俯拍、大场景照片里人物通常很小，不要因为"主角要突出"就放大站位框。
  - 同时输出 personScale：人物在该位置的视觉高度占画面高度的百分比（数字，3–45），它应与 zone.h 基本一致。
- 安全判定（重要）：必须结合画面中可见的真实风险判断 hazard 与 risk_level。核心原则：只有「人物站的位置本身不能正常站立、站上去就有危险」才判高风险；「位置附近有危险元素但站位本身是正常步道/广场/平台」属于最常见的旅行拍照场景，一律判 none，用 notices 提醒即可。对 hazard 拿不准时输出 none。
  - hazard=road、risk_level=high 仅当：站位落在机动车道、路肩停车带、斑马线上，或与行车道之间没有任何人行道/绿化带/护栏隔离且紧贴车道。站位在人行道、观景平台、有隔离的步道 → 判 none；
  - hazard=cliff、risk_level=high 仅当：站位本身在悬崖、高处边缘、护栏外侧；
  - hazard=water、risk_level=high 仅当：站位本身在礁石、滩涂、水里、码头边缘外沿。特别注意：沿湖/沿海的石板步道、岸堤步道（即使没有护栏、旁边就是水面）是旅行中最常见的拍摄场景，一律判 none，最多 notices 提醒"注意脚下与水边距离"；
  - hazard=crowd、risk_level=medium：这是热门景点机位、人流密集、需要排队拍照；
  - 以上都不成立 → hazard=none。
- direction 是画面中"拍摄方向"箭头出现的位置（百分比坐标），rotate 取 -30 到 30。
- status="needs_new_photo" 仅用于照片本身无法分析的情况：
  - blurry：照片过度模糊；
  - selfie_only：纯人物自拍、几乎没有环境；
  - too_close：背景范围过小（近距离特写）；
  - not_travel_scene：内容与旅行拍摄无关（室内物品、宠物等）；
  - no_environment：画面几乎完全被天空、云层、纯色墙面或大面积水面占据，找不到任何可站立参照物；
  - aerial_view：航拍、无人机俯瞰、上帝视角等"拍摄空中/纯风景"的照片，画面中不存在人物实际可站立并进入画面的地面。
  - unreachable_view：从高处（阳台、山顶、观景台、楼层窗户）俯拍远处的街道、海面、地面，或隔着栏杆、玻璃、水面向外拍摄——画面里虽然能看到地面，但拍摄机位与该地面存在明显落差或阻隔，人物脚下的前景不在画面内，无法就近走进画面。
- 重要：只有天空、云海、海面、远景而没有道路、地面、平台的纯风景照，不是"人在景点前"的拍摄场景，必须返回 needs_new_photo（aerial_view 或 no_environment），禁止为这类照片编造站位。同样，从高处或隔着障碍物俯拍远处地面的照片，也必须返回 needs_new_photo（unreachable_view），禁止把站位画在远处的地面上。
- 照片本身清晰完整、只是场景需要小心时（水边、街道、人多、有台阶），status 仍为 "ok"，用 notices 提醒注意，不要判 needs_new_photo。
- confidence 判定：低光、逆光、镜面反光、严重遮挡、空间结构不清晰、地面特征不明显时降为 medium 或 low；画面清晰、站位明确的正常照片一律 high。
- risk_level 判定的是**你推荐的站位区域**本身是否危险，而不是画面里有没有危险元素：区域落在人行道内侧、广场、岸边步道上即使旁边有马路或水面也属于 low；区域落在水面中央、车道中央、悬崖边缘属于 high。
- hazard 与 notices 必须相互印证：hazard 不为 none 时，notices 要给出对应的具体提醒（如"右侧有车辆通行，请勿站在车道上"），不要只写笼统口号。
- 输出前必须自检：zone 必须同时满足「可站立 + 可到达 + 就近优先」；若该位置是天空、云层、悬空处，或与拍摄机位之间存在落差/水面/围栏阻隔，必须先调整到机位附近可走到的地面；确实找不到就近可站立位置才返回 needs_new_photo。
- modeText：同行拍摄模式填"同行拍摄 · 已结合拍摄者操作条件"；自拍模式填"自拍模式 · 已结合定时拍摄和设备固定条件"。
- advice 文案要求：避免专业摄影术语，普通用户能直接照做；结合照片里实际可见的场景元素（如建筑、水面、街道、树木）来描述位置和构图。
- 构图建议需符合照片的实际横竖幅方向。
- 若用户给了「方案方向偏好」，站位框与构图建议需符合该偏好：偏好"人物更突出"时站位框更靠近镜头且更大；偏好"环境更开阔"时人物占比更小、纳入更多环境；偏好"氛围感更强"时构图结合光线与前后景层次。
- shooting：同行模式写给拍摄者本人（如何移动和取景）；自拍模式写给用户（设备如何固定、定时几秒、如何走入站位）。
- 文案中禁止出现"最佳机位""保证安全""一定好看"等绝对化表述，使用"建议""可以尝试"等措辞。`

interface RawResult {
  status?: string
  reason?: string
  confidence?: string
  riskLevel?: string
  hazard?: string
  personScale?: unknown
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
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const { onStage, direction } = options
  const modelId = await getImageModelId()

  const modeText =
    mode === 'selfie'
      ? '自拍模式：用户将使用三脚架、自拍杆或定时拍摄，无人帮忙按快门。'
      : '同行拍摄模式：由朋友、伴侣或家人帮忙拍摄，拍摄者可在现场自由移动取景。'

  const directionText = direction ? `\n方案方向偏好：${DIRECTION_PROMPTS[direction]}` : ''

  onStage?.('env') // 阶段一：主分析调用开始
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
            text: `拍摄方式：${modeText}${directionText}\n请分析这张旅行环境照片，生成拍摄方案 JSON。`,
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
  const hazard = normalizeHazard(raw.hazard)
  let notices = normalizeNotices(raw.notices)

  // 第二层：前端坐标校验（宁可不画框，不可画错框）
  // 框未落在地面区域、或尺寸明显不可信 → 放弃画框，转保守建议
  onStage?.('verify') // 阶段二：站位区域校验
  let zone = normalizeZone(raw.zone)
  // 透视修正：按模型给出的人物视觉高度重算框宽高，让站位大小符合照片视角（远小近大）
  if (zone) zone = await fitPerspective(photo.dataUrl, zone, normalizePersonScale(raw.personScale))
  if (zone && !isPlausibleZone(zone)) zone = undefined

  // 第三层：站位区域二次校验（独立轻量调用）
  // 拦三类明显异常：悬空（不可站）、不可达（从机位走不到）、危险位置（可站但不该站）。
  // 首次被拦时做一次轻量重试：只让模型重新给站位框，不重跑整套方案（约 2-3s）；
  // 重试后仍未通过，才按校验结论降级。
  let verifyUncertain = false // 校验器拿不准 / 通道失败 → 放行但强制降级
  if (zone) {
    let verdict = await verifyZone(photo.dataUrl, zone)
    if (!verdict.standable || !verdict.reachable || verdict.safe === 'veto') {
      const why = !verdict.standable
        ? `站位区域（x=${zone.x}, y=${zone.y}, w=${zone.w}, h=${zone.h}）人物无法站立（${verdict.note ?? '位置悬空'}）`
        : !verdict.reachable
          ? `站位区域（x=${zone.x}, y=${zone.y}, w=${zone.w}, h=${zone.h}）人物从拍摄机位无法走到（${verdict.note ?? '存在落差或阻隔'}）`
          : `站位区域（x=${zone.x}, y=${zone.y}, w=${zone.w}, h=${zone.h}）站上去有危险（${verdict.note ?? '不应进入'}）`
      const fixed = await retryZoneOnly(photo.dataUrl, why)
      if (fixed) {
        zone = fixed
        verdict = await verifyZone(photo.dataUrl, fixed)
      }
    }
    if (!verdict.standable) {
      return needsNewPhotoResult('no_ground')
    }
    if (!verdict.reachable) {
      // 站位与机位之间存在落差/阻隔（如俯拍远处的地面）→ 判无法分析并给补拍指导
      return needsNewPhotoResult('unreachable_view')
    }
    // veto 分级：车道（车辆）与高处（坠落）是即时致命风险 → 一票否决不给站位；
    // 水边类存在"步道临水站立"这一常见且可接受的拍法 → 最高降级为强提醒，不一票否决。
    if (verdict.safe === 'veto' && hazard !== 'water') {
      const copy = hazard === 'road' || hazard === 'cliff' ? HAZARD_COPY[hazard] : null
      return {
        status: 'limited_safety',
        hazard: hazard === 'none' ? undefined : hazard,
        message: copy?.message ?? '这个位置不适合站立拍摄，存在安全风险，本次不提供具体站位，请以现场观察为准。',
        zone,
        advice: { ...advice, position: '本次不提供具体站位，请以现场观察为准。' },
        notices: mergeNotices(notices, [
          ...(copy ? [copy.notice] : []),
          ...(verdict.note ? [`校验结论：${verdict.note}`] : []),
        ]),
        confidence,
        planDirection: direction,
        source: 'ai',
      }
    }
    if (verdict.safe === 'veto' || verdict.safe === 'warn') {
      // 紧邻风险（旁边有车流/紧邻水边/靠近高处边缘）→ 降级 + 强提醒，保留站位
      const warn = hazard === 'road' || hazard === 'cliff' || hazard === 'water' ? HAZARD_WARN[hazard] : null
      const warnMessage = warn?.message ?? '推荐站位附近存在需要注意的安全因素，请现场确认脚下环境后再站位。'
      const warnNotice = warn?.notice ?? (verdict.note ? `注意：${verdict.note}` : '请与危险区域保持安全距离。')
      if (!notices.includes(warnNotice)) notices = [...notices, warnNotice]
      if (verdict.safe === 'veto' && !notices.includes(WATER_VETO_EXTRA))
        notices = [...notices, WATER_VETO_EXTRA]
      return {
        status: 'limited_uncertain',
        hazard: hazard === 'none' ? undefined : hazard,
        message: warnMessage,
        modeText:
          typeof raw.modeText === 'string' && raw.modeText ? raw.modeText : defaultModeText(mode),
        zone,
        direction: normalizeDirection(raw.direction),
        advice,
        notices: notices.length ? notices : undefined,
        confidence,
        planDirection: direction,
        source: 'ai',
      }
    }
    verifyUncertain = !verdict.certain
  }

  // 第三点五层：站位框缺失时，先确认画面里有没有可站立地面。
  // 纯天空、云海、航拍俯瞰等照片应判"无法分析"，而不是输出没有站位的保守建议。
  if (!zone && !(await checkHasGround(photo.dataUrl))) {
    return needsNewPhotoResult('no_environment')
  }

  // 第四层：主模型识别到邻近风险（画面有车 / 临近水边 / 高处边缘）或风险判定偏高
  // → 站位本身已通过安全校验，但仍降级为"需现场确认"的保守建议，并给出强提醒
  const adjacentRisk = hazard === 'road' || hazard === 'water' || hazard === 'cliff' || riskLevel === 'high'
  if (adjacentRisk) {
    const warn =
      hazard === 'road' || hazard === 'water' || hazard === 'cliff'
        ? HAZARD_WARN[hazard]
        : null
    const warnMessage = warn?.message ?? '推荐站位附近存在需要注意的安全因素，建议现场确认脚下环境后再站位。'
    const warnNotice = warn?.notice ?? '请换到远离车道、高处边缘或水边的安全位置拍摄。'
    if (!notices.includes(warnNotice)) notices = [...notices, warnNotice]
    return {
      status: 'limited_uncertain',
      hazard: hazard === 'none' ? undefined : hazard,
      message: warnMessage,
      modeText:
        typeof raw.modeText === 'string' && raw.modeText ? raw.modeText : defaultModeText(mode),
      zone,
      direction: normalizeDirection(raw.direction),
      advice,
      notices: notices.length ? notices : undefined,
      confidence,
      planDirection: direction,
      source: 'ai',
    }
  }

  // 第五层：热门机位（人流密集）→ 仍给方案，但降级为需现场确认的保守建议
  if (hazard === 'crowd' && !notices.includes(CROWD_NOTICE)) {
    notices = [...notices, CROWD_NOTICE]
  }

  // 第六层：置信度不足、无框，或校验器拿不准 → 保守建议
  onStage?.('compose') // 阶段三：结果组装
  const limited = confidence !== 'high' || !zone || verifyUncertain || hazard === 'crowd'
  const uncertainMessage = !zone
    ? '本次无法确认推荐站位的位置，以下仅为保守建议。'
    : hazard === 'crowd'
      ? '这里是热门机位，人流较多，站位与构图可能需要现场灵活调整，注意避让行人。'
      : verifyUncertain
        ? '站位位置未经完整校验确认，以下建议仅供参考，建议现场确认脚下环境后调整。'
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
    hazard: hazard === 'none' ? undefined : hazard,
    confidence,
    planDirection: direction,
    source: 'ai',
  }
}

// ---------------------------------------------------------------- 风险文案

/** 一票否决类风险（站位本身不该站，二次校验判定后不给站位） */
const HAZARD_COPY: Record<'road' | 'cliff' | 'water', { message: string; notice: string }> = {
  road: {
    message: '推荐的位置在机动车道上，车辆通行时非常危险，不建议在此拍照。',
    notice: '请退到人行道内侧或离开车道后再拍，注意来往车辆。',
  },
  cliff: {
    message: '推荐的位置在高处边缘或护栏外，存在坠落风险，不建议在此拍照。',
    notice: '请退到护栏内、离边缘至少 2 米的安全位置。',
  },
  water: {
    message: '推荐的位置在湿滑礁石或水线边缘，存在落水风险，不建议在此拍照。',
    notice: '请退到有护栏的步道内侧，不要站在湿滑礁石或水边。',
  },
}

/** 邻近风险提醒（站位本身安全，但附近有危险元素 → 降级 + 强提醒） */
const HAZARD_WARN: Record<'road' | 'cliff' | 'water', { message: string; notice: string }> = {
  road: {
    message: '画面中有机动车通行，请在人行道或隔离带内侧拍摄，不要站到车道、路肩或斑马线上。',
    notice: '拍摄时注意来往车辆，尤其后退取景前先看清身后。',
  },
  cliff: {
    message: '附近有高处边缘，请站在护栏内侧或远离边缘 2 米以上的稳固地面拍摄。',
    notice: '不要为了取景翻越护栏或靠近边缘。',
  },
  water: {
    message: '站位临近水边，请在步道稳固处拍摄，不要站到湿滑礁石或水线边缘。',
    notice: '后退取景时注意脚下边缘，避免踩空。',
  },
}

/** 热门机位提示（降级但保留方案） */
const CROWD_NOTICE = '此处为热门机位，人流较多，注意避让行人并看管随身物品。'

/** 水边风险被降级（而非一票否决）时的补充提醒 */
const WATER_VETO_EXTRA = '水边湿滑，请勿站到礁石、滩涂或水线边缘，与水岸保持安全距离。'

function normalizeHazard(v: unknown): HazardType {
  return v === 'road' || v === 'cliff' || v === 'water' || v === 'crowd' ? v : 'none'
}

// ---------------------------------------------------------------- 透视比例

/**
 * 人物视觉高度（占画面高度百分比）。
 * 优先用模型按透视关系估算的 personScale；缺失时退回框高。
 */
function normalizePersonScale(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 2 || n > 60) return undefined
  return n
}

const aspectCache = new Map<string, number>()

async function imageAspect(dataUrl: string): Promise<number> {
  const cached = aspectCache.get(dataUrl)
  if (cached) return cached
  try {
    const img = await loadImage(dataUrl)
    const a = img.naturalWidth / img.naturalHeight || 1
    aspectCache.set(dataUrl, a)
    return a
  } catch {
    return 1
  }
}

/**
 * 透视修正（修复"站位框大小与照片视角不符"）：
 * 1. 框高以人物在该位置的视觉高度为准（近大远小）；
 * 2. 框宽按人体宽高比 × 图片宽高比换算，避免竖图被拉成方块；
 * 3. 框底边（脚部位置）保持不变，向上收放，站位仍然踩在同一块地面上；
 * 4. 物理上限兜底：站立人物高度 ≈ 1.13 ×（脚部位置 - 地平线），防止远景被画成巨人。
 */
const HORIZON_PCT = 40
const PERSON_ASPECT = 0.42 // 人体宽/高
async function fitPerspective(dataUrl: string, zone: Zone, personScale?: number): Promise<Zone> {
  const feet = zone.y + zone.h // 脚底位置（底边）
  const maxH = Math.min(55, Math.max(8, 1.25 * (feet - HORIZON_PCT)))
  let h = Math.min(Math.max(personScale ?? zone.h, 3), maxH)
  if (feet - h < 0) h = feet

  const aspect = await imageAspect(dataUrl)
  let w = (PERSON_ASPECT * h) / (aspect || 1)
  w = Math.min(Math.max(w, 2), 30)

  const cx = zone.x + zone.w / 2 // 保持原框水平中心
  const x = Math.min(Math.max(cx - w / 2, 0), Math.max(0, 100 - w))
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round((feet - h) * 10) / 10,
    w: Math.round(w * 10) / 10,
    h: Math.round(h * 10) / 10,
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
  aerial_view: {
    message: '这是一张空中或纯风景视角的照片，画面中没有人物可以站立的位置。',
    hint: '请站在景点前，把人物和脚下可站立的地面一起拍进画面。',
  },
  unreachable_view: {
    message: '这是从高处或隔着障碍物拍摄的远景，人物无法走进这个画面。',
    hint: '请让人物先站进画面，或后退一步把脚下可站立的平台一起拍进来。',
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
 * 轻量重试：只重新生成站位框，不重出整套建议文案。
 * 相比整体重跑（7-11s），本调用约 2-3s，重试期间的延迟代价大幅下降。
 */
const RETRY_ZONE_PROMPT = `你是摄影站位校对器。给定一张旅行照片和此前给出的站位区域（该区域未通过安全校验），请重新给出一个站位区域。要求：
- 新区域必须与水线边缘、机动车道、悬崖或高处边缘保持明显距离（画面中至少留出几步宽的安全缓冲），选在开阔、平整、干燥的步道/广场/平台地面中央，而不是贴近风险源的边角；
- 区域内人物可正常站立，且从拍摄这张照片的机位出发能直接走到（没有落差、水面、围栏等阻隔）；
- 优先选择靠近镜头的前景地面（画面下部 1/3）；
- 符合构图规律（如三分法），不遮挡主要景物；
- 使用百分比坐标 0-100，x/y 为区域左上角，w/h 为宽高。
只输出 JSON：{"zone": {"x": 数字, "y": 数字, "w": 数字, "h": 数字}}`

async function retryZoneOnly(dataUrl: string, why: string): Promise<Zone | undefined> {
  try {
    const modelId = await getImageModelId()
    let out = ''
    for await (const chunk of cloud.llm.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: RETRY_ZONE_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: `此前给出的站位区域未通过校验：${why}。请重新给出站位区域。` },
          ],
        },
      ],
      stream: true,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) out += delta
    }
    const raw = parseResult(out)
    const z = normalizeZone(raw.zone)
    if (!z || !isPlausibleZone(z)) return undefined
    return z
  } catch {
    return undefined // 重试通道失败 → 交给上层按原校验结论降级
  }
}

/**
 * 全图可站立性检查（仅当模型未给出可用站位框时调用）：
 * 纯天空、云海、航拍俯瞰、大面积水面等完全无可站立地面的照片 → false，
 * 判定 needs_new_photo，而不是输出"没有站位"的保守建议。
 */
async function checkHasGround(dataUrl: string): Promise<boolean> {
  try {
    const modelId = await getImageModelId()
    let out = ''
    for await (const chunk of cloud.llm.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: `你是图像可用性检查器。判断照片中是否存在人物实际可以站立、且从拍摄这张照片的机位出发能够走到并进入画面的地面：地面、步道、平台、台阶、草地、沙滩、水岸边等，且与机位之间没有明显落差或阻隔 → true；纯天空、云海、航拍或无人机俯瞰视角、大面积水面或海面、纯色背景等人物无处可站的画面 → false；从高处（阳台、山顶、观景台）俯拍远处地面、隔着栏杆/玻璃/水面向外拍摄的画面，即使能看到地面但人物无法就近走进画面 → false。树冠上、屋顶上、山顶悬空处不算。只输出 JSON：{"ground": true 或 false}`,
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: '请判断这张照片中是否存在人物可站立的真实地面。' },
          ],
        },
      ],
      stream: true,
      response_format: { type: 'json_object' },
      temperature: 0, // 检查器要的是确定性结论
    })) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) out += delta
    }
    const start = out.indexOf('{')
    const end = out.lastIndexOf('}')
    if (start < 0 || end <= start) return true // 输出不合法 → 放行
    const j = JSON.parse(out.slice(start, end + 1)) as { ground?: unknown }
    return j.ground !== false // 只有明确 false 才判无地面（保守放行原则）
  } catch {
    return true // 检查通道失败 → 放行，不阻断正常流程
  }
}

/**
 * 站位区域二次校验（独立调用）：
 * - standable（可站立）/ reachable（从机位可走到）：明确 false → 拦截
 * - safe 三档：ok（正常）/ warn（紧邻风险，降级提醒）/ veto（站位本身不该站，一票否决）
 * - sure=false（拿不准）或通道失败 → 放行但强制降级
 */
type SafeLevel = 'ok' | 'warn' | 'veto'

interface ZoneVerdict {
  standable: boolean
  reachable: boolean
  safe: SafeLevel
  /** 校验结论是否确定（false = 拿不准或通道失败 → 放行但需降级） */
  certain: boolean
  note?: string
}

const VERIFY_FAIL: ZoneVerdict = { standable: true, reachable: true, safe: 'ok', certain: false }

async function verifyZone(dataUrl: string, zone: Zone): Promise<ZoneVerdict> {
  try {
    const modelId = await getImageModelId()
    let out = ''
    for await (const chunk of cloud.llm.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'system',
          content: `你是图像区域安全校验器，负责校验给定照片中的一个站位区域（百分比坐标：x,y 为左上角，w,h 为宽高，均相对图片宽高，范围 0-100）。输出判定：
standable（人物能否站在此区域）：地面、平台、人行道、台阶、草地、沙滩、水岸边，或人物站在岸边/前景时在画面中的自然投影位置 → true；区域主要覆盖天空、云层、纯色背景、水面中央、悬崖斜坡等人物绝不可能出现的位置 → false。
reachable（人物能否从拍摄机位实际走到该区域）：与机位之间没有明显落差、水面、围栏、悬崖、河道等阻隔 → true；从高处俯拍的远处地面、隔水或隔栏的对面岸边、需要攀爬或绕远才能进入的位置 → false。
safe 三档判定（核心原则：warn 与 veto 的边界 = 区域内是否还存在正常可站立的平整地面）：
- "veto"：区域整体落在危险物上——机动车行车线以内、水中、礁石/滩涂上、悬崖悬空处、护栏外侧——区域内找不到任何可正常站立的平整地面。只要区域内还有一小块可站的平整地面，就不判 veto；
- "warn"：区域内可以正常站立，但紧邻危险元素——旁边车道有车辆通行、紧邻无护栏水边、靠近高处边缘。沿湖/沿海的步道、岸堤、广场（平整硬化地面）即使没有护栏、旁边就是水面，最高只判 warn，禁止判 veto；人行道、观景平台即使旁边有马路，最高只判 warn；
- "ok"：与危险元素有明确隔离或距离较远的正常拍摄位置。
sure：仅当判定都非常有把握时输出 true；有任何疑虑输出 false。
正常照片（人物将站在靠近镜头的前景地面附近）一律 standable=true、reachable=true、safe="ok"、sure=true。
只输出 JSON：{"standable": true, "reachable": true, "safe": "ok", "sure": true, "reason": "10字以内原因"}`,
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
    if (start < 0 || end <= start) return VERIFY_FAIL // 输出不合法 → 放行但降级
    const j = JSON.parse(out.slice(start, end + 1)) as {
      standable?: unknown
      reachable?: unknown
      safe?: unknown
      sure?: unknown
      reason?: unknown
    }
    const note = typeof j.reason === 'string' && j.reason.trim() ? j.reason.trim() : undefined
    const sure = j.sure !== false
    // 只有明确 false 才拦截 standable/reachable；safe 按三档处理
    if (j.standable === false) return { standable: false, reachable: false, safe: 'veto', certain: true, note }
    if (j.reachable === false) return { standable: true, reachable: false, safe: 'ok', certain: true, note }
    // veto 必须是"有把握"的结论：模型自己拿不准的 veto 降级为 warn（宁提醒、不误杀正常场景）
    let safe: SafeLevel = j.safe === 'veto' || j.safe === 'warn' ? j.safe : 'ok'
    if (safe === 'veto' && !sure) safe = 'warn'
    return { standable: true, reachable: true, safe, certain: sure, note }
  } catch {
    return VERIFY_FAIL // 校验通道失败 → 放行，不阻断正常流程，但强制降级
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
