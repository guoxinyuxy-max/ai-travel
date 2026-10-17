import { useNavigate } from 'react-router-dom'
import { AnnotatedPhoto } from '@/components/AnnotatedPhoto'
import { Button } from '@/components/ui/Button'
import sampleScene from '@/assets/sample-scene.jpg'

const HOW = [
  { emoji: '📷', title: '上传当前环境', desc: '拍到景点主体和脚下空间' },
  { emoji: '👥', title: '选择谁来拍', desc: '同行帮拍或三脚架自拍' },
  { emoji: '✨', title: '按建议拍摄', desc: '站位、构图、动作一步到位' },
]

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
      {/* 左/上：价值主张 */}
      <div className="pt-8 text-center lg:pt-0 lg:text-left">
        <div className="mx-auto grid size-[68px] place-items-center rounded-[22px] bg-primary text-3xl lg:mx-0">
          📷
        </div>
        <h1 className="mt-6 text-[30px] leading-tight font-bold lg:text-4xl">
          现场不知道
          <br />
          怎么拍？
        </h1>
        <p className="mx-auto mt-4 max-w-[300px] leading-relaxed text-ink-500 lg:mx-0">
          上传当前旅行环境，获得人物站位、构图、动作和拍摄提示。
        </p>
        <div className="mt-6 lg:max-w-80">
          <Button onClick={() => navigate('/task')}>开始 AI 拍摄指导</Button>
        </div>

        {/* 怎么用：三步说明 */}
        <div className="mx-auto mt-6 grid max-w-80 grid-cols-3 gap-2 text-left lg:mx-0">
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
      </div>

      {/* 右/下：示例效果（真实场景示例图 + 标注演示） */}
      <div className="mt-9 rounded-block bg-ink-100 p-4 text-left lg:mt-0">
        <b className="text-sm">你会获得什么？</b>
        <div className="mt-3">
          <AnnotatedPhoto
            src={sampleScene}
            zone={{ x: 58, y: 46, w: 20, h: 30 }}
            direction={{ x: 24, y: 58, rotate: -14 }}
          />
        </div>
        <p className="mt-2.5 text-[13px] text-ink-500">
          AI 会在原图上标出推荐站位，并给出可以直接执行的拍摄提示。
        </p>
      </div>
    </div>
  )
}
