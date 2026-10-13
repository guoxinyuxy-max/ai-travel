import { createHashRouter } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Home } from '@/pages/Home'
import { Task } from '@/pages/Task'
import { Analysis } from '@/pages/Analysis'
import { Result } from '@/pages/Result'
import { ImageError } from '@/pages/ImageError'
import { Insights } from '@/pages/Insights'

/**
 * 路由表 —— 与 docs/design-spec.md 页面清单 1:1 对应
 * 使用 Hash 路由：静态托管下刷新/直达子路由不会 404
 *
 * /insights 为使用数据看板，仅作者查看：
 * - 刻意不放进 Layout，也就不出现在产品导航里
 * - 自带 min-h-dvh 容器（不依赖产品页外壳），并带口令闸门
 */
export const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/task', element: <Task /> },
      { path: '/analysis', element: <Analysis /> },
      { path: '/result', element: <Result /> },
      { path: '/image-error', element: <ImageError /> },
    ],
  },
  {
    path: '/insights',
    element: (
      <div className="min-h-dvh bg-page">
        <main className="mx-auto w-full max-w-md px-5 py-8 lg:max-w-3xl">
          <Insights />
        </main>
      </div>
    ),
  },
])
