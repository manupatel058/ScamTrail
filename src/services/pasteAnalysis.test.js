import { calculateRisk } from './riskEngine.js'
import { readRiskResponse } from './liveRisk.js'
import { buildPasteAnalysis } from './pasteAnalysis.js'

let failed = 0

function assertEqual(name, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${same ? 'PASS' : 'FAIL'} ${name}`)
  if (!same) {
    console.log('  actual:  ', JSON.stringify(actual))
    console.log('  expected:', JSON.stringify(expected))
    failed += 1
  }
}

const transcript = 'Bank: Confirm the code today.\n\nMe: What code?'
const explanation = {
  summary: 'The sender pressures for a code.',
  stages: [{ id: 'urgency', label: 'Urgency', detected: true }],
  patterns: [{ type: 'urgency', messageIndex: 0, label: 'Urgency', detail: 'The sender sets a deadline.' }],
  messages: [{ sender: 'Bank', text: 'Confirm the code today.', patterns: ['Urgency'] }],
  safety: ['Pause before sending a code.'],
}
const trainedPayload = {
  source: 'scamtrail-trained-model',
  fraudProbability: 0.24,
  riskScore: 24,
}
const trained = readRiskResponse(trainedPayload)
const legacy = calculateRisk(explanation.patterns)

const bothOk = buildPasteAnalysis({ transcript, trained, explanation })
assertEqual('classifier and Gemini both succeed', bothOk.analysis.score, 24)
assertEqual('displayed score is the trained model', bothOk.analysis.scoreSource, 'scamtrail-trained-model')
assertEqual('Gemini patterns stay attached', bothOk.analysis.patterns[0].type, 'urgency')
assertEqual('legacy pattern score is not the displayed score', bothOk.analysis.score === legacy.riskScore, false)
assertEqual('legacy breakdown is not shown', bothOk.analysis.scoringBreakdown, null)
assertEqual('level comes from the trained score', bothOk.analysis.level, 'Low')

const quota = buildPasteAnalysis({
  transcript,
  trained,
  explanationError: { quota: true },
})
assertEqual('classifier succeeds and Gemini returns 429', quota.analysis.score, trained.riskScore)
assertEqual('429 keeps fraud detection active', quota.analysis.explanationUnavailable.quota, true)
assertEqual('429 does not invent patterns', quota.analysis.patterns.length, 0)

const network = buildPasteAnalysis({
  transcript,
  trained,
  explanationError: { quota: false },
})
assertEqual('classifier succeeds and Gemini network fails', network.analysis.score, 24)
assertEqual('network failure has no quota note', network.analysis.explanationUnavailable.quota, false)

const explanationOnly = buildPasteAnalysis({ transcript, explanation })
assertEqual('classifier fails and Gemini succeeds', explanationOnly.analysis.trainedModelUnavailable, true)
assertEqual('no substitute score is shown', explanationOnly.analysis.score, null)
assertEqual('explanation remains', explanationOnly.analysis.patterns.length, 1)
assertEqual('legacy score is not substituted', explanationOnly.analysis.score === legacy.riskScore, false)

const bothFail = buildPasteAnalysis({
  transcript,
  explanationError: { quota: true },
})
assertEqual('both fail', bothFail.status, 'unavailable')
assertEqual('both fail has no analysis', bothFail.analysis, undefined)

const liveScore = readRiskResponse(trainedPayload).riskScore
const pasteScore = buildPasteAnalysis({
  transcript,
  trained: readRiskResponse(trainedPayload),
  explanation,
}).analysis.score
assertEqual('same classifier payload gives live and paste the same score', liveScore, pasteScore)
assertEqual('a second read of the same payload matches', readRiskResponse(trainedPayload).riskScore, liveScore)

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('paste analysis tests passed')
