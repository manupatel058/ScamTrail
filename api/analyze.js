import { GoogleGenAI, Type } from '@google/genai'
import { parseConversation } from '../src/data/mockAnalysis.js'

const MODEL = 'gemini-3.6-flash'

const PATTERN_LABELS = {
  authority: 'Authority',
  fear_reward: 'Fear / Reward',
  urgency: 'Urgency',
  isolation: 'Isolation',
  sensitive_request: 'Sensitive Request',
  money_action: 'Money / Action',
}

const PATTERN_TYPES = Object.keys(PATTERN_LABELS)

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        'Short explanation of the progression of risk signals. Do not claim the conversation is proven fraud or that a person is a scammer.',
    },
    patterns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            format: 'enum',
            enum: PATTERN_TYPES,
          },
          messageIndex: {
            type: Type.INTEGER,
            minimum: 0,
            description: 'Zero-based index of the numbered message with the strongest evidence.',
          },
          evidence: {
            type: Type.STRING,
            description: 'Short exact excerpt copied from that message. Do not paraphrase.',
          },
          explanation: {
            type: Type.STRING,
            description: 'One sentence explaining why that excerpt represents the pattern.',
          },
        },
        required: ['type', 'messageIndex', 'evidence', 'explanation'],
      },
    },
    recommendations: {
      type: Type.ARRAY,
      maxItems: '4',
      items: { type: Type.STRING },
      description: 'At most 4 concise, actionable safety steps.',
    },
  },
  required: ['summary', 'patterns', 'recommendations'],
  propertyOrdering: ['summary', 'patterns', 'recommendations'],
}

const systemInstruction = `You analyze a conversation for social-engineering and manipulation risk signals for ScamTrail.

The result is a set of risk signals. It is not proof that a person or conversation is fraudulent. Never say someone is a scammer, and never state that fraud is certain. Use language such as "warning signs", "suspicious pattern detected", and "high-risk manipulation pattern".

A legitimate conversation may contain an individual pattern, such as urgency. Do not flag a pattern unless the supplied text contains actual evidence. Do not invent evidence, quotes, or events.

Pattern types:
- authority: the sender claims authority, trust, institutional affiliation, expertise, support status, or another identity intended to increase trust.
- fear_reward: the sender introduces a threat, fear, consequence, prize, reward, or too-good-to-be-true opportunity.
- urgency: the sender pressures the user to act quickly or suggests there is limited time.
- isolation: the sender discourages independent verification, contacting others, contacting the real organization, or leaving the conversation.
- sensitive_request: the sender requests passwords, verification codes, login information, financial information, personal information, or other sensitive data.
- money_action: the sender requests payment, transfer, gift cards, cryptocurrency, purchases, or another consequential financial action.

Do not assign a numeric risk score or a risk level. A normal conversation with no meaningful manipulation signals gets an empty patterns array.

evidence must be a short exact excerpt copied from the numbered message. messageIndex is the zero-based number in brackets. explanation is one concise sentence. summary explains the pattern progression without claiming fraud is certain. recommendations contains at most 4 concise actions.`

