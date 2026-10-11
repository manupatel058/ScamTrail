import { useEffect, useRef, useState } from 'react'
import { demoScenarios } from '../data/demoScenarios'
import { parseConversation } from '../data/mockAnalysis'
import { createExplanationGate } from '../services/analysisAvailability'
import ExplanationNotice from './ExplanationNotice'
import { analyzeConversation } from '../services/gemini'
import { calculateRisk } from '../services/riskEngine'

const STEP_MS = 2000
const RISE_MS = 2500

const LEVEL_LABELS = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very High Risk',
}

const PATTERN_STAGES = [
  { id: 'authority', label: 'Authority' },
  { id: 'fear_reward', label: 'Fear / Reward' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'isolation', label: 'Isolation' },
  { id: 'sensitive_request', label: 'Sensitive Request' },
  { id: 'money_action', label: 'Money / Action' },
]

const SCRIPT = parseConversation(demoScenarios.find((scenario) => scenario.id === 'bank').conversation)

function transcriptFor(messages) {
  return messages.map((message) => `${message.sender}: ${message.text}`).join('\n\n')
}

function createDelay(ms) {
  let settled = false
  let timer
  let finish
  const promise = new Promise((resolve) => {
    finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    timer = setTimeout(() => finish(true), ms)
  })
  return { promise, cancel: () => finish(false) }
}

function toneFor(level) {
  if (level === 'Moderate') return 'border-amber-200'
  if (level === 'High' || level === 'Very High Risk') return 'border-rose-200'
  return 'border-stone-200'
}

