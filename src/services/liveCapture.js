export function captureSupport(target = globalThis) {
  const speech = Boolean(target.SpeechRecognition || target.webkitSpeechRecognition)
  const microphone = Boolean(target.navigator?.mediaDevices?.getUserMedia)
  if (!speech) return 'speech-unsupported'
  if (!microphone) return 'microphone-unsupported'
  return 'ready'
}

export function speechRecognitionConstructor(target = globalThis) {
  return target.SpeechRecognition || target.webkitSpeechRecognition || null
}

export function microphoneErrorMessage(error) {
  const name = error?.name || error?.error || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError' || name === 'not-allowed' || name === 'service-not-allowed') {
    return 'Microphone permission was denied. Allow microphone access and choose Start to try again.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'audio-capture') {
    return 'No microphone was found on this device.'
  }
  if (name === 'NotSupportedError' || name === 'not-supported') {
    return 'This browser cannot access a microphone, so live monitoring cannot start.'
  }
  return 'Microphone unavailable. Live monitoring did not start.'
}

export function speechErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Speech recognition permission was denied.'
  }
  if (code === 'audio-capture') return 'No microphone was found on this device.'
  if (code === 'network') return 'Speech recognition could not reach its transcription service.'
  if (code === 'language-not-supported') return 'This browser cannot transcribe English speech.'
  return 'Speech recognition stopped.'
}

export function readRecognitionEvent(event) {
  const finals = []
  let interim = ''
  const results = event?.results
  if (!results) return { finals, interim }

  const start = Number.isInteger(event.resultIndex) ? event.resultIndex : 0
  for (let index = start; index < results.length; index += 1) {
    const result = results[index]
    const text = String(result?.[0]?.transcript || '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (result.isFinal) finals.push(text)
    else interim = `${interim} ${text}`.trim()
  }

  return { finals, interim }
}

export function formatElapsed(milliseconds) {
  const total = Math.max(0, Math.floor(Number(milliseconds) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
