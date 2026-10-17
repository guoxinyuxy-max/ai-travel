import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { AnnotatedPhoto } from '@/components/AnnotatedPhoto'
import { BottomBar } from '@/components/layout/Layout'
import { Button } from '@/components/ui/Button'
import sampleScene from '@/assets/sample-scene.jpg'

const HOW = [
  { emoji: '📷', title: '上传当前环境', desc: '拍到景点主体和脚下空间' },
  { emoji: '👥', title: '选择谁来拍', desc: '同行帮拍或三脚架自拍' },
  { emoji: '✨', title: '按建议拍摄', desc: '站位、构图、动作一步到位' },
]

/**
 * 首页（APP 规格）：大标题 + 卡片流单列。
 * 示例图默认展示机位扇形标注，用于教学「AI 会标什么」。
 */
export function Home() {
  const navigate = useNavigate()

  return (
    <div className="pb-28">
      <div className="pt-4 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-[20px] bg-primary text-3xl">
          📷
        </div>
        <h1 className="mt-5 text-[28px] leading-tight font-bold">
          现场不知道
          <br />
          怎么拍？
        </h1>
        <p className="mx-auto mt-3 max-w-[300px] leading-relaxed text-ink-500">
          上传当前旅行环境，获得人物站位、构图、动作和拍摄提示。
        </p>
      </div>

      {/* 怎么用：三步说明 */}
      <div className="mt-6 grid grid-cols-3 gap-2 text-left">
        {HOW.map((s, i) => (
          <div key={s.title} className="rounded-card bg-ink-100 p-3">
            <span className="text-lg">{s.emoji}</span>
            <b className="mt-1 block text-xs">
              <span className="mr-1 text-ink-400">{i + 1}</span>
              {s.title}
            </b>
            <small className="mt-0.5 block text-[11px] leading-snug text-ink-400">{s.desc}</small>
          </div>
        ))}
      </div>

      {/* 示例效果（真实场景示例图 + 标注演示） */}
      <div className="mt-6 rounded-block bg-ink-100 p-4 text-left">
        <b className="text-sm">你会获得什么？</b>
        <div className="mt-3">
          <AnnotatedPhoto src={sampleScene} zone={{ x: 58, y: 46, w: 20, h: 30 }} />
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-500">
          AI 在原图标出推荐站位和构图参考线；站位、构图、动作、拍摄建议四条文字建议，点开就能逐条看。
        </p>
      </div>

      {/* 底部固定主按钮 */}
      <BottomBar>
        <Button onClick={() => navigate('/task')}>
          开始 AI 拍摄指导
          <ChevronRight className="ml-0.5 inline size-4" />
        </Button>
      </BottomBar>
    </div>
  )
}
