import { Camera } from 'lucide-react'
import type { DirectionHint, Zone } from '@/data/types'
import { cn } from '@/lib/cn'

type ZoneVariant = 'normal' | 'uncertain' | 'danger'

/** 可联动高亮的标注部件（对应结果页建议卡片/分段） */
export type HighlightPart = 'zone' | 'lines' | 'direction' | null

interface Props {
  src: string
  zone?: Zone
  /**
   * 拍摄机位提示：x/y 为机位锚点（拍摄者所在位置，通常在照片边缘）。
   * 渲染为「机位 → 站位」的视角扇形，仅在 highlight === 'direction' 时显示
   * （渐进披露：默认只显示站位框，避免无上下文的箭头造成困惑）；
   * 传 alwaysShowDirection 可常显（用于首页示例教学）。
   */
  direction?: DirectionHint
  alwaysShowDirection?: boolean
  showLegend?: boolean
  /** 站位框形态：normal 常规；uncertain 虚线弱化（低置信）；danger 红色虚线（未验证安全） */
  variant?: ZoneVariant
  /** 当前高亮的标注部件（点击建议卡/分段联动）；null 表示不高亮任何部件 */
  highlight?: HighlightPart
}

/**
 * 原图标注展示（APP 规格）：
 * - 人物推荐区域：白色圆角框，贴地、按透视比例
 * - 构图参考线：三分线
 * - 拍摄机位与朝向：从机位锚点指向站位中心的半透明扇形 + 相机标记
 *
 * 高亮联动：被选中的部件保持醒目，其余淡出。
 */
