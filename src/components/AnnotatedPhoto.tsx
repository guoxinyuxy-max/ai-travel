import type { Zone } from '@/data/types'
import { cn } from '@/lib/cn'

type ZoneVariant = 'normal' | 'uncertain' | 'danger'

/**
 * 可联动高亮的标注部件（对应结果页建议分段）。
 * 原图只画两件事：人物站位（框）、构图参考线；
 * 动作与拍摄建议只以文字形式呈现，不落到照片上。
 */
export type HighlightPart = 'zone' | 'lines' | null

interface Props {
  src: string
  zone?: Zone
  showLegend?: boolean
  /** 站位框形态：normal 常规；uncertain 虚线弱化（低置信）；danger 红色虚线（未验证安全） */
  variant?: ZoneVariant
  /** 当前高亮的标注部件；null 表示不高亮任何部件 */
  highlight?: HighlightPart
}

/**
 * 原图标注展示（APP 规格）：
 * - 人物推荐区域：白色圆角框，贴地、按透视比例，框上带「人物站位」文字标签
 * - 构图参考线：三分线，线下端带「构图线」文字标签
 *
 * 只有这两个部件会画在照片上；拍摄机位、动作等一律走文字建议，
 * 避免在原图上堆叠看不懂的箭头与扇形。
 */
export function AnnotatedPhoto({
  src,
  zone,
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

  // 站位框贴得太靠画面顶部时，标签收进框内，避免被裁切
  const labelInside = Boolean(zone && zone.y < 8)

  return (
    <div>
      <div className="relative overflow-hidden rounded-block">
        <img src={src} alt="带标注的环境照片" className="w-full" />

        {/* 构图参考线：三分线（＋线尾文字标注） */}
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
        {variant !== 'danger' && (
          <span
            className={cn(
              'absolute rounded-full px-1.5 py-0.5 text-[10px] whitespace-nowrap transition-all duration-300',
              highlight === 'lines'
                ? 'bg-white font-semibold text-ink-900'
                : 'bg-black/45 text-white/90',
              dim('lines') && 'opacity-20',
            )}
            style={{ left: '34.6%', bottom: '8.6%' }}
          >
            构图线
          </span>
        )}

        {/* 人物推荐区域（＋框上文字标注） */}
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
            {variant === 'danger' ? (
              <span
                className={cn(
                  'absolute left-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white',
                  labelInside ? 'top-1' : '-top-3',
                )}
              >
                ⚠ 未验证安全
              </span>
            ) : (
              <span
                className={cn(
                  'absolute left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-sm transition-all duration-300',
                  labelInside ? 'top-1' : '-top-3',
                  highlight === 'zone' ? 'bg-white text-ink-900' : 'bg-black/60 text-white',
                )}
              >
                {highlight === 'zone' ? '站这里' : '人物站位'}
              </span>
            )}
          </div>
        )}

        {/* 高亮态提示浮层 */}
        {anyHighlight && (
          <div className="pointer-events-none absolute top-2.5 left-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white">
            {highlight === 'zone' && '📍 人物推荐区域'}
            {highlight === 'lines' && 'GRID 构图参考线'}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-xs text-ink-500">
          <LegendItem label="人物推荐区域" active={highlight === 'zone'} />
          <LegendItem label="构图参考线" dashed active={highlight === 'lines'} />
        </div>
      )}
    </div>
  )
}

function LegendItem({
  label,
  dashed,
  active,
}: {
  label: string
  dashed?: boolean
  active?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 transition-colors',
        active && 'font-medium text-ink-900',
      )}
    >
      <span
        className={
          dashed
            ? 'inline-block h-0 w-4 border-t border-dashed border-ink-400'
            : 'inline-block size-2 rounded-sm border border-ink-400 bg-ink-150'
        }
      />
      {label}
    </span>
  )
}
