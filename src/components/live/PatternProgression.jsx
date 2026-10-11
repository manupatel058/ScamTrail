import ExplanationNotice from '../ExplanationNotice.jsx'

export default function PatternProgression({ patterns, updating = false, notice = null }) {
  const detected = patterns.some((pattern) => pattern.detected)

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">Manipulation patterns</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        Gemini explains warning signs in the finalized transcript. These signals are not confirmation of fraud.
      </p>
      {notice ? (
        <div className="mt-4">
          <ExplanationNotice quota={notice.quota} fraudDetectionActive={notice.fraudDetectionActive} />
        </div>
      ) : null}
      {detected || !notice ? (
      <ul className="mt-4 space-y-2">
        {patterns.map((pattern) => (
          <li
            key={pattern.id}
            className={`rounded-2xl border px-3 py-3 ${
              pattern.detected
                ? 'stage-detected border-rose-200 bg-rose-50 text-rose-950'
                : 'border-stone-200 bg-stone-50 text-stone-400'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className={`text-sm font-semibold ${pattern.detected ? 'text-rose-950' : 'text-stone-400'}`}>
                {pattern.label}
              </p>
              <p className="text-[11px] font-semibold tracking-wide uppercase">
                {pattern.detected ? 'Detected' : 'Not seen'}
              </p>
            </div>
            {pattern.detected && pattern.quote ? (
              <p className="mt-2 text-sm leading-relaxed text-rose-950">“{pattern.quote}”</p>
            ) : null}
            {pattern.detected && pattern.detail ? (
              <p className="mt-1 text-sm leading-relaxed text-rose-900">{pattern.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
      ) : null}
      {updating ? <p className="mt-3 text-sm text-slate-500">Checking manipulation patterns…</p> : null}
    </section>
  )
}
