import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Make Local dev flow passes PORT via the environment (see .figma/make/env).
const PORT = Number(process.env.PORT) || 4180

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: PORT,
    strictPort: true,
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Carbon's Sass still uses some legacy APIs; silence that upstream noise
        // so our own build output stays readable.
        quietDeps: true,
        silenceDeprecations: ['mixed-decls', 'global-builtin', 'import', 'legacy-js-api'],
      },
    },
  },
})
