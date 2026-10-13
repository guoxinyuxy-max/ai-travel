import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/**
 * 线性流程布局：顶栏（返回键 + 居中标题）+ 内容容器。
 * 移动优先；PC 内容限宽居中（部分页面内部再做两栏）。
 */
const TITLES: Record<string, string> = {
  '/': 'AI旅行拍照助手',
  '/task': '创建拍摄任务',
  '/analysis': 'AI 分析中',
  '/result': '推荐拍摄方案',
  '/image-error': '无法分析',
}

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const hideBack = pathname === '/' || pathname === '/analysis'

  const handleBack = () => {
    // 结果页返回 = 修改拍摄条件（保留照片与状态）；其余沿流程回退
    navigate(pathname === '/result' || pathname === '/image-error' ? '/task' : '/')
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-ink-200 bg-white px-3">
        <button
          onClick={handleBack}
          aria-label="返回"
          className={cnBack()}
          disabled={hideBack}
        >
          <ChevronLeft className="size-6" />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-bold whitespace-nowrap">
          {TITLES[pathname] ?? 'AI旅行拍照助手'}
        </span>
      </header>

      <main className="mx-auto w-full max-w-md px-5 pt-5 pb-12 lg:max-w-4xl">
        <Outlet />
      </main>
    </div>
  )
}

function cnBack() {
  return `grid size-9 place-items-center rounded-full transition-colors hover:bg-ink-100 disabled:invisible`
}
