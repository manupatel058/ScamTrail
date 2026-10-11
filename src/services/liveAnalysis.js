export const LIVE_PATTERNS = [
  { id: 'authority', label: 'Authority' },
  { id: 'fear_reward', label: 'Fear / Reward' },
  { id: 'urgency', label: 'Urgency' },
  { id: 'isolation', label: 'Isolation' },
  { id: 'sensitive_request', label: 'Sensitive Request' },
  { id: 'money_action', label: 'Money / Action' },
]

export function emptyPatternState() {
  return LIVE_PATTERNS.map((pattern) => ({
    ...pattern,
    detected: false,
    quote: '',
    detail: '',
  }))
}

export function riskPresentation(score) {
  if (score <= 29) return { level: 'Low', tone: 'low' }
  if (score <= 59) return { level: 'Moderate', tone: 'moderate' }
  if (score <= 79) return { level: 'High', tone: 'high' }
  return { level: 'Very High', tone: 'very_high' }
}

export function transcriptForAnalysis(segments) {
  return segments
    .map((segment) => `Speech: ${String(segment?.text || '').replace(/\s+/g, ' ').trim()}`)
    .filter((line) => line !== 'Speech:')
    .join('\n\n')
}

export function mergeDetectedPatterns(current, incoming, segments = []) {
  const next = current.map((pattern) => ({ ...pattern }))
  for (const pattern of incoming || []) {
    const stage = next.find((item) => item.id === pattern?.type)
    if (!stage || stage.detected) continue
    const quote = String(segments[pattern.messageIndex]?.text || '').trim()
    stage.detected = true
    stage.quote = quote
    stage.detail = String(pattern.detail || '').trim()
  }
  return next
}

export function createLiveAnalysisQueue({
  analyze,
  debounceMs = 400,
  schedule = setTimeout,
  clear = clearTimeout,
}) {
  let timer = null
  let inflight = null
  let pending = null
  let closed = false

  function kick() {
    if (closed || inflight || pending == null) return
    const snapshot = pending
    pending = null
    inflight = Promise.resolve()
      .then(() => analyze(snapshot))
      .catch(() => {})
      .finally(() => {
        inflight = null
        if (!closed && pending != null) kick()
      })
  }

  return {
    submit(snapshot) {
      if (closed) return
      pending = snapshot
      if (timer != null) clear(timer)
      timer = schedule(() => {
        timer = null
        kick()
      }, debounceMs)
    },
    cancel() {
      closed = true
      if (timer != null) clear(timer)
      timer = null
      pending = null
    },
    get closed() {
      return closed
    },
  }
}
