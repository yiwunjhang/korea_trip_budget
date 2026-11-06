import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 相對路徑 base + router 的 hash 模式，可直接部署到 GitHub Pages 子路徑
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
})
