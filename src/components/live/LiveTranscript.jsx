export default function LiveTranscript({ segments, interimTranscript, listening }) {
  const latest = segments[segments.length - 1]

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Live Transcript</h2>
        {latest ? <p className="text-xs font-medium text-slate-500">Latest {latest.elapsed}</p> : null}
      </div>
      <div className="mt-4 max-h-56 space-y-4 overflow-y-auto pr-1 sm:max-h-80" role="log" aria-label="Live transcript">
        {segments.length === 0 && !interimTranscript ? (
          <p className="py-6 text-sm leading-relaxed text-slate-500">
            {listening
              ? 'Finalized speech will appear here. Words still being heard are not analyzed.'
              : 'Start live protection to transcribe the conversation from your microphone.'}
          </p>
        ) : (
          segments.map((segment) => (
            <article key={segment.id}>
              <p className="text-xs font-medium tabular-nums text-slate-500">{segment.elapsed}</p>
              <p className="mt-1 text-base leading-relaxed text-slate-900">“{segment.text}”</p>
            </article>
          ))
        )}
        {interimTranscript ? (
          <p className="text-sm leading-relaxed text-slate-400 italic" aria-live="polite">
            Hearing: {interimTranscript}
          </p>
        ) : null}
      </div>
    </section>
  )
}
