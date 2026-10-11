import { readRecognitionEvent, formatElapsed, microphoneErrorMessage, captureSupport } from './liveCapture.js'
import {
  createLiveAnalysisQueue,
  mergeDetectedPatterns,
  emptyPatternState,
  riskPresentation,
  transcriptForAnalysis,
} from './liveAnalysis.js'
import { readRiskResponse } from './liveRisk.js'

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

function deferred() {
  let resolve
  let reject
  const promise = new Promise((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, resolve, reject }
}

const supportTarget = {
  SpeechRecognition: function SpeechRecognition() {},
  navigator: { mediaDevices: { getUserMedia() {} } },
}
assertEqual('capture support ready', captureSupport(supportTarget), 'ready')
assertEqual(
  'speech unsupported',
  captureSupport({ navigator: { mediaDevices: { getUserMedia() {} } } }),
  'speech-unsupported',
)
assertEqual('microphone unsupported', captureSupport({ webkitSpeechRecognition: function Recognition() {} }), 'microphone-unsupported')
assertEqual(
  'permission denied',
  microphoneErrorMessage({ name: 'NotAllowedError' }),
  'Microphone permission was denied. Allow microphone access and choose Start to try again.',
)
assertEqual('microphone missing', microphoneErrorMessage({ name: 'NotFoundError' }), 'No microphone was found on this device.')
assertEqual('elapsed', formatElapsed(4000), '00:04')
assertEqual('elapsed hour-long minutes', formatElapsed(75000), '01:15')

const recognition = readRecognitionEvent({
  resultIndex: 1,
  results: [
    { isFinal: true, 0: { transcript: 'already counted' } },
    { isFinal: false, 0: { transcript: 'hello from the bank' } },
  ],
})
assertEqual('interim is not final', recognition, { finals: [], interim: 'hello from the bank' })

const finalized = readRecognitionEvent({
  resultIndex: 0,
  results: [
    { isFinal: true, 0: { transcript: 'Hello, I am calling from your bank.' } },
    { isFinal: true, 0: { transcript: 'We noticed an unauthorized transaction.' } },
    { isFinal: false, 0: { transcript: 'you need to' } },
  ],
})
assertEqual('final segments stay separate from interim', finalized, {
  finals: ['Hello, I am calling from your bank.', 'We noticed an unauthorized transaction.'],
  interim: 'you need to',
})

assertEqual('low band', riskPresentation(18).level, 'Low')
assertEqual('moderate band', riskPresentation(30).level, 'Moderate')
assertEqual('high band', riskPresentation(60).level, 'High')
assertEqual('very high band', riskPresentation(80).level, 'Very High')

let modelRejected = false
try {
  readRiskResponse({ riskScore: 72, fraudProbability: 0.72, source: 'placeholder' })
} catch {
  modelRejected = true
}
assertEqual('rejects a score that is not from the trained model', modelRejected, true)
assertEqual(
  'accepts trained model payload',
  readRiskResponse({ riskScore: 72.4, fraudProbability: 0.724, source: 'scamtrail-trained-model' }),
  { fraudProbability: 0.724, riskScore: 72, source: 'scamtrail-trained-model' },
)

const calls = []
const timers = []
const queue = createLiveAnalysisQueue({
  debounceMs: 400,
  schedule(callback) {
    timers.push(callback)
    return timers.length
  },
  clear(id) {
    timers[id - 1] = null
  },
  analyze(snapshot) {
    const gate = deferred()
    calls.push({ text: snapshot.text, gate })
    return gate.promise
  },
})

queue.submit({ text: 'Speech: first' })
queue.submit({ text: 'Speech: first\n\nSpeech: second' })
assertEqual('debounce holds the burst', calls.length, 0)
timers[1]()
await Promise.resolve()
assertEqual('one analysis for the newest transcript', calls.map((call) => call.text), [
  'Speech: first\n\nSpeech: second',
])

queue.submit({ text: 'Speech: first\n\nSpeech: second\n\nSpeech: third' })
timers[2]()
await Promise.resolve()
assertEqual('second request waits until the first finishes', calls.length, 1)
calls[0].gate.resolve()
await new Promise((resolve) => setTimeout(resolve, 0))
assertEqual('queued analysis uses the newest transcript', calls.map((call) => call.text), [
  'Speech: first\n\nSpeech: second',
  'Speech: first\n\nSpeech: second\n\nSpeech: third',
])

const patterns = mergeDetectedPatterns(
  emptyPatternState(),
  [{ type: 'authority', messageIndex: 0, detail: 'The caller claims a bank role.' }],
  [{ text: 'Hello, I am calling from your bank.' }],
)
const kept = mergeDetectedPatterns(patterns, [])
assertEqual('detected pattern stays visible', kept.find((pattern) => pattern.id === 'authority').detected, true)
assertEqual(
  'evidence comes from the transcript segment',
  patterns.find((pattern) => pattern.id === 'authority').quote,
  'Hello, I am calling from your bank.',
)
assertEqual(
  'analysis text is finalized speech only',
  transcriptForAnalysis([
    { text: 'Hello, I am calling from your bank.' },
    { text: 'You need to verify your account immediately.' },
  ]),
  'Speech: Hello, I am calling from your bank.\n\nSpeech: You need to verify your account immediately.',
)

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('live session tests passed')
