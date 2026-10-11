import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { localRiskApi } from './server/localRiskApi.js'

function localAnalyzeApi() {
  return {
    name: 'scamtrail-local-analyze',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir, '')
      if (!process.env.GEMINI_API_KEY && env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
      }

      server.middlewares.use('/api/analyze', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/analyze.js')
          await mod.default(req, res)
        } catch (error) {
          console.error('Local /api/analyze failed:', error?.message || error)
          if (!res.headersSent) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ explanationUnavailable: true }))
          }
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localAnalyzeApi(), localRiskApi()],
})
