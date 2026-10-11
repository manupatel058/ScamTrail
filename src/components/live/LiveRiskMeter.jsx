function toneFor(tone) {
  if (tone === 'moderate') {
    return {
      card: 'border-amber-200',
      badge: 'bg-amber-50 text-amber-950 ring-amber-200',
      track: 'bg-amber-100',
      fill: 'bg-amber-500',
    }
  }
  if (tone === 'high' || tone === 'very_high') {
    return {
      card: 'border-rose-200',
      badge: 'bg-rose-50 text-rose-800 ring-rose-200',
      track: 'bg-rose-100',
      fill: 'bg-rose-600',
    }
  }
  return {
    card: 'border-stone-200',
    badge: 'bg-stone-100 text-slate-700 ring-stone-200',
    track: 'bg-stone-200',
    fill: 'bg-slate-500',
  }
}

export default function LiveRiskMeter({ score, level, tone = 'low', updating = false }) {
  const waiting = score == null
  const colors = toneFor(waiting ? 'low' : tone)

  return (
    <section className={`rounded-3xl border bg-white p-5 shadow-sm ${colors.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-slate-500">Fraud Risk</h2>
          <p className="mt-1 text-5xl font-semibold tracking-tight text-slate-950 tabular-nums sm:text-6xl">
            {waiting ? '—' : score}
            <span className="text-lg font-medium text-slate-400 sm:text-2xl">/100</span>
          </p>
          <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ring-1 ${colors.badge}`}>
            {waiting ? 'Waiting for speech' : level}
          </p>
        </div>
      </div>
      <div
        className={`mt-4 h-2.5 overflow-hidden rounded-full ${colors.track}`}
        role={waiting ? 'status' : 'meter'}
        aria-label="Fraud risk"
        aria-valuemin={waiting ? undefined : 0}
        aria-valuemax={waiting ? undefined : 100}
        aria-valuenow={waiting ? undefined : score}
      >
        <div className={`risk-meter-fill h-full rounded-full ${colors.fill}`} style={{ width: `${waiting ? 0 : score}%` }} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        ScamTrail identifies potential fraud signals in the conversation so far. This is not confirmation of fraud.
      </p>
      {updating ? <p className="mt-2 text-sm text-slate-500">Updating fraud risk…</p> : null}
    </section>
  )
}
