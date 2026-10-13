import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export function Home() {
  const navigate = useNavigate()

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
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
      </div>

      {/* 右/下：示例效果 */}
      <div className="mt-9 rounded-block bg-ink-100 p-4 text-left lg:mt-0">
        <b className="text-sm">你会获得什么？</b>
        <div className="relative mt-3 h-40 overflow-hidden rounded-xl bg-gradient-to-br from-[#cadce7] to-[#7994a4]">
          <div className="absolute right-10 bottom-6 h-[76px] w-11 rounded-[10px] border-2 border-white bg-white/12" />
          <div className="absolute top-1/2 right-3 left-3 border-t border-dashed border-white/90" />
        </div>
        <p className="mt-2.5 text-[13px] text-ink-500">
          AI 会在原图上标出推荐站位，并给出可以直接执行的拍摄提示。
        </p>
      </div>
    </div>
  )
}
