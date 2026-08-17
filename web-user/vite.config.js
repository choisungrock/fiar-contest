// K-라이스페스타 평가자 웹앱의 PWA 및 React 빌드를 정의하는 설정 파일
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'K-Rice Festa 전문가 품평회 평가 시스템',
        short_name: 'K-Rice Festa 평가',
        description: '오프라인 환경을 지원하는 전문가 품평회 실시간 채점 시스템',
        theme_color: '#1b2a4a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    allowedHosts: ['.ricecontest.com', 'localhost', '127.0.0.1']
  }
})
