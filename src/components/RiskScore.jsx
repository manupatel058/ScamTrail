function toneFor(level) {
  if (level === 'Low') {
    return {
      card: 'border-stone-200',
      badge: 'bg-stone-100 text-slate-700 ring-stone-200',
      track: 'bg-stone-200',
      fill: 'bg-slate-500',
    }
  }
  if (level === 'Moderate') {
    return {
      card: 'border-amber-200',
      badge: 'bg-amber-50 text-amber-950 ring-amber-200',
      track: 'bg-amber-100',
      fill: 'bg-amber-500',
    }
  }
  return {
    card: 'border-rose-200',
    badge: 'bg-rose-50 text-rose-800 ring-rose-200',
    track: 'bg-rose-100',
    fill: 'bg-rose-600',
  }
}

export default function RiskScore({ score, level, summary, eyebrow = 'Manipulation pattern analysis' }) {
  const tone = toneFor(level)

  return (
    <section className={`rounded-3xl border bg-white p-5 shadow-sm sm:p-7 ${tone.card}`}>
      <p className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${tone.badge}`}>
        {level}
      </p>
      <p className="mt-4 text-6xl font-semibold tracking-tight text-slate-950 tabular-nums sm:text-7xl">
        {score}
        <span className="text-2xl font-medium text-slate-400 sm:text-3xl">/100</span>
      </p>
      <div
        className={`mt-4 h-2 overflow-hidden rounded-full ${tone.track}`}
        role="meter"
        aria-label={eyebrow}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
      >
        <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${score}%` }} />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{eyebrow}</p>
      {summary ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-700 sm:text-base">{summary}</p>
      ) : null}
    </section>
  )
}
