import { createHashRouter } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Home } from '@/pages/Home'
import { Task } from '@/pages/Task'
import { Analysis } from '@/pages/Analysis'
import { Result } from '@/pages/Result'
import { ImageError } from '@/pages/ImageError'

/**
 * 路由表 —— 与 docs/design-spec.md 页面清单 1:1 对应
 * 使用 Hash 路由：静态托管下刷新/直达子路由不会 404
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
])
