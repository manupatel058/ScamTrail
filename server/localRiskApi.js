import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = path.join(root, 'ml', '.venv', 'bin', 'python')
const workerScript = path.join(root, 'ml', 'risk_worker.py')

function readBody(req) {
  if (req.body != null && req.body !== '') {
    if (typeof req.body === 'string') return Promise.resolve(JSON.parse(req.body))
    if (Buffer.isBuffer(req.body)) return Promise.resolve(JSON.parse(req.body.toString('utf8')))
    if (typeof req.body === 'object') return Promise.resolve(req.body)
  }

  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function createWorker() {
  const child = spawn(python, ['-u', workerScript], { cwd: root })
  let buffer = ''
  const waiters = []

  function fail(error) {
    while (waiters.length > 0) waiters.shift().reject(error)
    if (!child.killed) child.kill()
  }

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      const waiter = waiters.shift()
      if (!waiter || !line) continue
      try {
        waiter.resolve(JSON.parse(line))
      } catch (error) {
        waiter.reject(error)
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    const message = chunk.toString('utf8').trim()
    if (message) console.error('Local risk model:', message)
  })

  child.on('error', fail)
  child.on('close', () => {
    fail(new Error('The trained fraud-risk model stopped.'))
  })

  return {
    child,
    request(text) {
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject }
        waiters.push(waiter)
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter)
          if (index >= 0) waiters.splice(index, 1)
          reject(new Error('The trained fraud-risk model timed out.'))
          fail(new Error('The trained fraud-risk model timed out.'))
        }, 30000)
        waiter.resolve = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
        waiter.reject = (error) => {
          clearTimeout(timer)
          reject(error)
        }
        child.stdin.write(`${JSON.stringify({ text })}\n`)
      })
    },
  }
}

export function localRiskApi() {
  let worker = null
  let chain = Promise.resolve()

  function shutdown() {
    if (!worker) return
    worker.child.kill()
    worker = null
  }

  function score(text) {
    const job = chain.then(() => {
      if (!worker || worker.child.killed || worker.child.exitCode != null) {
        worker = createWorker()
      }
      return worker.request(text)
    })
    chain = job.then(
      () => {},
      () => {},
    )
    return job
  }

  return {
    name: 'scamtrail-local-risk',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('close', shutdown)

      server.middlewares.use('/api/risk', async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          sendJson(res, 405, { error: 'Method not allowed.' })
          return
        }

        if (!fs.existsSync(python) || !fs.existsSync(workerScript)) {
          sendJson(res, 503, {
            error: 'The local Python environment for the trained model was not found.',
          })
          return
        }

        let body
        try {
          body = await readBody(req)
        } catch {
          sendJson(res, 400, { error: 'Text is required.' })
          return
        }

        const text = body?.text
        if (typeof text !== 'string' || !text.trim()) {
          sendJson(res, 400, { error: 'Text is required.' })
          return
        }

        try {
          const result = await score(text.trim())
          if (result?.source !== 'scamtrail-trained-model') {
            sendJson(res, 502, {
              error: result?.error || 'The trained fraud-risk model could not score this transcript.',
            })
            return
          }
          sendJson(res, 200, result)
        } catch (error) {
          console.error('Local /api/risk failed:', error?.message || error)
          shutdown()
          sendJson(res, 502, {
            error: 'The trained fraud-risk model could not score this transcript.',
          })
        }
      })
    },
  }
}
