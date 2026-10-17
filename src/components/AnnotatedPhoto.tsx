import type { DirectionHint, Zone } from '@/data/types'
import { cn } from '@/lib/cn'

type ZoneVariant = 'normal' | 'uncertain' | 'danger'

/** 可联动高亮的标注部件（对应结果页建议卡片） */
export type HighlightPart = 'zone' | 'lines' | 'direction' | null

interface Props {
  src: string
  zone?: Zone
  direction?: DirectionHint
  showLegend?: boolean
  /** 站位框形态：normal 常规；uncertain 虚线弱化（低置信）；danger 红色虚线（未验证安全） */
  variant?: ZoneVariant
  /** 当前高亮的标注部件（点击建议卡片联动）；null 表示不高亮任何部件 */
  highlight?: HighlightPart
}

/**
 * 原图标注展示：在真实照片上叠加
 * 人物推荐区域 / 构图参考线（三分线）/ 拍摄方向提示。
 * 传入 highlight 时，被选中的部件保持醒目，其余部件淡出弱化。
 */
export function AnnotatedPhoto({
  src,
  zone,
  direction,
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

        {/* 拍摄方向提示 */}
        {direction && (
          <div
            className={cn(
              'absolute text-3xl font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.45)] transition-all duration-300',
              dim('direction') && 'opacity-20',
              highlight === 'direction' && 'scale-150',
            )}
            style={{
              left: `${direction.x}%`,
              top: `${direction.y}%`,
              transform: `rotate(${direction.rotate}deg)`,
            }}
          >
            ↗
          </div>
        )}

        {/* 高亮态提示浮层 */}
        {anyHighlight && (
          <div className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
            {highlight === 'zone' && '📍 人物推荐区域'}
            {highlight === 'lines' && 'GRID 构图参考线'}
            {highlight === 'direction' && '↗ 拍摄方向'}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-xs text-ink-500">
          <LegendItem label="人物推荐区域" active={highlight === 'zone'} />
          <LegendItem label="构图参考线" dashed active={highlight === 'lines'} />
          <LegendItem label="拍摄方向" arrow active={highlight === 'direction'} />
        </div>
      )}
    </div>
  )
}

function LegendItem({
  label,
  dashed,
  arrow,
  active,
}: {
  label: string
  dashed?: boolean
  arrow?: boolean
  active?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 transition-colors', active && 'font-medium text-ink-900')}>
      {arrow ? (
        <span className="text-sm leading-none text-ink-700">↗</span>
      ) : (
        <span
          className={
            dashed
              ? 'inline-block h-0 w-4 border-t border-dashed border-ink-400'
              : 'inline-block size-2 rounded-sm border border-ink-400 bg-ink-150'
          }
        />
      )}
      {label}
    </span>
  )
}
