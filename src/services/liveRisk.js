export function readRiskResponse(payload) {
  if (!payload || payload.source !== 'scamtrail-trained-model') {
    throw new Error('The trained fraud-risk model is unavailable in this session.')
  }

  const fraudProbability = Number(payload.fraudProbability)
  const riskScore = Number(payload.riskScore)
  if (!Number.isFinite(fraudProbability) || !Number.isFinite(riskScore)) {
    throw new Error('The trained fraud-risk model is unavailable in this session.')
  }

  return {
    fraudProbability,
    riskScore: Math.max(0, Math.min(100, Math.round(riskScore))),
    source: 'scamtrail-trained-model',
  }
}

export async function getLiveRisk(transcript) {
  const text = String(transcript || '').trim()
  if (!text) throw new Error('The trained fraud-risk model is unavailable in this session.')

  let response
  try {
    response = await fetch('/api/risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    throw new Error('The trained fraud-risk model is unavailable in this session.')
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error('The trained fraud-risk model is unavailable in this session.')
  }

  return readRiskResponse(payload)
}