function explanationStatus(error) {
  const status = Number(error?.status)
  if (status === 429) return 429
  const message = String(error?.message || '')
  if (message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429')) return 429
  return 503
}

export const maxDuration = 60

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function excerptCandidates(evidence) {
  const base = normalize(evidence)
    .replace(/^["']+|["']+$/g, '')
    .replace(/^(?:\.\.\.|…)\s*/, '')
    .replace(/\s*(?:\.\.\.|…)$/, '')
    .trim()

  if (!base) return []

  const pieces = base
    .split(/(?<=[.!?])\s+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= 12)

  return [...new Set([base, ...pieces])].filter((piece) => piece.length >= 8)
}

function matchesMessage(quote, message) {
  const text = normalize(message.text)
  const sender = normalize(message.sender)
  if (quote === sender) return false
  if (text.includes(quote)) return true

  const prefixed = normalize(`${message.sender}: ${message.text}`)
  return prefixed.includes(quote) && quote !== sender
}

function locateMessage(quote, messages, preferredIndex) {
  if (
    Number.isInteger(preferredIndex) &&
    messages[preferredIndex] &&
    matchesMessage(quote, messages[preferredIndex])
  ) {
    return preferredIndex
  }

  return messages.findIndex((message) => matchesMessage(quote, message))
}

function presentAnalysis(transcript, raw) {
  const messages = parseConversation(transcript).map((message) => ({
    ...message,
    patterns: [],
  }))
  const rawPatterns = Array.isArray(raw?.patterns) ? raw.patterns : []
  const accepted = []

  for (const pattern of rawPatterns) {
    if (!PATTERN_TYPES.includes(pattern?.type)) continue

    const quotes = excerptCandidates(pattern.evidence)
    if (quotes.length === 0) continue

    const preferredIndex = Number(pattern.messageIndex)
    let matchedIndex = -1
    for (const quote of quotes) {
      matchedIndex = locateMessage(quote, messages, preferredIndex)
      if (matchedIndex >= 0) break
    }
    if (matchedIndex < 0) continue

    const detail = String(pattern.explanation || '').replace(/\s+/g, ' ').trim()
    if (!detail) continue

    const label = PATTERN_LABELS[pattern.type]
    if (!messages[matchedIndex].patterns.includes(label)) {
      messages[matchedIndex].patterns.push(label)
    }

    accepted.push({
      type: pattern.type,
      messageIndex: matchedIndex,
      label,
      detail,
    })
  }

  accepted.sort((a, b) => a.messageIndex - b.messageIndex || a.label.localeCompare(b.label))

  let summary = String(raw?.summary || '').replace(/\s+/g, ' ').trim()
  if (accepted.length === 0 && (rawPatterns.length > 0 || !summary)) {
    summary = 'This conversation shows few verified manipulation signals in the supplied text.'
  }
  if (!summary) {
    summary =
      'These findings are manipulation risk signals in the supplied conversation. They are not proof of fraud.'
  }

  const seenDetails = new Set()
  const patterns = []
  for (const pattern of accepted) {
    const key = `${pattern.type}:${pattern.messageIndex}:${pattern.detail}`
    if (seenDetails.has(key)) continue
    seenDetails.add(key)
    patterns.push({
      type: pattern.type,
      messageIndex: pattern.messageIndex,
      label: pattern.label,
      detail: pattern.detail,
    })
  }

  const recommendations = (Array.isArray(raw?.recommendations) ? raw.recommendations : [])
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4)

  return { summary, patterns, recommendations }
}

function parseModelJson(text) {
  const trimmed = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  return JSON.parse(trimmed)
}

function redactKey(value, apiKey) {
  const text = String(value ?? '')
  return apiKey ? text.split(apiKey).join('[redacted]') : text
}

function logGeminiError(error, apiKey) {
  const message = redactKey(error?.message, apiKey)
  console.error('Gemini analysis failed:', message)
  console.error('Message:', message)
  console.error('Status:', error?.status)
  console.error('Code:', error?.code)
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

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

async function analyzeConversation(conversation, apiKey) {
  const messages = parseConversation(conversation)
  if (messages.length === 0) {
    const error = new Error('Conversation is required.')
    error.statusCode = 400
    throw error
  }

  const numbered = messages
    .map((message, index) => `[${index}] ${message.sender}: ${message.text}`)
    .join('\n\n')

  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Analyze this conversation for social engineering patterns.\n\n${numbered}`,
    config: {
      systemInstruction,
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema,
    },
  })

  const text = response.text
  console.log('Gemini raw response:', text)
  if (!text) throw new Error('Empty analysis')
  return presentAnalysis(conversation, parseModelJson(text))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch {
    sendJson(res, 400, { error: 'Conversation is required.' })
    return
  }

  const conversation = body?.conversation
  if (typeof conversation !== 'string' || !conversation.trim()) {
    sendJson(res, 400, { error: 'Conversation is required.' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('Gemini API key is missing. Set GEMINI_API_KEY in the server environment.')
    sendJson(res, 503, { explanationUnavailable: true })
    return
  }

  try {
    const analysis = await analyzeConversation(conversation.trim(), apiKey)
    sendJson(res, 200, analysis)
  } catch (error) {
    if (error?.statusCode === 400) {
      sendJson(res, 400, { error: 'Conversation is required.' })
      return
    }
    logGeminiError(error, apiKey)
    const status = explanationStatus(error)
    sendJson(res, status, { explanationUnavailable: true })
  }
}
