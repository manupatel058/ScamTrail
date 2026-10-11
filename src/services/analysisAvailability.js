export const EXPLANATION_UNAVAILABLE = 'Pattern explanation temporarily unavailable'
export const FRAUD_DETECTION_ACTIVE = 'Fraud detection is still active.'
export const EXPLANATION_QUOTA = 'The explanation service has reached its usage limit.'

export function createExplanationGate() {
  let disabled = false
  return {
    shouldRequest() {
      return !disabled
    },
    observe(error) {
      if (error?.quota) disabled = true
    },
    reset() {
      disabled = false
    },
    get disabled() {
      return disabled
    },
  }
}

export function availabilityView({ riskOk, explanationOk, quota = false, hasScore = false }) {
  const fraudDetectionAvailable = Boolean(riskOk || hasScore)
  return {
    fraudDetectionAvailable,
    explanationAvailable: Boolean(explanationOk),
    showExplanationUnavailable: !explanationOk,
    fraudDetectionActiveCopy: !explanationOk && fraudDetectionAvailable,
    quotaNote: !explanationOk && Boolean(quota),
    disableFurtherExplanations: Boolean(quota),
  }
}
