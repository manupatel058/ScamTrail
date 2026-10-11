import { useCallback, useEffect, useRef, useState } from 'react'
import {
  captureSupport,
  formatElapsed,
  microphoneErrorMessage,
  readRecognitionEvent,
  speechErrorMessage,
  speechRecognitionConstructor,
} from '../services/liveCapture.js'

export function useSpeechRecognition({ onFinalSegment } = {}) {
  const onFinalRef = useRef(onFinalSegment)
  const recognitionRef = useRef(null)
  const streamRef = useRef(null)
  const listeningRef = useRef(false)
  const aliveRef = useRef(true)
  const endedRef = useRef(true)
  const requestRef = useRef(0)
  const startedAtRef = useRef(0)
  const pausedAccumRef = useRef(0)
  const pauseBeganRef = useRef(0)
  const [support] = useState(() => captureSupport())
  const [phase, setPhase] = useState('idle')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState('')
  const [microphoneActive, setMicrophoneActive] = useState(false)
  const [elapsedLabel, setElapsedLabel] = useState('00:00')

  useEffect(() => {
    onFinalRef.current = onFinalSegment
  }, [onFinalSegment])

  const elapsedMs = useCallback(() => {
    if (!startedAtRef.current) return 0
    const end = pauseBeganRef.current || Date.now()
    return Math.max(0, end - startedAtRef.current - pausedAccumRef.current)
  }, [])

  const publishElapsed = useCallback(() => {
    setElapsedLabel(formatElapsed(elapsedMs()))
  }, [elapsedMs])

  const releaseMic = useCallback(() => {
    const stream = streamRef.current
    streamRef.current = null
    stream?.getTracks().forEach((track) => {
      track.stop()
    })
    setMicrophoneActive(false)
  }, [])

  const freezeClock = useCallback(() => {
    if (!pauseBeganRef.current) pauseBeganRef.current = Date.now()
    publishElapsed()
  }, [publishElapsed])

  const resumeClock = useCallback(() => {
    if (!startedAtRef.current) startedAtRef.current = Date.now()
    if (pauseBeganRef.current) {
      pausedAccumRef.current += Date.now() - pauseBeganRef.current
      pauseBeganRef.current = 0
    }
    publishElapsed()
  }, [publishElapsed])

  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current
    const Recognition = speechRecognitionConstructor()
    if (!Recognition) return null

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      if (!aliveRef.current) return
      const { finals, interim } = readRecognitionEvent(event)
      setInterimTranscript(interim)
      if (finals.length === 0) return
      const stamp = formatElapsed(elapsedMs())
      for (const text of finals) onFinalRef.current?.(text, stamp)
      setInterimTranscript('')
    }

    recognition.onerror = (event) => {
      const code = event?.error || ''
      if (code === 'no-speech' || code === 'aborted') return
      listeningRef.current = false
      releaseMic()
      freezeClock()
      setInterimTranscript('')
      setError(speechErrorMessage(code))
      setPhase('stopped')
    }

    recognition.onend = () => {
      endedRef.current = true
      if (!listeningRef.current || !aliveRef.current) return
      window.setTimeout(() => {
        if (!listeningRef.current || !aliveRef.current) return
        try {
          endedRef.current = false
          recognition.start()
        } catch {
          endedRef.current = true
        }
      }, 250)
    }

    recognitionRef.current = recognition
    return recognition
  }, [elapsedMs, freezeClock, releaseMic])

  const stopRecognition = useCallback(() => {
    listeningRef.current = false
    endedRef.current = true
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      endedRef.current = true
    }
  }, [])

  const begin = useCallback(async () => {
    if (!aliveRef.current) return
    if (support === 'speech-unsupported') {
      setError('This browser does not support speech recognition, so live monitoring cannot start.')
      setPhase('idle')
      return
    }
    if (support === 'microphone-unsupported') {
      setError('This browser cannot access a microphone, so live monitoring cannot start.')
      setPhase('idle')
      return
    }

    const request = requestRef.current + 1
    requestRef.current = request
    setPhase('requesting')
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!aliveRef.current || request !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const recognition = ensureRecognition()
      if (!recognition) {
        releaseMic()
        setError('This browser does not support speech recognition, so live monitoring cannot start.')
        setPhase('idle')
        return
      }
      listeningRef.current = true
      resumeClock()
      try {
        recognition.start()
        endedRef.current = false
      } catch {
        endedRef.current = false
      }
      setMicrophoneActive(true)
      setPhase('listening')
    } catch (captureError) {
      if (!aliveRef.current || request !== requestRef.current) return
      listeningRef.current = false
      releaseMic()
      freezeClock()
      setError(microphoneErrorMessage(captureError))
      setPhase(startedAtRef.current ? 'stopped' : 'idle')
    }
  }, [ensureRecognition, freezeClock, releaseMic, resumeClock, support])

  const start = useCallback(() => {
    listeningRef.current = false
    begin()
  }, [begin])

  const pause = useCallback(() => {
    requestRef.current += 1
    if (!listeningRef.current && phase !== 'requesting') return
    stopRecognition()
    releaseMic()
    freezeClock()
    setInterimTranscript('')
    setPhase('paused')
  }, [freezeClock, phase, releaseMic, stopRecognition])

  const resume = useCallback(() => {
    if (listeningRef.current) return
    begin()
  }, [begin])

  const stop = useCallback(() => {
    requestRef.current += 1
    stopRecognition()
    releaseMic()
    freezeClock()
    setInterimTranscript('')
    setPhase('stopped')
  }, [freezeClock, releaseMic, stopRecognition])

  const reset = useCallback(() => {
    requestRef.current += 1
    stopRecognition()
    releaseMic()
    startedAtRef.current = 0
    pausedAccumRef.current = 0
    pauseBeganRef.current = 0
    setElapsedLabel('00:00')
    setInterimTranscript('')
    setError('')
    setPhase('idle')
  }, [releaseMic, stopRecognition])

  useEffect(() => {
    if (phase !== 'listening') return undefined
    publishElapsed()
    const timer = window.setInterval(publishElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [phase, publishElapsed])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      listeningRef.current = false
      const stream = streamRef.current
      streamRef.current = null
      stream?.getTracks().forEach((track) => track.stop())
      try {
        recognitionRef.current?.abort()
      } catch {
        endedRef.current = true
      }
    }
  }, [])

  return {
    support,
    phase,
    interimTranscript,
    error,
    microphoneActive,
    elapsedLabel,
    start,
    pause,
    resume,
    stop,
    reset,
  }
}
