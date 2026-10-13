import type { DirectionHint, Zone } from '@/data/types'

type ZoneVariant = 'normal' | 'uncertain' | 'danger'

interface Props {
  src: string
  zone?: Zone
  direction?: DirectionHint
  showLegend?: boolean
  /** 站位框形态：normal 常规；uncertain 虚线弱化（低置信）；danger 红色虚线（未验证安全） */
  variant?: ZoneVariant
}

/**
 * 原图标注展示：在真实照片上叠加
 * 人物推荐区域 / 构图参考线（三分线）/ 拍摄方向提示。
 */
export function AnnotatedPhoto({ src, zone, direction, showLegend = true, variant = 'normal' }: Props) {
  const zoneClass =
    variant === 'danger'
      ? 'absolute rounded-xl border-2 border-dashed border-red-500 bg-red-500/10 shadow-[0_0_0_1px_rgba(0,0,0,.15)]'
      : variant === 'uncertain'
        ? 'absolute rounded-xl border-2 border-dashed border-white/60 bg-white/10'
        : 'absolute rounded-xl border-2 border-white bg-white/15 shadow-[0_0_0_1px_rgba(0,0,0,.15)]'

  return (
    <div>
      <div className="relative overflow-hidden rounded-block">
        <img src={src} alt="带标注的环境照片" className="w-full" />

        {/* 构图参考线：三分线 */}
        <div className="absolute top-[8%] bottom-[8%] left-1/3 border-l border-dashed border-white/70" />
        <div className="absolute top-[8%] bottom-[8%] left-2/3 border-l border-dashed border-white/70" />

        {/* 人物推荐区域 */}
        {zone && (
          <div className={zoneClass} style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.w}%`,
              height: `${zone.h}%`,
            }}>
            {variant === 'danger' && (
              <span className="absolute -top-3 left-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white">
                ⚠ 未验证安全
              </span>
            )}
          </div>
        )}

        {/* 拍摄方向提示 */}
        {direction && (
          <div
            className="absolute text-3xl font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.45)]"
            style={{
              left: `${direction.x}%`,
              top: `${direction.y}%`,
              transform: `rotate(${direction.rotate}deg)`,
            }}
          >
            ↗
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-xs text-ink-500">
          <LegendItem label="人物推荐区域" />
          <LegendItem label="构图参考线" dashed />
          <LegendItem label="拍摄方向" arrow />
        </div>
      )}
    </div>
  )
}

function LegendItem({ label, dashed, arrow }: { label: string; dashed?: boolean; arrow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
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
