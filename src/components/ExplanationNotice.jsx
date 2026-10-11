import { EXPLANATION_QUOTA, EXPLANATION_UNAVAILABLE, FRAUD_DETECTION_ACTIVE } from '../services/analysisAvailability.js'

export default function ExplanationNotice({ quota = false, fraudDetectionActive = false }) {
  return (
    <div role="status">
      <p className="text-sm font-medium text-slate-950">{EXPLANATION_UNAVAILABLE}</p>
      {fraudDetectionActive ? <p className="mt-1 text-sm text-slate-700">{FRAUD_DETECTION_ACTIVE}</p> : null}
      {quota ? <p className="mt-1 text-xs text-slate-500">{EXPLANATION_QUOTA}</p> : null}
    </div>
  )
}
