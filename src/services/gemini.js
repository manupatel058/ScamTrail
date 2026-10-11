import { parseConversation } from '../data/mockAnalysis.js'

const PATTERN_LABELS = {
  authority: 'Authority',
  fear_reward: 'Fear / Reward',
  urgency: 'Urgency',
  isolation: 'Isolation',
  sensitive_request: 'Sensitive Request',
  money_action: 'Money / Action',
}

function toView(transcript, payload) {
  const messages = parseConversation(transcript).map((message) => ({
    ...message,
    patterns: [],
  }))
  const patterns = (Array.isArray(payload?.patterns) ? payload.patterns : []).filter(
    (pattern) => PATTERN_LABELS[pattern?.type] && Number.isInteger(pattern.messageIndex),
  )

  for (const pattern of patterns) {
    const message = messages[pattern.messageIndex]
    const label = pattern.label || PATTERN_LABELS[pattern.type]
    if (!message || !label) continue
    if (!message.patterns.includes(label)) message.patterns.push(label)
    pattern.label = label
  }

  const safety = (Array.isArray(payload?.recommendations) ? payload.recommendations : [])
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4)

  let summary = String(payload?.summary || '').replace(/\s+/g, ' ').trim()
  if (!summary) {
    summary =
      patterns.length === 0
        ? 'This conversation shows few verified manipulation signals in the supplied text.'
        : 'These findings are manipulation risk signals in the supplied conversation. They are not proof of fraud.'
  }

  return {
    summary,
    stages: Object.keys(PATTERN_LABELS).map((type) => ({
      id: type,
      label: PATTERN_LABELS[type],
      detected: patterns.some((pattern) => pattern.type === type),
    })),
    patterns,
    messages,
    safety,
  }
}

export function explanationFailure(quota = false) {
  const error = new Error('Pattern explanation temporarily unavailable')
  error.explanationUnavailable = true
  error.quota = quota
  return error
}

export async function analyzeConversation(transcript) {
  const source = String(transcript || '').trim()
  if (!source) throw explanationFailure(false)

  let response
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversation: source }),
    })
  } catch {
    throw explanationFailure(false)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || !payload || payload.explanationUnavailable) {
    throw explanationFailure(response.status === 429)
  }
  return toView(source, payload)
}
