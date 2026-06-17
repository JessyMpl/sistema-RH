import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite' // <-- 1. Importamos Tailwind

// https://vite.dev/config/
export default defineConfig({
  base: '/biometrico/',
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(), // <-- 2. Lo agregamos a los plugins
  ],
  server: {
    host: '0.0.0.0',
    port: 5175,
    allowedHosts: ['edomex-dtic.duckdns.org'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})