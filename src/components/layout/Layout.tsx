import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

/**
 * APP 外壳布局：
 * - 顶栏：返回键 + 居中页面名（刘海屏安全区适配）
 * - 内容：全局手机单列版式（宽屏也按 APP 规格居中，max-w-md）
 * - 主操作按钮由各页面固定贴底（.app-bottom-bar），内容区预留底部空间
 */
const TITLES: Record<string, string> = {
  '/': 'AI旅行拍照助手',
  '/task': '创建拍摄任务',
  '/analysis': 'AI 分析中',
  '/result': '拍摄方案',
  '/image-error': '无法分析',
}

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const hideBack = pathname === '/' || pathname === '/analysis'

  const handleBack = () => {
    // APP 返回语义 = 上一步：
    // 结果页/异常页返回 → 任务页（保留照片与拍摄方式，只回退步骤）；
    // 任务页返回 → 首页。
    navigate(pathname === '/' ? '/' : pathname === '/task' ? '/' : '/task')
  }

  return (
    <div className="min-h-dvh">
      <header className="app-safe-top sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="relative flex h-14 items-center px-3">
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
        </div>
      </header>

      {/* 手机单列：内容限宽居中；预留底部固定操作栏空间 */}
      <main className="mx-auto w-full max-w-md px-5 pt-5 pb-8">
        <Outlet />
      </main>
    </div>
  )
}

function cnBack() {
  return `grid size-9 place-items-center rounded-full transition-colors hover:bg-ink-100 disabled:invisible`
}

/**
 * APP 底部固定操作栏：主按钮贴底 + 安全区适配。
 * 用法：<BottomBar>…按钮…</BottomBar>；页面内容区需自行预留 pb-28 以上空间。
 */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bottom-bar">
      <div>{children}</div>
    </div>
  )
}
