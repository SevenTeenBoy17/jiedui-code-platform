import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: {
    host: '127.0.0.1',
    port: 5273,
    proxy: {
      // S1 后段接入真实 FastAPI 后端时启用
      // 后端口 12210：原 9099 于 2026-07-28 落进 Windows 动态端口排除区间（9010-9109，
      // Hyper-V 重启后会漂移；9000-9740 一带已被多段占用），迁到远离漂移带的高位端口。
      '/api': { target: 'http://localhost:12210', changeOrigin: true },
    },
  },
  build: {
    // 防回退门禁：monaco 单独豁免——它是编辑器本体；其余 chunk 超 600KB 说明有包级 import 泄漏
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * 函数式分包（V6 性能）。
         * 对象式 `manualChunks: { monaco: [...] }` 会把重库提成**入口级** chunk，
         * 导致 index.html 给 monaco(3.1MB) 打 modulepreload —— 学生只开对话页也白下 3MB。
         * 改为函数式：只按 node_modules 归组，动态 import 的边界自然生效，重库随用随载。
         */
        manualChunks(id) {
          // 只固定极小的框架层；monaco/blockly/echarts **不手工归组**，
          // 交给动态 import 边界自然切分，避免被提升进入口 chunk。
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](vue|vue-router|pinia|@vue)[\\/]/.test(id)) return 'vendor'
        },
      },
    },
  },
})