export default function LiveDemo({ onViewFullAnalysis }) {
  const [status, setStatus] = useState('idle')
  const [revealed, setRevealed] = useState([])
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState('Low')
  const [stages, setStages] = useState(PATTERN_STAGES.map((stage) => ({ ...stage, detected: false })))
  const [patterns, setPatterns] = useState([])
  const [rising, setRising] = useState(false)
  const [notice, setNotice] = useState(null)
  const [canViewFull, setCanViewFull] = useState(false)

  const tokenRef = useRef(0)
  const statusRef = useRef('idle')
  const nextIndexRef = useRef(0)
  const inflightRef = useRef(null)
  const loopRef = useRef(false)
  const delayRef = useRef(null)
  const scoreRef = useRef(0)
  const finalRef = useRef(null)
  const noteTimerRef = useRef(null)
  const endRef = useRef(null)
  const gateRef = useRef(createExplanationGate())

  function syncStatus(next) {
    statusRef.current = next
    setStatus(next)
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [revealed.length])

  useEffect(() => {
    return () => {
      tokenRef.current += 1
      statusRef.current = 'idle'
      delayRef.current?.cancel()
      clearTimeout(noteTimerRef.current)
    }
  }, [])

  async function analyzeRevealed(messages, token) {
    if (!gateRef.current.shouldRequest()) return
    let result
    try {
      result = await analyzeConversation(transcriptFor(messages))
    } catch (error) {
      if (tokenRef.current !== token) return
      gateRef.current.observe(error)
      setNotice({
        quota: Boolean(error?.quota),
        fraudDetectionActive: finalRef.current != null,
      })
      return
    }
    if (tokenRef.current !== token) return
    const risk = calculateRisk(result.patterns)
    const nextLevel = LEVEL_LABELS[risk.riskLevel] || 'Low'
    const snapshot = {
      ...result,
      score: risk.riskScore,
      level: nextLevel,
      riskLevel: risk.riskLevel,
      scoringBreakdown: risk.scoringBreakdown,
      recommendations: result.safety,
    }
    finalRef.current = snapshot
    setCanViewFull(true)
    setScore(risk.riskScore)
    setLevel(nextLevel)
    setStages(result.stages)
    setPatterns(result.patterns)
    setNotice(null)
    if (risk.riskScore >= scoreRef.current + 5) {
      setRising(true)
      clearTimeout(noteTimerRef.current)
      noteTimerRef.current = setTimeout(() => setRising(false), RISE_MS)
    }
    scoreRef.current = risk.riskScore
  }

  async function run(token) {
    if (loopRef.current) return
    loopRef.current = true
    try {
      while (tokenRef.current === token && statusRef.current === 'running') {
        const index = nextIndexRef.current
        if (index >= SCRIPT.length) {
          if (inflightRef.current) await inflightRef.current
          if (tokenRef.current !== token || statusRef.current !== 'running') return
          syncStatus('complete')
          return
        }

        if (index > 0) {
          const delay = createDelay(STEP_MS)
          delayRef.current = delay
          const continued = await delay.promise
          if (delayRef.current === delay) delayRef.current = null
          if (!continued || tokenRef.current !== token || statusRef.current !== 'running') return
        }

        const message = SCRIPT[index]
        if (message.role !== 'user' && inflightRef.current) {
          await inflightRef.current
          if (tokenRef.current !== token || statusRef.current !== 'running') return
        }

        nextIndexRef.current = index + 1
        const nextRevealed = SCRIPT.slice(0, index + 1)
        setRevealed(nextRevealed)

        if (message.role !== 'user') {
          const task = analyzeRevealed(nextRevealed, token)
          inflightRef.current = task
          task.finally(() => {
            if (inflightRef.current === task) inflightRef.current = null
          })
        }
      }
    } finally {
      loopRef.current = false
    }
  }

  function start() {
    if (statusRef.current !== 'idle') return
    setNotice(null)
    syncStatus('running')
    run(tokenRef.current)
  }

  function pause() {
    if (statusRef.current !== 'running') return
    syncStatus('paused')
    delayRef.current?.cancel()
  }

  function resume() {
    if (statusRef.current !== 'paused') return
    syncStatus('running')
    if (!loopRef.current) run(tokenRef.current)
  }

  function reset() {
    tokenRef.current += 1
    nextIndexRef.current = 0
    scoreRef.current = 0
    finalRef.current = null
    delayRef.current?.cancel()
    clearTimeout(noteTimerRef.current)
    syncStatus('idle')
    setRevealed([])
    setScore(0)
    setLevel('Low')
    setStages(PATTERN_STAGES.map((stage) => ({ ...stage, detected: false })))
    setPatterns([])
    setRising(false)
    setNotice(null)
    gateRef.current.reset()
    setCanViewFull(false)
  }

  const highRisk = level === 'High' || level === 'Very High Risk'
  const buttonClass =
    'rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2'

  return (
    <div className="mt-8 min-w-0">
      <p className="mb-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-950 ring-1 ring-amber-200">
        Demo Conversation
      </p>
      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        This replays a saved example. It is not microphone audio and it does not use live speech recognition.
      </p>
      <section className={`rounded-3xl border bg-white p-5 shadow-sm sm:p-6 ${toneFor(level)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-500">Demo risk</h2>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950 tabular-nums">
              {score}
              <span className="text-lg font-medium text-slate-400">/100</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{level}</p>
          </div>
          {status === 'running' ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-600">
              <span className="h-2 w-2 rounded-full bg-rose-600" aria-hidden="true" />
              Replaying saved example
            </p>
          ) : null}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stages.map((stage) => (
            <li
              key={stage.id}
              className={`min-w-0 rounded-xl border px-3 py-2 text-xs font-semibold ${
                stage.detected
                  ? 'stage-detected border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-stone-200 bg-stone-50 text-stone-400'
              }`}
            >
              {stage.label}
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1" aria-live="polite">
          {rising ? <p className="text-sm font-medium text-rose-700">Risk increasing</p> : null}
          {highRisk ? (
            <p className="text-sm font-medium text-rose-800">High-risk manipulation pattern developing</p>
          ) : null}
          {status === 'complete' && !notice ? (
            <p className="text-sm font-medium text-slate-700">Conversation analysis complete</p>
          ) : null}
          {notice ? (
            <ExplanationNotice quota={notice.quota} fraudDetectionActive={notice.fraudDetectionActive} />
          ) : null}
        </div>
      </section>

      <section className="mt-4 min-w-0 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1" role="log" aria-label="Live conversation">
          {revealed.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm leading-relaxed text-slate-500">
              Messages from the bank example appear here one at a time.
            </p>
          ) : (
            revealed.map((message, index) => {
              const own = message.role === 'user'
              const badges = patterns.filter((pattern) => pattern.messageIndex === index)
              return (
                <article key={message.id} className={`flex min-w-0 flex-col ${own ? 'items-end' : 'items-start'}`}>
                  <p className={`mb-1 text-xs font-medium ${own ? 'text-slate-500' : 'text-slate-600'}`}>
                    {message.sender}
                  </p>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[75%] ${
                      own ? 'bg-slate-900 text-white' : 'border border-stone-200 bg-stone-50 text-slate-800'
                    }`}
                  >
                    {message.text}
                  </div>
                  {badges.length > 0 ? (
                    <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-1.5">
                      {badges.map((pattern) => (
                        <span
                          key={`${pattern.type}-${pattern.messageIndex}-${pattern.detail}`}
                          className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200"
                        >
                          {pattern.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              )
            })
          )}
          <div ref={endRef} />
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'idle' ? (
          <button
            type="button"
            onClick={start}
            className="w-full rounded-2xl bg-slate-900 px-5 py-3.5 text-base font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            Play Demo
          </button>
        ) : null}
        {status === 'running' ? (
          <button type="button" onClick={pause} className={buttonClass}>
            Pause
          </button>
        ) : null}
        {status === 'paused' ? (
          <button type="button" onClick={resume} className={buttonClass}>
            Resume
          </button>
        ) : null}
        {status !== 'idle' ? (
          <button type="button" onClick={reset} className={buttonClass}>
            Reset
          </button>
        ) : null}
        {status === 'complete' && canViewFull ? (
          <button
            type="button"
            onClick={() => onViewFullAnalysis(finalRef.current)}
            className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            View Full Analysis
          </button>
        ) : null}
      </div>
    </div>
  )
}
