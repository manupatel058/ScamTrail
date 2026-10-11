import {
  EXPLANATION_QUOTA,
  availabilityView,
  createExplanationGate,
} from './analysisAvailability.js'
import { explanationFailure } from './gemini.js'

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

const bothOk = availabilityView({ riskOk: true, explanationOk: true })
assertEqual('risk succeeds and Gemini succeeds', bothOk, {
  fraudDetectionAvailable: true,
  explanationAvailable: true,
  showExplanationUnavailable: false,
  fraudDetectionActiveCopy: false,
  quotaNote: false,
  disableFurtherExplanations: false,
})

const quota = availabilityView({ riskOk: true, explanationOk: false, quota: true })
assertEqual('risk succeeds and Gemini returns 429', quota, {
  fraudDetectionAvailable: true,
  explanationAvailable: false,
  showExplanationUnavailable: true,
  fraudDetectionActiveCopy: true,
  quotaNote: true,
  disableFurtherExplanations: true,
})
assertEqual('quota note stays generic', EXPLANATION_QUOTA, 'The explanation service has reached its usage limit.')

const network = availabilityView({ riskOk: true, explanationOk: false, quota: false })
assertEqual('risk succeeds and Gemini network failure', network, {
  fraudDetectionAvailable: true,
  explanationAvailable: false,
  showExplanationUnavailable: true,
  fraudDetectionActiveCopy: true,
  quotaNote: false,
  disableFurtherExplanations: false,
})

const explanationOnly = availabilityView({ riskOk: false, explanationOk: true })
assertEqual('risk fails and Gemini succeeds', explanationOnly, {
  fraudDetectionAvailable: false,
  explanationAvailable: true,
  showExplanationUnavailable: false,
  fraudDetectionActiveCopy: false,
  quotaNote: false,
  disableFurtherExplanations: false,
})

const bothFailQuiet = availabilityView({ riskOk: false, explanationOk: false, quota: false, hasScore: false })
assertEqual('both fail without quota', bothFailQuiet.quotaNote, false)
assertEqual('both fail does not claim detection', bothFailQuiet.fraudDetectionActiveCopy, false)

const bothFail = availabilityView({ riskOk: false, explanationOk: false, quota: true, hasScore: false })
assertEqual('both fail', bothFail, {
  fraudDetectionAvailable: false,
  explanationAvailable: false,
  showExplanationUnavailable: true,
  fraudDetectionActiveCopy: false,
  quotaNote: true,
  disableFurtherExplanations: true,
})

const keptScore = availabilityView({ riskOk: false, explanationOk: false, hasScore: true })
assertEqual('a previous classifier score stays available', keptScore.fraudDetectionAvailable, true)
assertEqual('kept score still says detection is active', keptScore.fraudDetectionActiveCopy, true)

const gate = createExplanationGate()
assertEqual('explanations start enabled', gate.shouldRequest(), true)
gate.observe({ quota: false })
assertEqual('a network failure does not disable the session', gate.shouldRequest(), true)
gate.observe({ quota: true })
assertEqual('a 429 disables further explanation requests', gate.shouldRequest(), false)
gate.observe({ quota: false })
assertEqual('later failures stay disabled after quota', gate.disabled, true)
gate.reset()
assertEqual('a new session requests explanations again', gate.shouldRequest(), true)

const quotaError = explanationFailure(true)
assertEqual('quota failure stays a safe sentence', quotaError.message, 'Pattern explanation temporarily unavailable')
assertEqual('quota failure is marked', quotaError.quota, true)
assertEqual('quota failure has no raw provider text', quotaError.message.includes('RESOURCE_EXHAUSTED'), false)

const networkError = explanationFailure(false)
assertEqual('network failure is not treated as quota', networkError.quota, false)

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('analysis availability tests passed')
