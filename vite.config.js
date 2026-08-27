/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
  },
  test: {
    // jsdom para poder montar componentes de React en las pruebas
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // `functions/` entra para poder testear la lógica pura de las Cloud
    // Functions (p. ej. scheduledMaintenanceCore.js) sin desplegar.
    include: [
      'src/**/*.{test,spec}.{js,jsx}',
      'functions/*.{test,spec}.js',
    ],
    // No usar modo watch dentro de automatizaciones: el script `test` usa `vitest run`.
    watch: false,
  },
})
