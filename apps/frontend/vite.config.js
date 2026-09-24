import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: true,   // 0.0.0.0 — доступно из локальной сети, не только localhost
    port: 3000,   // фронт на 3000
    proxy: {
      // /api уходит на локальный backend (node, порт 4000) — тот же путь, что и на бою
      '/api': 'http://localhost:4000',
    },
  },
})
