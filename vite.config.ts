import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 监听所有网卡（0.0.0.0），否则线上托管平台的反向代理访问不到；
    // 本地开发时用 127.0.0.1 访问即可，行为不变。
    host: true,
    // 端口优先取平台注入的 PORT 环境变量，本地默认 5173
    port: Number(process.env.PORT) || 5173,
    // 放开 Host 校验，避免平台域名被 Vite 以 "Blocked request" 拒绝
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
    allowedHosts: true,
  },
})
