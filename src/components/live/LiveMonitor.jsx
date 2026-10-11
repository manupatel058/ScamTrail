import { useEffect, useRef, useState } from 'react'
import { Mic, Shield } from 'lucide-react'
import { createExplanationGate } from '../../services/analysisAvailability.js'
import { analyzeConversation } from '../../services/gemini.js'
import {
  createLiveAnalysisQueue,
  emptyPatternState,
  mergeDetectedPatterns,
  riskPresentation,
  transcriptForAnalysis,
} from '../../services/liveAnalysis.js'
import { getLiveRisk } from '../../services/liveRisk.js'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js'
import LiveControls from './LiveControls.jsx'
import LiveRiskMeter from './LiveRiskMeter.jsx'
import LiveTranscript from './LiveTranscript.jsx'
import PatternProgression from './PatternProgression.jsx'

const MODEL_UNAVAILABLE = 'The trained fraud-risk model is unavailable in this session.'

export default function LiveMonitor({ autoStartToken = 0 }) {
  const [segments, setSegments] = useState([])
  const [patterns, setPatterns] = useState(emptyPatternState)
  const [risk, setRisk] = useState(null)
  const [riskError, setRiskError] = useState('')
  const [patternNotice, setPatternNotice] = useState(null)
  const [updatingRisk, setUpdatingRisk] = useState(false)
  const [updatingPatterns, setUpdatingPatterns] = useState(false)
  const segmentsRef = useRef([])
  const riskRef = useRef(null)
  const gateRef = useRef(createExplanationGate())
  const sessionRef = useRef(0)
  const queueRef = useRef(null)
  const analyzeRef = useRef(async () => {})
  const startedTokenRef = useRef(0)
  const segmentCountRef = useRef(0)

  analyzeRef.current = async (snapshot) => {
    if (!snapshot?.text || snapshot.session !== sessionRef.current) return
    const askExplanation = gateRef.current.shouldRequest()
    setUpdatingRisk(true)
    setUpdatingPatterns(askExplanation)
    const [riskResult, patternResult] = await Promise.allSettled([
      getLiveRisk(snapshot.text),
      askExplanation ? analyzeConversation(snapshot.text) : Promise.resolve(null),
    ])
    if (snapshot.session !== sessionRef.current) return

    if (riskResult.status === 'fulfilled') {
      riskRef.current = riskResult.value
      setRisk(riskResult.value)
      setRiskError('')
    } else {
      setRiskError(MODEL_UNAVAILABLE)
    }
    setUpdatingRisk(false)

    const fraudDetectionActive = riskResult.status === 'fulfilled' || riskRef.current != null
    if (!askExplanation) {
      setPatternNotice((current) => ({
        quota: current?.quota ?? true,
        fraudDetectionActive,
      }))
      setUpdatingPatterns(false)
      return
    }

    if (patternResult.status === 'fulfilled') {
      setPatterns((current) => mergeDetectedPatterns(current, patternResult.value.patterns, snapshot.segments))
      setPatternNotice(null)
    } else {
      gateRef.current.observe(patternResult.reason)
      setPatternNotice({
        quota: Boolean(patternResult.reason?.quota),
        fraudDetectionActive,
      })
    }
    setUpdatingPatterns(false)
  }

  const appendFinal = (text, elapsed) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim()
    if (!clean) return
    segmentCountRef.current += 1
    const next = [
      ...segmentsRef.current,
      { id: `speech-${segmentCountRef.current}`, elapsed, text: clean },
    ]
    segmentsRef.current = next
    setSegments(next)
    queueRef.current?.submit({
      text: transcriptForAnalysis(next),
      segments: next,
      session: sessionRef.current,
    })
  }

  const capture = useSpeechRecognition({ onFinalSegment: appendFinal })

  function makeQueue() {
    return createLiveAnalysisQueue({
      debounceMs: 400,
      analyze: (snapshot) => analyzeRef.current(snapshot),
    })
  }

  useEffect(() => {
    queueRef.current = makeQueue()
    return () => {
      sessionRef.current += 1
      queueRef.current?.cancel()
    }
  }, [])

  useEffect(() => {
    if (!autoStartToken || startedTokenRef.current === autoStartToken) return
    startedTokenRef.current = autoStartToken
    capture.start()
  }, [autoStartToken, capture.start])

  function newSession() {
    sessionRef.current += 1
    queueRef.current?.cancel()
    segmentsRef.current = []
    segmentCountRef.current = 0
    riskRef.current = null
    gateRef.current.reset()
    setSegments([])
    setPatterns(emptyPatternState())
    setRisk(null)
    setRiskError('')
    setPatternNotice(null)
    setUpdatingRisk(false)
    setUpdatingPatterns(false)
    capture.reset()
    queueRef.current = makeQueue()
  }

  const presentation = risk ? riskPresentation(risk.riskScore) : null
  const listening = capture.phase === 'listening' || capture.phase === 'requesting'
  const statusLabel =
    capture.phase === 'listening'
      ? segments.length === 0
        ? 'Listening for conversation...'
        : 'Listening'
      : capture.phase === 'requesting'
        ? 'Requesting microphone...'
        : capture.phase === 'paused'
          ? 'Paused'
          : capture.phase === 'stopped'
            ? 'Session stopped'
            : 'Ready'
  const microphoneLabel = capture.microphoneActive
    ? 'Microphone on'
    : capture.phase === 'requesting'
      ? 'Requesting microphone'
      : 'Microphone off'

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-10 space-y-3 bg-[#f6f5f2]/95 pb-1 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Shield size={16} aria-hidden="true" />
              <span className={`h-2.5 w-2.5 rounded-full ${capture.microphoneActive ? 'mic-live bg-rose-600' : 'bg-stone-300'}`} />
              Live Protection
            </p>
            <p className="mt-1 text-base text-slate-700" role="status">
              {statusLabel}
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums text-slate-500">{capture.elapsedLabel}</p>
        </div>
        <LiveRiskMeter
          score={risk?.riskScore ?? null}
          level={presentation?.level || ''}
          tone={presentation?.tone || 'low'}
          updating={updatingRisk}
        />
        {presentation?.tone === 'very_high' ? (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3" role="alert">
            <p className="text-sm font-semibold text-rose-950">Potential fraud pattern detected</p>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-rose-950">
              <li>Do not send money, passwords, or verification codes.</li>
              <li>Verify the request using the organization's official website, app, or phone number.</li>
            </ul>
          </div>
        ) : null}
        {presentation?.tone === 'high' ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900" role="alert">
            High-risk manipulation pattern developing
          </p>
        ) : null}
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <Mic size={15} aria-hidden="true" />
          <span>{microphoneLabel}</span>
        </p>
        {segments[segments.length - 1] ? (
          <p className="text-sm leading-relaxed text-slate-800 sm:hidden">
            Latest: “{segments[segments.length - 1].text}”
          </p>
        ) : null}
        {capture.error ? (
          <p className="text-sm leading-relaxed text-rose-800" role="alert">
            {capture.error}
          </p>
        ) : null}
        {riskError ? <p className="text-sm leading-relaxed text-slate-600">{riskError}</p> : null}
      </div>

      <LiveControls
        phase={capture.phase}
        hasSession={segments.length > 0 || risk != null}
        onStart={capture.start}
        onPause={capture.pause}
        onResume={capture.resume}
        onStop={capture.stop}
        onNewSession={newSession}
      />
      <PatternProgression patterns={patterns} updating={updatingPatterns} notice={patternNotice} />
      <LiveTranscript
        segments={segments}
        interimTranscript={capture.interimTranscript}
        listening={listening}
      />
      <p className="text-xs leading-relaxed text-slate-500">
        Microphone access begins only after you start a session. This browser may send audio to its speech-recognition
        service, and finalized text is sent for analysis.
      </p>
      {capture.support === 'speech-unsupported' ? (
        <p className="text-sm leading-relaxed text-rose-800">
          This browser does not support speech recognition, so live monitoring cannot start.
        </p>
      ) : null}
    </div>
  )
}
