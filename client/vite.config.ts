import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.3',
    port: 6050,
    proxy: {
      '/api': {
        target: 'http://127.0.0.3:6060',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.3',
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.3:6060',
        changeOrigin: true,
      },
    },
  },
})