export function AnnotatedPhoto({
  src,
  zone,
  direction,
  alwaysShowDirection = false,
  showLegend = true,
  variant = 'normal',
  highlight = null,
}: Props) {
  const zoneClass =
    variant === 'danger'
      ? 'absolute rounded-xl border-2 border-dashed border-red-500 bg-red-500/10 shadow-[0_0_0_1px_rgba(0,0,0,.15)]'
      : variant === 'uncertain'
        ? 'absolute rounded-xl border-2 border-dashed border-white/60 bg-white/10'
        : 'absolute rounded-xl border-2 border-white bg-white/15 shadow-[0_0_0_1px_rgba(0,0,0,.15)]'

  const dim = (part: Exclude<HighlightPart, null>) => highlight !== null && highlight !== part
  const anyHighlight = highlight !== null
  const showFan = Boolean(direction && zone && (alwaysShowDirection || highlight === 'direction'))

  // 视角扇形几何：机位锚点 → 站位中心，按站位框尺寸展开视场角
  const fan = showFan && direction && zone ? fanGeometry(direction, zone) : null

  return (
    <div>
      <div className="relative overflow-hidden rounded-block">
        <img src={src} alt="带标注的环境照片" className="w-full" />

        {/* 构图参考线：三分线 */}
        {[-1, 1].map((i) => (
          <div
            key={i}
            className={cn(
              'absolute top-[8%] bottom-[8%] border-l border-dashed border-white/70 transition-all duration-300',
              dim('lines') && 'opacity-20',
              highlight === 'lines' && 'border-white top-[4%] bottom-[4%]',
            )}
            style={{ left: i === 1 ? '33.3%' : '66.6%' }}
          />
        ))}

        {/* 拍摄机位与朝向：扇形 + 相机标记（渐进披露） */}
        {fan && direction && (
          <>
            <svg
              className="absolute inset-0 h-full w-full transition-opacity duration-300"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ opacity: dim('direction') ? 0.2 : 1 }}
            >
              <defs>
                <linearGradient id="fan-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.06)" />
                </linearGradient>
              </defs>
              <polygon
                points={`${fan.apex.x},${fan.apex.y} ${fan.edge1.x},${fan.edge1.y} ${fan.edge2.x},${fan.edge2.y}`}
                fill="url(#fan-grad)"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="0.5"
                strokeDasharray="2 1.6"
              />
              {/* 机位 → 站位中心的视线虚线 */}
              <line
                x1={fan.apex.x}
                y1={fan.apex.y}
                x2={fan.center.x}
                y2={fan.center.y}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="0.7"
                strokeDasharray="2.4 1.8"
              />
            </svg>
            {/* 机位相机标记 */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
              style={{
                left: `${direction.x}%`,
                top: `${direction.y}%`,
                opacity: dim('direction') ? 0.2 : 1,
              }}
            >
              <span className="grid size-7 place-items-center rounded-full bg-white text-ink-900 shadow-md ring-1 ring-black/10">
                <Camera className="size-4" />
              </span>
              <span className="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] whitespace-nowrap text-white">
                拍摄者在这边
              </span>
            </div>
          </>
        )}

        {/* 人物推荐区域 */}
        {zone && (
          <div
            className={cn(
              zoneClass,
              'transition-all duration-300',
              dim('zone') && 'opacity-25',
              highlight === 'zone' && variant !== 'danger' && 'border-[3px] bg-white/25',
              highlight === 'zone' && variant === 'danger' && 'bg-red-500/20',
            )}
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.w}%`,
              height: `${zone.h}%`,
            }}
          >
            {variant === 'danger' && (
              <span className="absolute -top-3 left-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white">
                ⚠ 未验证安全
              </span>
            )}
            {highlight === 'zone' && variant !== 'danger' && (
              <span className="absolute -top-3 left-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink-900 shadow-sm">
                站这里
              </span>
            )}
          </div>
        )}

        {/* 高亮态提示浮层 */}
        {anyHighlight && (
          <div className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
            {highlight === 'zone' && '📍 人物推荐区域'}
            {highlight === 'lines' && 'GRID 构图参考线'}
            {highlight === 'direction' && '📷 拍摄机位与朝向'}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-xs text-ink-500">
          <LegendItem label="人物推荐区域" active={highlight === 'zone'} />
          <LegendItem label="构图参考线" dashed active={highlight === 'lines'} />
          <LegendItem label="拍摄机位与朝向" camera active={highlight === 'direction'} />
        </div>
      )}
    </div>
  )
}

/**
 * 视角扇形几何（百分比坐标，preserveAspectRatio="none" 下直接用 0-100 值）：
 * - apex：机位锚点（clamp 到画面内）
 * - edge1/edge2：站位中心两侧的扇形边（视场角随站位框大小自适应）
 */
function fanGeometry(direction: DirectionHint, zone: Zone) {
  const clamp = (v: number) => Math.min(99, Math.max(1, v))
  const apex = { x: clamp(direction.x), y: clamp(direction.y) }
  const center = {
    x: clamp(zone.x + zone.w / 2),
    y: clamp(zone.y + zone.h / 2),
  }
  // 站位框对角线的一半决定扇形展开角（模拟近大远小的视场）
  const halfDiag = Math.hypot(zone.w, zone.h) / 2 + 4
  const dx = center.x - apex.x
  const dy = center.y - apex.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // 垂直方向展开
  const px = -uy
  const py = ux
  const spread = Math.min(halfDiag, len * 0.55) // 扇形不超过视线长度的 55%
  return {
    apex,
    center,
    edge1: {
      x: clamp(center.x + px * spread - ux * 2),
      y: clamp(center.y + py * spread - uy * 2),
    },
    edge2: {
      x: clamp(center.x - px * spread - ux * 2),
      y: clamp(center.y - py * spread - uy * 2),
    },
  }
}

function LegendItem({
  label,
  dashed,
  camera,
  active,
}: {
  label: string
  dashed?: boolean
  camera?: boolean
  active?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 transition-colors', active && 'font-medium text-ink-900')}>
      {camera ? (
        <Camera className="size-3 text-ink-700" />
      ) : dashed ? (
        <span className="inline-block h-0 w-4 border-t border-dashed border-ink-400" />
      ) : (
        <span className="inline-block size-2 rounded-sm border border-ink-400 bg-ink-150" />
      )}
      {label}
    </span>
  )
}
