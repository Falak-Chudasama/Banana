import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.4',
    port: 6050,
    allowedHosts: ['banana.jam', '127.0.0.4', 'api.banana.jam', 'banana.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.4:10000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.4',
    port: 4173,
    allowedHosts: ['banana.jam', '127.0.0.4', 'api.banana.jam', 'banana.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.4:10000',
        changeOrigin: true,
      },
    },
  },
})
