import { parseConversation } from '../data/mockAnalysis.js'
import { riskPresentation } from './liveAnalysis.js'

function safetyForTone(tone) {
  if (tone === 'very_high') {
    return [
      'Do not send money, passwords, or verification codes.',
      "Verify the request using the organization's official website, app, or phone number.",
    ]
  }
  if (tone === 'high') return ['High-risk manipulation pattern developing']
  return []
}

function trainedFields(trained) {
  const presentation = riskPresentation(trained.riskScore)
  return {
    scoreSource: 'scamtrail-trained-model',
    score: trained.riskScore,
    level: presentation.level,
    riskLevel: presentation.tone,
    scoringBreakdown: null,
    trainedModelUnavailable: false,
  }
}

export function buildPasteAnalysis({ transcript, trained = null, explanation = null, explanationError = null }) {
  const quota = Boolean(explanationError?.quota)

  if (!trained && !explanation) {
    return { status: 'unavailable', quota }
  }

  if (trained && explanation) {
    return {
      status: 'ready',
      analysis: {
        ...trainedFields(trained),
        summary: explanation.summary,
        stages: explanation.stages,
        patterns: explanation.patterns,
        messages: explanation.messages,
        safety: explanation.safety,
        recommendations: explanation.safety,
        explanationUnavailable: null,
      },
    }
  }

  if (trained) {
    const presentation = riskPresentation(trained.riskScore)
    return {
      status: 'ready',
      analysis: {
        ...trainedFields(trained),
        summary: 'Fraud detection is still active.',
        stages: [],
        patterns: [],
        messages: parseConversation(transcript).map((message) => ({ ...message, patterns: [] })),
        safety: safetyForTone(presentation.tone),
        recommendations: [],
        explanationUnavailable: { quota },
      },
    }
  }

  return {
    status: 'ready',
    analysis: {
      scoreSource: null,
      score: null,
      level: '',
      riskLevel: null,
      scoringBreakdown: null,
      trainedModelUnavailable: true,
      summary: explanation.summary,
      stages: explanation.stages,
      patterns: explanation.patterns,
      messages: explanation.messages,
      safety: explanation.safety,
      recommendations: explanation.safety,
      explanationUnavailable: null,
    },
  }
}
